#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube URL Manager — сервер
"""

# Версия приложения (серверная сторона: Server-заголовок, User-Agent, /api/health, лог).
# Должна совпадать с window.APP_VERSION в index.html — теперь меняется при каждом выпуске.
APP_VERSION = '8.1'

import base64
import collections
import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import unquote, urlparse

try:
    import configparser
except ImportError:
    configparser = None

try:
    import webbrowser
except ImportError:
    webbrowser = None

# ---------- Пути и конфигурация ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('DATA_DIR') or os.path.join(BASE_DIR, 'data')
TOKENS_DIR = os.path.join(DATA_DIR, 'tokens')
REGISTRY_PATH = os.path.join(DATA_DIR, 'profiles.json')
USERS_PATH = os.path.join(DATA_DIR, 'users.json')
SESSION_SECRET_PATH = os.path.join(DATA_DIR, 'session_secret')
OAUTH_CONFIG_PATH = os.path.join(DATA_DIR, 'oauth_config.json')

HOST = os.environ.get('HOST', '0.0.0.0')
PORT = int(os.environ.get('PORT', '8000'))
PUBLIC_URL = (os.environ.get('PUBLIC_URL') or '').strip()
ADMIN_EMAIL = (os.environ.get('ADMIN_EMAIL') or '').strip().lower()
try:
    SESSION_MAX_AGE_DAYS = max(1, int(os.environ.get('SESSION_MAX_AGE_DAYS', '14')))
except ValueError:
    SESSION_MAX_AGE_DAYS = 14

OAUTH_AUTH_URL = os.environ.get('OAUTH_AUTH_URL', 'https://accounts.google.com/o/oauth2/v2/auth')
OAUTH_TOKEN_URL = os.environ.get('OAUTH_TOKEN_URL', 'https://oauth2.googleapis.com/token')
OAUTH_TOKENINFO_URL = os.environ.get('OAUTH_TOKENINFO_URL', 'https://oauth2.googleapis.com/tokeninfo')
OAUTH_REVOKE_URL = os.environ.get('OAUTH_REVOKE_URL', 'https://oauth2.googleapis.com/revoke')

SCOPES = 'openid email profile https://www.googleapis.com/auth/youtube.readonly'
YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'

_LOCK = threading.RLock()
_ID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
_GOOGLE_ID_RE = re.compile(r'^[A-Za-z0-9_-]{6,64}$')


class OAuthError(Exception):
    pass

# ---------- Утилиты ----------
def _now():
    dt = datetime.now(timezone.utc)
    return dt.strftime('%Y-%m-%dT%H:%M:%S.') + '%03dZ' % (dt.microsecond // 1000)

def _log(msg):
    print('[%s] %s' % (datetime.now().strftime('%H:%M:%S'), msg), flush=True)

def _try_chmod(path, mode):
    try:
        os.chmod(path, mode)
    except OSError:
        pass

def _atomic_write(path, text):
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d or '.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(text)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

def _b64e(raw):
    return base64.b64encode(raw).decode('ascii')

def _b64d(text):
    return base64.b64decode(text.encode('ascii'))

def _sign(payload_b64, secret):
    return _b64e(hmac.new(secret, payload_b64.encode('ascii'), hashlib.sha256).digest())

def _load_session_secret():
    env = (os.environ.get('SESSION_SECRET') or '').strip()
    if env:
        return env.encode('utf-8')
    try:
        with open(SESSION_SECRET_PATH, 'rb') as f:
            raw = f.read().strip()
        if raw:
            try:
                return bytes.fromhex(raw.decode('ascii'))
            except (ValueError, UnicodeDecodeError):
                return raw
    except OSError:
        pass
    secret = secrets.token_bytes(32)
    os.makedirs(DATA_DIR, exist_ok=True)
    _atomic_write(SESSION_SECRET_PATH, secret.hex())
    _try_chmod(SESSION_SECRET_PATH, 0o600)
    _log('[init] сгенерирован session_secret (data/session_secret)')
    return secret

SESSION_SECRET = _load_session_secret()

def _load_oauth_client():
    cid = (os.environ.get('OAUTH_CLIENT_ID') or '').strip()
    csec = (os.environ.get('OAUTH_CLIENT_SECRET') or '').strip()
    if not (cid and csec) and os.path.isfile(OAUTH_CONFIG_PATH):
        try:
            with open(OAUTH_CONFIG_PATH, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
        except (OSError, ValueError):
            cfg = {}
        if isinstance(cfg, dict):
            cid = cid or str(cfg.get('client_id') or '').strip()
            csec = csec or str(cfg.get('client_secret') or '').strip()
    return cid, csec

OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET = _load_oauth_client()

SESSION_COOKIE = 'session'
SESSION_TTL = SESSION_MAX_AGE_DAYS * 86400
STATE_TTL = 600
DENY_TTL = 900

_SESSION_DENY = {}
_SESSION_DENY_LOCK = threading.Lock()
_STATE_STORE = {}
_STATE_LOCK = threading.Lock()

def _prune_denied(now):
    for k in [k for k, v in _SESSION_DENY.items() if v <= now]:
        _SESSION_DENY.pop(k, None)

def _deny_session(sid):
    if not sid:
        return
    now = time.time()
    with _SESSION_DENY_LOCK:
        _prune_denied(now)
        if len(_SESSION_DENY) > 2000:
            items = sorted(_SESSION_DENY.items(), key=lambda kv: kv[1])
            for k, _v in items[:len(_SESSION_DENY) - 1000]:
                _SESSION_DENY.pop(k, None)
        _SESSION_DENY[sid] = now + DENY_TTL

def _issue_session_cookie(google_id):
    sid = secrets.token_urlsafe(24)
    payload = _b64e(json.dumps(
        {'sid': sid, 'uid': google_id, 'exp': int(time.time()) + SESSION_TTL},
        separators=(',', ':')).encode('utf-8'))
    return sid, '%s=%s.%s' % (SESSION_COOKIE, payload, _sign(payload, SESSION_SECRET))

def _parse_session(cookie_header):
    out = {'sid': None, 'uid': None, 'valid': False}
    if not cookie_header:
        return out
    try:
        morsel = SimpleCookie(cookie_header).get(SESSION_COOKIE)
        if not morsel:
            return out
        value = morsel.value
    except Exception:
        return out
    if not isinstance(value, str) or '.' not in value:
        return out
    payload_b64, sig = value.rsplit('.', 1)
    try:
        ok = hmac.compare_digest(_sign(payload_b64, SESSION_SECRET), sig)
    except TypeError:
        ok = False
    if not ok:
        return out
    try:
        data = json.loads(_b64d(payload_b64).decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        return out
    if not isinstance(data, dict):
        return out
    sid, uid, exp = data.get('sid'), data.get('uid'), data.get('exp')
    if not isinstance(sid, str) or not isinstance(uid, str) \
            or not isinstance(exp, (int, float)):
        return out
    now = time.time()
    out['sid'], out['uid'] = sid, uid
    with _SESSION_DENY_LOCK:
        _prune_denied(now)
        denied = sid in _SESSION_DENY
    if exp < now or denied:
        return out
    out['valid'] = True
    return out

def _new_state():
    state = secrets.token_urlsafe(32)
    now = time.time()
    with _STATE_LOCK:
        for s in [s for s, ts in _STATE_STORE.items() if now - ts > STATE_TTL]:
            _STATE_STORE.pop(s, None)
        _STATE_STORE[state] = now
    return state

def _consume_state(state):
    if not isinstance(state, str) or not state:
        return False
    with _STATE_LOCK:
        created = _STATE_STORE.pop(state, None)
    return created is not None and (time.time() - created) <= STATE_TTL

class RateLimiter:
    def __init__(self, limit):
        self.limit = limit
        self._hits = {}
        self._lock = threading.Lock()

    def allow(self, key):
        now = time.monotonic()
        with self._lock:
            dq = self._hits.get(key)
            if dq is None:
                dq = collections.deque()
                self._hits[key] = dq
            while dq and now - dq[0] > 60:
                dq.popleft()
            if len(dq) >= self.limit:
                return False
            dq.append(now)
            if len(self._hits) > 4096:
                for k in [k for k, d in self._hits.items()
                          if not d or now - d[-1] > 120]:
                    self._hits.pop(k, None)
            return True

AUTH_LIMITER = RateLimiter(20)
TOKEN_LIMITER = RateLimiter(60)

def _json_from_bytes(raw):
    try:
        return json.loads(raw.decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        return {}

def _google_request(url, form=None, timeout=15):
    data = urllib.parse.urlencode(form).encode('utf-8') if form else None
    headers = {'User-Agent': 'yt-url-manager/' + APP_VERSION}
    if data is not None:
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, _json_from_bytes(resp.read())
    except urllib.error.HTTPError as e:
        try:
            payload = _json_from_bytes(e.read())
        except Exception:
            payload = {}
        return e.code, payload
    except Exception as e:
        raise OAuthError('network: %s' % type(e).__name__)

def _exchange_code(code, redirect_uri):
    status, data = _google_request(OAUTH_TOKEN_URL, {
        'client_id': OAUTH_CLIENT_ID,
        'client_secret': OAUTH_CLIENT_SECRET,
        'code': code,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code',
    })
    if status != 200 or not data.get('access_token'):
        raise OAuthError('token exchange failed: %s' % (data.get('error') or 'HTTP %s' % status))
    return data

def _refresh_access_token(gid):
    status, data = _google_request(OAUTH_TOKEN_URL, {
        'client_id': OAUTH_CLIENT_ID,
        'client_secret': OAUTH_CLIENT_SECRET,
        'refresh_token': _read_refresh_token(gid),
        'grant_type': 'refresh_token',
    })
    if status != 200 or not data.get('access_token'):
        raise OAuthError('refresh failed: %s' % (data.get('error') or 'HTTP %s' % status))
    return data

def _verify_id_token(id_token):
    url = OAUTH_TOKENINFO_URL + '?' + urllib.parse.urlencode({'id_token': id_token})
    status, info = _google_request(url)
    if status != 200:
        raise OAuthError('tokeninfo: HTTP %s' % status)
    if str(info.get('aud') or '') != OAUTH_CLIENT_ID:
        raise OAuthError('tokeninfo: bad aud')
    if info.get('iss') not in ('accounts.google.com', 'https://accounts.google.com'):
        raise OAuthError('tokeninfo: bad iss')
    try:
        if int(info.get('exp')) < int(time.time()):
            raise OAuthError('tokeninfo: token expired')
    except (TypeError, ValueError):
        raise OAuthError('tokeninfo: bad exp')
    if not _GOOGLE_ID_RE.match(str(info.get('sub') or '')):
        raise OAuthError('tokeninfo: bad sub')
    return info

def _load_users():
    try:
        with open(USERS_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}

def _save_users(users):
    _atomic_write(USERS_PATH, json.dumps(users, ensure_ascii=False, indent=2))

def _token_path(gid):
    if not _GOOGLE_ID_RE.match(gid or ''):
        raise ValueError('invalid google id')
    return os.path.join(TOKENS_DIR, gid + '.json')

def _write_refresh_token(gid, rt):
    path = _token_path(gid)
    _atomic_write(path, json.dumps({'refresh_token': rt, 'updatedAt': _now()}, ensure_ascii=False, indent=2))
    _try_chmod(path, 0o600)

def _read_refresh_token(gid):
    try:
        with open(_token_path(gid), 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (OSError, ValueError):
        return ''
    return str(data.get('refresh_token') or '') if isinstance(data, dict) else ''

def _delete_refresh_token(gid):
    try:
        os.unlink(_token_path(gid))
    except (OSError, ValueError):
        pass

_ACCESS_CACHE = {}
_ACCESS_LOCK = threading.Lock()

def _get_fresh_access_token(gid):
    with _ACCESS_LOCK:
        ent = _ACCESS_CACHE.get(gid)
        if ent and ent['expires_at'] - 60 > time.time():
            return ent['token'], int(ent['expires_at'])
    if not _read_refresh_token(gid):
        raise OAuthError('no_refresh_token')
    data = _refresh_access_token(gid)
    token = data['access_token']
    try:
        ttl = int(data.get('expires_in') or 3600)
    except ValueError:
        ttl = 3600
    expires_at = int(time.time()) + ttl
    with _ACCESS_LOCK:
        _ACCESS_CACHE[gid] = {'token': token, 'expires_at': expires_at}
    return token, expires_at

def _read_registry_inner():
    try:
        with open(REGISTRY_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []

def _write_registry_inner(reg):
    _atomic_write(REGISTRY_PATH, json.dumps(reg, ensure_ascii=False, indent=2))

def _profile_path(pid):
    if not _ID_RE.match(pid or ''):
        raise ValueError('invalid profile id')
    return os.path.join(DATA_DIR, pid + '.json')

def _default_data():
    return {'version': 1, 'settings': {}, 'groups': [], 'links': []}

def _seed_from_windows_files():
    lib_path = os.path.join(BASE_DIR, 'library.json')
    ini_path = os.path.join(BASE_DIR, 'settings.ini')
    if not os.path.isfile(lib_path):
        return None
    try:
        with open(lib_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (OSError, ValueError) as e:
        _log('[seed] library.json не читается: %s' % e)
        return None
    if not isinstance(data, dict):
        data = {}
    data.setdefault('version', 1)
    settings = data.get('settings')
    if not isinstance(settings, dict):
        settings = {}
    settings.setdefault('mosaicThumbPercent', 50)
    data['settings'] = settings
    data.setdefault('groups', [])
    data.setdefault('links', [])

    if configparser is not None and os.path.isfile(ini_path):
        cp = configparser.ConfigParser()
        try:
            cp.read(ini_path, encoding='utf-8')
        except Exception:
            cp = configparser.ConfigParser()
        try:
            v = int(cp.get('mosaic', 'card_width').strip())
            settings['mosaicThumbPercent'] = max(10, min(100, v))
        except (configparser.NoSectionError, configparser.NoOptionError, ValueError, AttributeError):
            pass

    pid = str(uuid.uuid4())
    with _LOCK:
        _atomic_write(_profile_path(pid), json.dumps(data, ensure_ascii=False, indent=2))
        reg = _read_registry_inner()
        if not any(p.get('id') == pid for p in reg):
            reg.append({'id': pid, 'name': 'Windows', 'updatedAt': _now()})
            _write_registry_inner(reg)
    return {'id': pid, 'name': 'Windows'}

def _maybe_seed():
    with _LOCK:
        if _read_registry_inner():
            return False
    return _seed_from_windows_files() is not None

def _cleanup_legacy_keys():
    cleaned = 0
    with _LOCK:
        reg = _read_registry_inner()
        for p in reg:
            try:
                fp = _profile_path(p.get('id') or '')
            except ValueError:
                continue
            try:
                with open(fp, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except (OSError, ValueError):
                continue
            if not isinstance(data, dict):
                continue
            settings = data.get('settings')
            if isinstance(settings, dict) and 'youtubeApiKey' in settings:
                del settings['youtubeApiKey']
                _atomic_write(fp, json.dumps(data, ensure_ascii=False, indent=2))
                cleaned += 1

def _orphan_ids(users, reg):
    owned = set()
    for u in users.values():
        if isinstance(u, dict):
            for pid in (u.get('profiles') or []):
                if isinstance(pid, str):
                    owned.add(pid)
    return [p.get('id') for p in reg if isinstance(p, dict) and p.get('id') and p['id'] not in owned]

def _log_migration_status():
    with _LOCK:
        users = _load_users()
        reg = _read_registry_inner()
    orphans = _orphan_ids(users, reg)

def _maybe_assign_orphans(gid, email):
    if not ADMIN_EMAIL or not email:
        return
    if email.strip().lower() != ADMIN_EMAIL:
        return
    with _LOCK:
        users = _load_users()
        reg = _read_registry_inner()
        orphans = _orphan_ids(users, reg)
        if not orphans:
            return
        me = users.get(gid)
        if not isinstance(me, dict):
            me = {'googleId': gid, 'createdAt': _now(), 'profiles': []}
        prof = list(me.get('profiles') or [])
        for oid in orphans:
            if oid not in prof:
                prof.append(oid)
        me['profiles'] = prof
        users[gid] = me
        _save_users(users)

class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'YTURLM/' + APP_VERSION

    def __init__(self, *args, **kwargs):
        kwargs.setdefault('directory', BASE_DIR)
        super().__init__(*args, **kwargs)
        self._body_read = 0

    DRAIN_LIMIT = 8 * 1024 * 1024

    def _drain_body(self):
        if not getattr(self, 'command', '') or self.headers is None:
            return True
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except (TypeError, ValueError):
            return True
        remaining = length - getattr(self, '_body_read', 0)
        if remaining <= 0:
            return True
        if remaining > self.DRAIN_LIMIT:
            return False
        try:
            while remaining > 0:
                chunk = self.rfile.read(min(remaining, 65536))
                if not chunk:
                    return False
                remaining -= len(chunk)
            return True
        except Exception:
            return False

    def handle_one_request(self):
        self._body_read = 0
        super().handle_one_request()
        if not self._drain_body():
            self.close_connection = True

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code, msg):
        self._json(code, {'error': msg})

    def _read_body(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        self._body_read = 0
        if length <= 0:
            return ''
        try:
            raw = self.rfile.read(length)
            self._body_read = len(raw)
            return raw.decode('utf-8')
        except Exception:
            return ''

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        super().end_headers()

    def log_message(self, fmt, *args):
        try:
            msg = fmt % args
        except Exception:
            msg = str(fmt)
        msg = re.sub(r'\?[^\s"]*', ' <query-redacted>', msg)
        _log('%s %s' % (self.address_string(), msg))

    def _redirect(self, location):
        self.send_response(302)
        self.send_header('Location', location)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _cookie_attrs(self):
        parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=%d' % SESSION_TTL]
        if self._is_https():
            parts.append('Secure')
        return '; '.join(parts)

    def _is_https(self):
        if (self.headers.get('X-Forwarded-Proto') or '').split(',')[0].strip() == 'https':
            return True
        return self.headers.get('X-Forwarded-Ssl') == '1'

    def _redirect_uri(self):
        if PUBLIC_URL:
            return PUBLIC_URL.rstrip('/') + '/auth/google/callback'
        proto = (self.headers.get('X-Forwarded-Proto') or 'http').split(',')[0].strip()
        host = (self.headers.get('X-Forwarded-Host') or self.headers.get('Host')
                or ('localhost:%d' % PORT)).split(',')[0].strip()
        return '%s://%s/auth/google/callback' % (proto, host)

    def _static_allowed(self, path):
        if path in ('/', '/index.html', '/favicon.ico', '/privacy.html', '/terms.html', '/googlef573ead4911ba43f.html'):
            return True
        if not (path.startswith('/css/') or path.startswith('/js/')):
            return False
        if path in ('/css/', '/js/') or '..' in path:
            return False
        full = os.path.realpath(os.path.join(BASE_DIR, path.lstrip('/')))
        root = os.path.realpath(BASE_DIR)
        return full.startswith(root + os.sep)

    def end_headers(self):
        # HTML-документы не кэшируются: в index.html живут версия приложения
        # (window.APP_VERSION) и номера кэша css/js (?v=…). Без этого браузер
        # держит эвристически устаревшую копию и версия/обновления «не меняются».
        # css/js кэшируются как раньше — они версионированы query-параметром.
        # (API-ответы пути /api//auth/ сюда не попадают: у них свой no-store.)
        _p = (self.path or '').split('?', 1)[0]
        if _p == '/' or _p.endswith('.html'):
            self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

    def _session(self):
        return _parse_session(self.headers.get('Cookie'))

    def _current_user(self):
        s = self._session()
        return s['uid'] if s['valid'] else None

    def _owned_ids(self, gid):
        u = _load_users().get(gid)
        if not isinstance(u, dict):
            return set()
        return set(p for p in (u.get('profiles') or []) if isinstance(p, str))

    def _xrw_ok(self):
        return self.headers.get('X-Requested-With') == 'XMLHttpRequest'

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path.startswith('/api/'):
            return self._api_dispatch('GET')
        if path.startswith('/auth/'):
            return self._auth_dispatch('GET')
        if self._static_allowed(path):
            return super().do_GET()
        return self._error(404, 'not found')

    def do_HEAD(self):
        path = unquote(urlparse(self.path).path)
        if self._static_allowed(path):
            return super().do_HEAD()
        self.send_response(404)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_POST(self):
        path = unquote(urlparse(self.path).path)
        if path.startswith('/api/'):
            return self._api_dispatch('POST')
        if path.startswith('/auth/'):
            return self._auth_dispatch('POST')
        return self._error(405, 'method not allowed')

    def do_PUT(self):
        path = unquote(urlparse(self.path).path)
        if path.startswith('/api/'):
            return self._api_dispatch('PUT')
        return self._error(405, 'method not allowed')

    def do_DELETE(self):
        path = unquote(urlparse(self.path).path)
        if path.startswith('/api/'):
            return self._api_dispatch('DELETE')
        return self._error(405, 'method not allowed')

    def _safe_error(self, method, path, e):
        _log('[error] %s %s: %r' % (method, path, e))
        try:
            self._error(500, 'internal error')
        except Exception:
            pass

    def _api_dispatch(self, method):
        path = unquote(urlparse(self.path).path)
        try:
            if path == '/api/health':
                return self._json(200, {'ok': True, 'time': _now(), 'version': APP_VERSION})
            if path == '/api/youtube/token' and method == 'GET':
                return self._api_youtube_token()
            if path == '/api/profiles':
                if method == 'GET':
                    return self._api_list()
                if method == 'POST':
                    return self._api_create()
                return self._error(405, 'method not allowed')
            m = re.match(r'^/api/profiles/([^/]+)$', path)
            if m:
                pid = m.group(1)
                if method == 'GET':
                    return self._api_get(pid)
                if method in ('PUT', 'POST'):
                    return self._api_save(pid, method)
                if method == 'DELETE':
                    return self._api_delete(pid)
                return self._error(405, 'method not allowed')
            return self._error(404, 'not found')
        except Exception as e:
            return self._safe_error(method, path, e)

    def _auth_dispatch(self, method):
        path = unquote(urlparse(self.path).path)
        try:
            if path == '/auth/google/login' and method == 'GET':
                return self._auth_login()
            if path == '/auth/google/callback' and method == 'GET':
                return self._auth_callback()
            if path == '/auth/me' and method == 'GET':
                return self._auth_me()
            if path == '/auth/logout' and method == 'POST':
                return self._auth_logout()
            if path == '/auth/revoke' and method == 'POST':
                return self._auth_revoke()
            return self._error(404, 'not found')
        except OAuthError as e:
            _log('[oauth] %s: %s' % (path, e))
            if path == '/auth/google/callback':
                return self._redirect('/?auth_error=' + urllib.parse.quote(str(e)[:160]))
            return self._error(400, 'auth failed')
        except Exception as e:
            return self._safe_error(method, path, e)

    def _auth_login(self):
        ip = self.client_address[0] if self.client_address else '?'
        if not AUTH_LIMITER.allow(ip):
            return self._error(429, 'too many requests')
        if not OAUTH_CLIENT_ID or not OAUTH_CLIENT_SECRET:
            return self._error(503, 'oauth not configured')
        state = _new_state()
        url = OAUTH_AUTH_URL + '?' + urllib.parse.urlencode({
            'client_id': OAUTH_CLIENT_ID,
            'redirect_uri': self._redirect_uri(),
            'response_type': 'code',
            'scope': SCOPES,
            'access_type': 'offline',
            'prompt': 'consent',
            'include_granted_scopes': 'true',
            'state': state,
        })
        self._redirect(url)

    def _auth_callback(self):
        ip = self.client_address[0] if self.client_address else '?'
        if not AUTH_LIMITER.allow(ip):
            return self._error(429, 'too many requests')
        query = urllib.parse.parse_qs(urlparse(self.path).query)
        err = (query.get('error') or [''])[0]
        if err:
            return self._redirect('/?auth_error=' + urllib.parse.quote(err[:160]))
        code = (query.get('code') or [''])[0]
        state = (query.get('state') or [''])[0]
        if not code:
            return self._error(400, 'missing code')
        if not _consume_state(state):
            return self._error(400, 'invalid state')
        tokens = _exchange_code(code, self._redirect_uri())
        id_token = tokens.get('id_token') or ''
        if not id_token:
            raise OAuthError('no id_token in token response')
        info = _verify_id_token(id_token)
        gid = str(info.get('sub'))
        email = str(info.get('email') or '')
        name = str(info.get('name') or '')
        picture = str(info.get('picture') or '')
        granted_raw = str(tokens.get('scope') or info.get('scope') or '')
        granted = [s for s in granted_raw.split(' ') if s]

        with _LOCK:
            users = _load_users()
            now = _now()
            user = users.get(gid)
            if not isinstance(user, dict):
                user = {'googleId': gid, 'createdAt': now, 'profiles': []}
            user['googleId'] = gid
            user['email'] = email
            user['name'] = name
            user['picture'] = picture
            user['lastLoginAt'] = now
            user['grantedScopes'] = granted
            users[gid] = user
            _save_users(users)
        if tokens.get('refresh_token'):
            _write_refresh_token(gid, tokens['refresh_token'])
        try:
            ttl = int(tokens.get('expires_in') or 3600)
        except ValueError:
            ttl = 3600
        with _ACCESS_LOCK:
            _ACCESS_CACHE[gid] = {'token': tokens['access_token'], 'expires_at': int(time.time()) + ttl}
        _maybe_assign_orphans(gid, email)
        _, cookie = _issue_session_cookie(gid)
        
        # !!! ВОЗВРАЩАЕМ РЕДИРЕКТ НА ГЛАВНУЮ СТРАНИЦУ !!!
        self.send_response(302)
        self.send_header('Location', '/')
        self.send_header('Set-Cookie', cookie + '; ' + self._cookie_attrs())
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _auth_me(self):
        gid = self._current_user()
        if not gid:
            return self._error(401, 'unauthorized')
        u = _load_users().get(gid)
        if not isinstance(u, dict):
            return self._error(401, 'unauthorized')
        self._json(200, {
            'googleId': gid,
            'email': u.get('email') or '',
            'name': u.get('name') or '',
            'picture': u.get('picture') or '',
            'hasYouTubeScope': YOUTUBE_SCOPE in (u.get('grantedScopes') or []),
        })

    def _auth_logout(self):
        s = self._session()
        if s['sid']:
            _deny_session(s['sid'])
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        body = json.dumps({'ok': True}).encode('utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
        self.end_headers()
        self.wfile.write(body)

    def _auth_revoke(self):
        gid = self._current_user()
        if not gid:
            return self._error(401, 'unauthorized')
        rt = ''
        with _LOCK:
            try:
                rt = _read_refresh_token(gid)
            except ValueError:
                rt = ''
        if rt:
            try:
                _google_request(OAUTH_REVOKE_URL, {'token': rt})
            except OAuthError:
                pass
        _delete_refresh_token(gid)
        with _ACCESS_LOCK:
            _ACCESS_CACHE.pop(gid, None)
        with _LOCK:
            users = _load_users()
            u = users.get(gid)
            if isinstance(u, dict):
                u['grantedScopes'] = [s for s in (u.get('grantedScopes') or []) if s != YOUTUBE_SCOPE]
                users[gid] = u
                _save_users(users)
        self._json(200, {'ok': True})

    def _api_youtube_token(self):
        gid = self._current_user()
        if not gid:
            return self._error(401, 'unauthorized')
        if not TOKEN_LIMITER.allow(gid):
            return self._error(429, 'too many requests')
        u = _load_users().get(gid)
        if not isinstance(u, dict) or YOUTUBE_SCOPE not in (u.get('grantedScopes') or []):
            return self._error(403, 'youtube scope not granted')
        try:
            token, expires_at = _get_fresh_access_token(gid)
        except OAuthError:
            return self._error(401, 'token refresh failed')
        self._json(200, {'access_token': token, 'expires_at': expires_at})

    def _api_list(self):
        gid = self._current_user()
        if not gid:
            return self._error(401, 'unauthorized')
        owned = self._owned_ids(gid)
        with _LOCK:
            reg = _read_registry_inner()
        out = []
        for p in reg:
            pid = p.get('id') or ''
            if pid not in owned:
                continue
            item = {'id': pid, 'name': p.get('name', ''), 'updatedAt': p.get('updatedAt', '')}
            try:
                with open(_profile_path(pid), 'r', encoding='utf-8') as f:
                    d = json.load(f)
                item['links'] = len(d.get('links') or []) if isinstance(d, dict) else 0
                item['groups'] = len(d.get('groups') or []) if isinstance(d, dict) else 0
            except (OSError, ValueError):
                item['links'] = 0
                item['groups'] = 0
            out.append(item)
        self._json(200, out)

    def _api_create(self):
        gid = self._current_user()
        if not gid:
            return self._error(401, 'unauthorized')
        if not self._xrw_ok():
            return self._error(403, 'forbidden')
        raw = self._read_body()
        try:
            payload = json.loads(raw) if raw else {}
        except ValueError:
            return self._error(400, 'invalid JSON')
        if not isinstance(payload, dict):
            return self._error(400, 'invalid payload')
        name = str(payload.get('name') or '').strip()[:64] or 'Profile'
        data = payload.get('data')
        if data is None:
            data = _default_data()
        if not isinstance(data, dict):
            return self._error(400, 'invalid data')
        data.setdefault('version', 1)
        data.setdefault('settings', {})
        data.setdefault('groups', [])
        data.setdefault('links', [])
        if isinstance(data.get('settings'), dict):
            data['settings'].pop('youtubeApiKey', None)
        pid = str(uuid.uuid4())
        now = _now()
        with _LOCK:
            _atomic_write(_profile_path(pid), json.dumps(data, ensure_ascii=False, indent=2))
            reg = _read_registry_inner()
            reg.append({'id': pid, 'name': name, 'updatedAt': now})
            _write_registry_inner(reg)
            users = _load_users()
            u = users.get(gid)
            if not isinstance(u, dict):
                u = {'googleId': gid, 'createdAt': now, 'profiles': []}
            prof = list(u.get('profiles') or [])
            if pid not in prof:
                prof.append(pid)
            u['profiles'] = prof
            users[gid] = u
            _save_users(users)
        self._json(201, {'id': pid, 'name': name, 'updatedAt': now})

    def _owned_profile_file(self, gid, pid):
        try:
            fp = _profile_path(pid)
        except ValueError:
            self._error(400, 'invalid profile id')
            return None
        if pid not in self._owned_ids(gid):
            self._error(404, 'profile not found')
            return None
        return fp

    def _api_get(self, pid):
        gid = self._current_user()
        if not gid:
            return self._error(401, 'unauthorized')
        fp = self._owned_profile_file(gid, pid)
        if fp is None:
            return
        with _LOCK:
            try:
                with open(fp, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except (OSError, ValueError):
                return self._error(404, 'profile not found')
        self._json(200, data)

    def _api_save(self, pid, method):
        gid = self._current_user()
        if not gid:
            return self._error(401, 'unauthorized')
        if method == 'PUT' and not self._xrw_ok():
            return self._error(403, 'forbidden')
        fp = self._owned_profile_file(gid, pid)
        if fp is None:
            return
        raw = self._read_body()
        try:
            data = json.loads(raw) if raw else None
        except ValueError:
            return self._error(400, 'invalid JSON')
        if not isinstance(data, dict):
            return self._error(400, 'invalid data')
        if isinstance(data.get('settings'), dict):
            data['settings'].pop('youtubeApiKey', None)
        with _LOCK:
            try:
                with open(fp, 'r', encoding='utf-8') as f:
                    json.load(f)
            except (OSError, ValueError):
                return self._error(404, 'profile not found')
            _atomic_write(fp, json.dumps(data, ensure_ascii=False, indent=2))
            reg = _read_registry_inner()
            for p in reg:
                if p.get('id') == pid:
                    p['updatedAt'] = _now()
            _write_registry_inner(reg)
        self._json(200, {'ok': True, 'id': pid})

    def _api_delete(self, pid):
        gid = self._current_user()
        if not gid:
            return self._error(401, 'unauthorized')
        if not self._xrw_ok():
            return self._error(403, 'forbidden')
        fp = self._owned_profile_file(gid, pid)
        if fp is None:
            return
        with _LOCK:
            try:
                os.unlink(fp)
            except OSError:
                pass
            reg = _read_registry_inner()
            reg = [p for p in reg if p.get('id') != pid]
            _write_registry_inner(reg)
            users = _load_users()
            for u in users.values():
                if isinstance(u, dict) and pid in (u.get('profiles') or []):
                    u['profiles'] = [x for x in u['profiles'] if x != pid]
            _save_users(users)
        self._json(200, {'ok': True})


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(TOKENS_DIR, exist_ok=True)
    _try_chmod(TOKENS_DIR, 0o700)
    _maybe_seed()
    _cleanup_legacy_keys()
    _log_migration_status()
    if not (OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET):
        _log('[init] ВНИМАНИЕ: OAuth не настроен — логин отключен')
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    _log('YouTube URL Manager v' + APP_VERSION + ' — http://localhost:%d (bind %s)' % (PORT, HOST))
    _log('Данные: %s' % DATA_DIR)
    if PUBLIC_URL:
        _log('Публичный URL (OAuth): %s' % PUBLIC_URL)
    if webbrowser is not None and os.environ.get('NO_BROWSER') != '1':
        try:
            webbrowser.open('http://localhost:%d' % PORT)
        except Exception:
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        _log('Сервер остановлен')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()