/* ============================================================
   services.bundle.js - Логика, данные и работа с API
   ============================================================ */

/* ==================== ИСТОЧНИК: _archive/js/storage_optimized.js ==================== */
const Storage = (() => {
  const STORAGE_KEY = 'yt_url_manager';
  const DEFAULT_DATA = { version: 1, settings: { youtubeApiKey: '' }, groups: [], links: [] };
  
  let cachedData = null;
  let isDirty = false;
  let saveTimeout = null;
  
  let forceLocalMode = localStorage.getItem('yt_force_local') === 'true';
  
  let mode = 'local';
  let currentProfileId = null;
  let currentProfileName = '';
  let bootstrapped = false;
  let serverReachable = false;
  let authUser = null;
  let ytTokenCache = { token: '', expiresAt: 0 };
  let ytTokenInflight = null;
  const PROFILE_POINTER_KEY = 'yt_url_manager_profile';
  const API_TIMEOUT_MS = 4000;

  function _uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }); }
  function _now() { return new Date().toISOString(); }

  function _normalize(data) {
    if (!data || typeof data !== 'object') data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    if (!data.version) data.version = 1;
    if (!data.settings) data.settings = { youtubeApiKey: '' };
    if (!Array.isArray(data.groups)) data.groups = [];
    if (!Array.isArray(data.links)) data.links = [];
    data.groups.forEach(group => { if (group && group.title === undefined && group.name !== undefined) group.title = group.name; });
    return data;
  }

  function _loadLocal() {
    if (cachedData) return JSON.parse(JSON.stringify(cachedData));
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { const data = JSON.parse(JSON.stringify(DEFAULT_DATA)); cachedData = data; return data; }
      cachedData = _normalize(JSON.parse(raw));
      return cachedData;
    } catch (e) {
      const data = JSON.parse(JSON.stringify(DEFAULT_DATA)); cachedData = data; return data;
    }
  }

  function _load() { if (cachedData) return JSON.parse(JSON.stringify(cachedData)); return _loadLocal(); }

  function _save() {
    if (!isDirty || !cachedData) return;
    if (mode === 'server' && currentProfileId) {
      _api('/api/profiles/' + encodeURIComponent(currentProfileId), { method: 'PUT', body: JSON.stringify(cachedData) })
        .then(() => { isDirty = false; clearTimeout(saveTimeout); saveTimeout = null; })
        .catch((e) => { console.error('Storage: ошибка сохранения на сервер', e); });
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedData));
      isDirty = false; clearTimeout(saveTimeout); saveTimeout = null; return true;
    } catch (e) { throw e; }
  }

  function _markDirty() { isDirty = true; clearTimeout(saveTimeout); saveTimeout = setTimeout(_save, 500); }

  function flush() {
    if (!isDirty || !cachedData) return false;
    if (mode === 'server' && currentProfileId) {
      const url = '/api/profiles/' + encodeURIComponent(currentProfileId);
      const body = JSON.stringify(cachedData);
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        try { const sent = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' })); if (sent) { isDirty = false; return true; } } catch (e) { }
      }
      try {
        const xhr = new XMLHttpRequest(); xhr.open('PUT', url, false); xhr.setRequestHeader('Content-Type', 'application/json'); xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); xhr.send(body);
        if (xhr.status >= 200 && xhr.status < 300) { isDirty = false; return true; }
      } catch (e) { }
      return false;
    }
    return _save();
  }

  function _api(path, opts) {
    opts = opts || {};
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), API_TIMEOUT_MS) : null;
    const init = { method: opts.method || 'GET' };
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (opts.body) { headers['Content-Type'] = 'application/json'; init.body = opts.body; }
    init.headers = headers;
    if (controller) init.signal = controller.signal;
    return fetch(path, init).then((res) => {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('API ' + path + ': HTTP ' + res.status);
      if (res.status === 204) return null;
      return res.json();
    }, (err) => { if (timer) clearTimeout(timer); throw err; });
  }

  function _rawFetch(path, opts) {
    opts = opts || {};
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), API_TIMEOUT_MS) : null;
    const init = { method: opts.method || 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' } };
    if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = opts.body; }
    if (controller) init.signal = controller.signal;
    return fetch(path, init).then((res) => {
      if (timer) clearTimeout(timer);
      return res;
    }, (err) => { if (timer) clearTimeout(timer); throw err; });
  }

  async function checkAuth() {
    let res;
    try { res = await _rawFetch('/auth/me'); } catch (e) { serverReachable = false; authUser = null; return { reachable: false, user: null }; }
    serverReachable = true;
    if (res.status === 200) {
      try { const u = await res.json(); authUser = (u && u.googleId) ? u : null; } catch (e) { authUser = null; }
    } else { authUser = null; }
    return { reachable: true, user: authUser };
  }

  function getAuthState() { if (!serverReachable) return 'unreachable'; return authUser ? 'authenticated' : 'unauthenticated'; }
  function getAuthUser() { return authUser; }
  function getCurrentUser() { if (authUser) return Promise.resolve(authUser); return checkAuth().then(st => st.user); }
  function isAuthenticated() { return !!(serverReachable && authUser); }
  function isServerReachable() { return serverReachable; }
  
  function login() {
    try { localStorage.removeItem('yt_force_local'); } catch(e){}
    if (typeof window !== 'undefined') window.location.assign('/auth/google/login');
  }

  async function logout() {
    try { await _rawFetch('/auth/logout', { method: 'POST' }); } catch (e) { }
    authUser = null; serverReachable = true;
    ytTokenCache = { token: '', expiresAt: 0 }; ytTokenInflight = null;
    try { localStorage.removeItem(PROFILE_POINTER_KEY); localStorage.removeItem('yt_force_local'); } catch (e) { }
    if (typeof window !== 'undefined') window.location.href = '/';
  }

  function setForceLocal(val) {
    forceLocalMode = val;
    try { localStorage.setItem('yt_force_local', val ? 'true' : 'false'); } catch (e) { }
    window.location.reload(); 
  }

  async function revokeYouTubeAccess() {
    const res = await _rawFetch('/auth/revoke', { method: 'POST' });
    if (res.status !== 200) throw new Error('revoke: HTTP ' + res.status);
    ytTokenCache = { token: '', expiresAt: 0 }; ytTokenInflight = null;
    const st = await checkAuth();
    return st.user;
  }

  async function getYouTubeAccessToken() {
    const now = Date.now();
    if (ytTokenCache.token && ytTokenCache.expiresAt > now + 60 * 1000) return ytTokenCache.token;
    if (ytTokenInflight) return ytTokenInflight;
    ytTokenInflight = (async () => {
      try {
        const res = await _rawFetch('/api/youtube/token');
        if (res.status === 200) {
          const j = await res.json().catch(() => ({}));
          if (j && j.access_token) {
            let exp = 0; try { exp = Number(j.expires_at) * 1000; } catch (e) { exp = 0; }
            ytTokenCache = { token: j.access_token, expiresAt: exp || (now + 30 * 60 * 1000) };
            return ytTokenCache.token;
          }
        }
      } catch (e) { }
      return '';
    })();
    try { return await ytTokenInflight; } finally { ytTokenInflight = null; }
  }

  async function ensureAuthenticated() {
    const st = await checkAuth();
    if (!st.reachable) throw new Error('SERVER_UNREACHABLE');
    if (!st.user) throw new Error('NOT_AUTHENTICATED');
    return st.user;
  }

  function getMode() { return mode; }
  function getCurrentProfileId() { return currentProfileId; }
  function getCurrentProfileName() { return currentProfileName; }
  
  function listProfiles() { return _api('/api/profiles'); }
  function createProfile(name, data) { const payload = { name: (name || '').trim() || 'Профиль' }; if (data) payload.data = data; return _api('/api/profiles', { method: 'POST', body: JSON.stringify(payload) }); }

  async function _enterServerMode(profiles) {
    let remembered = '';
    try { remembered = localStorage.getItem(PROFILE_POINTER_KEY) || ''; } catch (e) { }
    let target = profiles.find(p => p && p.id === remembered) || profiles[0] || null;
    if (!target) target = await createProfile('Профиль', null);
    currentProfileId = target.id;
    currentProfileName = target.name || '';
    try { localStorage.setItem(PROFILE_POINTER_KEY, currentProfileId); } catch (e) { }
    isDirty = false; clearTimeout(saveTimeout); saveTimeout = null;
    cachedData = _normalize(await _api('/api/profiles/' + encodeURIComponent(currentProfileId)));
    return target;
  }

  async function bootstrap() {
    if (bootstrapped) return { mode: mode, profileId: currentProfileId, user: authUser };
    bootstrapped = true;

    const auth = await checkAuth();
    if (!auth.reachable || forceLocalMode) {
      mode = 'local'; currentProfileId = null; currentProfileName = '';
      _loadLocal();
      return { mode: mode, profileId: null, user: forceLocalMode ? auth.user : null };
    }
    if (!auth.user) {
      mode = 'local'; currentProfileId = null; currentProfileName = '';
      isDirty = false; clearTimeout(saveTimeout); saveTimeout = null;
      cachedData = _loadLocal();
      return { mode: mode, profileId: null, user: null };
    }

    let profiles = null;
    try { profiles = await listProfiles(); } catch (e) { }

    if (!Array.isArray(profiles)) {
      mode = 'local'; currentProfileId = null; currentProfileName = '';
      _loadLocal(); return { mode: mode, profileId: null, user: authUser };
    }

    try {
      mode = 'server';
      await _enterServerMode(profiles);
    } catch (e) {
      mode = 'local'; currentProfileId = null; currentProfileName = '';
      cachedData = null; _loadLocal();
    }
    return { mode: mode, profileId: currentProfileId, user: authUser };
  }

  function getSettings() { return _load().settings; }
  function saveSettings(settings) { const data = _load(); Object.assign(data.settings, settings); cachedData = data; _markDirty(); return true; }
  function getMosaicThumbPercent() { const raw = _load().settings.mosaicThumbPercent; const v = parseInt(raw, 10); if (!isFinite(v)) return 50; return Math.min(100, Math.max(10, v)); }
  function getGroups() { return _load().groups; }
  function getGroupById(id) { return _load().groups.find(g => g.id === id) || null; }

  function addGroup(title, parentId) { const data = _load(); const group = { id: _uuid(), title: title.trim(), parentId: parentId || '', createdAt: _now(), updatedAt: _now() }; data.groups.push(group); cachedData = data; _markDirty(); return group; }
  function updateGroup(id, updates) { const data = _load(); const group = data.groups.find(g => g.id === id); if (!group) return null; Object.assign(group, updates, { updatedAt: _now() }); cachedData = data; _markDirty(); return group; }
  function deleteGroup(id) { const data = _load(); data.groups = data.groups.filter(g => g.id !== id); const childIds = _getAllDescendantGroupIds(id, data.groups); childIds.forEach(cid => { data.groups = data.groups.filter(g => g.id !== cid); }); const affectedIds = [id, ...childIds]; data.links.forEach(link => { if (affectedIds.includes(link.groupId)) link.groupId = ''; }); cachedData = data; _markDirty(); return true; }
  function _getAllDescendantGroupIds(parentId, groups) { const ids = []; const children = groups.filter(g => g.parentId === parentId); children.forEach(child => { ids.push(child.id); ids.push(..._getAllDescendantGroupIds(child.id, groups)); }); return ids; }

  function getLinks() { return _load().links; }
  function getLinkById(id) { return _load().links.find(l => l.id === id) || null; }

  function addLink(linkData) {
    const data = _load(); const now = _now();
    const link = { id: _uuid(), url: linkData.url || '', youtubeId: linkData.youtubeId || '', title: linkData.title || '', channelTitle: linkData.channelTitle || '', duration: linkData.duration || '', durationSeconds: linkData.durationSeconds || 0, publishedAt: linkData.publishedAt || '', thumbnailUrl: linkData.thumbnailUrl || '', status: linkData.status || 'queue', groupId: linkData.groupId || '', tags: linkData.tags || [], notes: linkData.notes || '', manualTitle: linkData.manualTitle || false, createdAt: now, updatedAt: now, fetchedAt: linkData.fetchedAt || '', fetchSource: linkData.fetchSource || '', fetchError: linkData.fetchError || '', history: [] };
    data.links.push(link); cachedData = data; _markDirty(); return link;
  }

  function updateLink(id, updates) {
    const data = _load(); const link = data.links.find(l => l.id === id); if (!link) return null;
    const changedFields = {}; const trackedFields = ['title', 'status', 'groupId', 'notes', 'tags', 'channelTitle', 'duration', 'thumbnailUrl'];
    trackedFields.forEach(field => { if (updates[field] !== undefined && JSON.stringify(updates[field]) !== JSON.stringify(link[field])) { changedFields[field] = { old: link[field], new: updates[field] }; } });
    if (Object.keys(changedFields).length > 0) { if (!Array.isArray(link.history)) link.history = []; link.history.push({ timestamp: _now(), changes: changedFields }); }
    Object.assign(link, updates, { updatedAt: _now() }); cachedData = data; _markDirty(); return link;
  }

  function deleteLink(id) { const data = _load(); data.links = data.links.filter(l => l.id !== id); cachedData = data; _markDirty(); return true; }

  function updateLinkMetadata(id, meta) {
    const data = _load(); const link = data.links.find(l => l.id === id); if (!link) return null;
    if (link.manualTitle && meta.title) delete meta.title;
    const changedFields = {}; const metaFields = ['title', 'channelTitle', 'duration', 'durationSeconds', 'publishedAt', 'thumbnailUrl'];
    metaFields.forEach(field => { if (meta[field] !== undefined && JSON.stringify(meta[field]) !== JSON.stringify(link[field])) { changedFields[field] = { old: link[field], new: meta[field] }; } });
    if (Object.keys(changedFields).length > 0) { if (!Array.isArray(link.history)) link.history = []; link.history.push({ timestamp: _now(), changes: changedFields, fetchUpdate: true }); }
    Object.assign(link, meta, { updatedAt: _now(), fetchedAt: _now(), fetchSource: meta.fetchSource || 'oembed', fetchError: meta.fetchError || '' }); cachedData = data; _markDirty(); return link;
  }

  function exportAll() { return _load(); }

  function importJSON(jsonString, replaceAll = false) {
    const imported = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    if (!imported || (!imported.version && !Array.isArray(imported.links) && !Array.isArray(imported.groups))) throw new Error('Invalid format');
    let data; let groupsAdded = 0; let linksAdded = 0; let settingsUpdated = false;
    if (replaceAll) {
      data = JSON.parse(JSON.stringify(DEFAULT_DATA));
      if (imported.version) data.version = imported.version;
      if (imported.settings) data.settings = imported.settings;
      if (Array.isArray(imported.groups)) { data.groups = imported.groups; groupsAdded = imported.groups.length; }
      if (Array.isArray(imported.links)) { data.links = imported.links.map(l => { if (!l.id) l.id = _uuid(); if (!Array.isArray(l.history)) l.history = []; return l; }); linksAdded = data.links.length; }
    } else {
      data = _load();
      if (imported.settings) { Object.assign(data.settings, imported.settings); settingsUpdated = true; }
      if (Array.isArray(imported.groups)) {
        const existingIds = new Set(data.groups.map(g => g.id).filter(Boolean));
        imported.groups.forEach(g => { if (!g || !g.id) return; if (!existingIds.has(g.id)) { if (g.title === undefined && g.name !== undefined) g.title = g.name; data.groups.push(g); existingIds.add(g.id); groupsAdded++; } });
      }
      if (Array.isArray(imported.links)) {
        const existingIds = new Set(data.links.map(l => l.id).filter(Boolean)); const existingVideoIds = new Set(data.links.map(l => l.youtubeId).filter(Boolean));
        imported.links.forEach(l => { if (!l || typeof l !== 'object') return; if (!l.id) l.id = _uuid(); if (!Array.isArray(l.history)) l.history = []; const duplicateById = existingIds.has(l.id); const duplicateByVideoId = l.youtubeId && existingVideoIds.has(l.youtubeId); if (!duplicateById && !duplicateByVideoId) { data.links.push(l); existingIds.add(l.id); if (l.youtubeId) existingVideoIds.add(l.youtubeId); linksAdded++; } });
      }
    }
    cachedData = data; _markDirty(); return { success: true, groupsAdded, linksAdded, settingsUpdated };
  }

  function importBookmarks(htmlString, createNewGroup = false) {
    try {
      const parser = new DOMParser(); const doc = parser.parseFromString(htmlString, 'text/html'); const anchors = doc.querySelectorAll('a[href]'); const results = [];
      anchors.forEach(a => { const url = a.getAttribute('href'); const ytId = YouTube.extractVideoId(url); if (ytId) results.push({ url, youtubeId: ytId, title: a.textContent.trim() || '' }); });
      let added = 0; const data = _load(); const existingVideoIds = new Set(data.links.map(l => l.youtubeId).filter(Boolean)); let newGroupId = '';
      if (createNewGroup) { const groupName = `Закладки от ${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`; newGroupId = _uuid(); data.groups.push({ id: newGroupId, title: groupName, parentId: '', createdAt: _now(), updatedAt: _now() }); }
      results.forEach(r => { if (!existingVideoIds.has(r.youtubeId)) { data.links.push({ id: _uuid(), url: r.url, youtubeId: r.youtubeId, title: r.title, channelTitle: '', duration: '', durationSeconds: 0, publishedAt: '', thumbnailUrl: '', status: 'queue', groupId: newGroupId, tags: [], notes: '', manualTitle: false, createdAt: _now(), updatedAt: _now(), fetchedAt: '', fetchSource: '', fetchError: '', history: [] }); existingVideoIds.add(r.youtubeId); added++; } });
      cachedData = data; _markDirty(); const groupName = createNewGroup ? (data.groups.find(g => g.id === newGroupId) || {}).title : undefined;
      return { success: true, found: results.length, added, groupName };
    } catch (e) { return { success: false, error: e.message }; }
  }

  function _flushOnExit() { try { flush(); } catch (e) { } }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', _flushOnExit);
    window.addEventListener('beforeunload', _flushOnExit);
    if (typeof document !== 'undefined') { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') _flushOnExit(); }); }
  }

  return { getSettings, saveSettings, flush, getMosaicThumbPercent, getGroups, getGroupById, addGroup, updateGroup, deleteGroup, getLinks, getLinkById, addLink, updateLink, deleteLink, updateLinkMetadata, exportAll, importJSON, importBookmarks, bootstrap, getMode, getCurrentProfileId, getCurrentProfileName, listProfiles, createProfile, checkAuth, getAuthState, getAuthUser, getCurrentUser, isAuthenticated, isServerReachable, login, logout, setForceLocal, revokeYouTubeAccess, getYouTubeAccessToken, ensureAuthenticated };
})();
if (typeof window !== 'undefined') { window.Storage = Storage; }


/* ==================== ИСТОЧНИК: _archive/js/youtube_optimized.js ==================== */
const YouTube = (() => {
  const metadataCache = new Map();
  function extractVideoId(url) {
    if (!url || typeof url !== 'string') return null; url = url.trim(); if (metadataCache.has(url)) return metadataCache.get(url);
    let m = url.match(/^https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?|&|$)/); if (m) { metadataCache.set(url, m[1]); return m[1]; }
    m = url.match(/^https?:\/\/(?:www\.|m\.)?(?:music\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:\?|&|$)/); if (m) { metadataCache.set(url, m[1]); return m[1]; }
    m = url.match(/^https?:\/\/(?:www\.|m\.)?(?:music\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?|&|$)/); if (m) { metadataCache.set(url, m[1]); return m[1]; }
    m = url.match(/^https?:\/\/(?:www\.|m\.)?(?:music\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})(?:\?|&|$)/); if (m) { metadataCache.set(url, m[1]); return m[1]; }
    m = url.match(/^https?:\/\/(?:www\.|m\.)?(?:music\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})(?:\?|&|$)/); if (m) { metadataCache.set(url, m[1]); return m[1]; }
    m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|.*[?&]v=))([a-zA-Z0-9_-]{11})(?:&|$|\s)/); if (m) { metadataCache.set(url, m[1]); return m[1]; }
    m = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})$/); if (m) { metadataCache.set(url, m[1]); return m[1]; }
    return null;
  }
  async function fetchMetadata(videoId, accessToken) {
    if (metadataCache.has(videoId)) return metadataCache.get(videoId);
    const result = { title: '', channelTitle: '', duration: '', durationSeconds: 0, publishedAt: '', thumbnailUrl: '', fetchSource: '', fetchError: '' };
    if (!videoId) { result.fetchError = 'No video ID provided'; return result; }
    const promises = [];
    if (accessToken && accessToken.trim()) promises.push(_fetchFromYouTubeAPI(videoId, accessToken.trim()).catch(e => ({ fetchError: 'YouTube API error: ' + e.message })));
    promises.push(_fetchFromOEmbed('https://www.youtube.com/watch?v=' + videoId).catch(e => ({ fetchError: 'oembed error: ' + e.message })));
    promises.push(_fetchFromNoEmbed('https://www.youtube.com/watch?v=' + videoId).catch(e => ({ fetchError: 'noembed error: ' + e.message })));
    try {
      const results = await Promise.allSettled(promises); let found = false; let lastError = '';
      for (const resultItem of results) {
        if (resultItem.status === 'rejected') { lastError = (resultItem.reason && resultItem.reason.message) || 'request rejected'; continue; }
        const value = resultItem.value; if (!value.fetchError) { Object.assign(result, value); result.fetchSource = value.fetchSource || 'api'; found = true; break; }
        lastError = value.fetchError || lastError;
      }
      if (!found) result.fetchError = lastError || 'All fetch methods failed';
    } catch (e) { result.fetchError = 'All fetch methods failed: ' + e.message; }
    metadataCache.set(videoId, result); return result;
  }
  async function _fetchFromYouTubeAPI(videoId, accessToken) {
    const endpoint = 'https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=' + encodeURIComponent(videoId);
    const headers = { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' };
    const resp = await fetch(endpoint, { headers });
    if (!resp.ok) { const errBody = await resp.json().catch(() => ({})); throw new Error(errBody.error ? errBody.error.message : 'HTTP ' + resp.status); }
    const json = await resp.json(); if (!json.items || json.items.length === 0) throw new Error('Video not found');
    const item = json.items[0]; const snippet = item.snippet || {}; const details = item.contentDetails || {}; const duration = _parseISO8601Duration(details.duration || ''); const thumbnail = _getBestThumbnail(snippet.thumbnails);
    return { title: snippet.title || '', channelTitle: snippet.channelTitle || '', duration: duration.formatted, durationSeconds: duration.seconds, publishedAt: snippet.publishedAt || '', thumbnailUrl: thumbnail, fetchSource: 'youtube-oauth' };
  }
  async function _fetchFromOEmbed(videoUrl) {
    const endpoint = 'https://www.youtube.com/oembed?url=' + encodeURIComponent(videoUrl) + '&format=json'; const resp = await fetch(endpoint);
    if (!resp.ok) throw new Error('oembed HTTP ' + resp.status); const json = await resp.json();
    return { title: json.title || '', channelTitle: json.author_name || '', thumbnailUrl: json.thumbnail_url || '' };
  }
  async function _fetchFromNoEmbed(videoUrl) {
    const endpoint = 'https://noembed.com/embed?url=' + encodeURIComponent(videoUrl); const resp = await fetch(endpoint);
    if (!resp.ok) throw new Error('noembed HTTP ' + resp.status); const json = await resp.json();
    return { title: json.title || '', channelTitle: json.author_name || '', thumbnailUrl: json.thumbnail_url || '' };
  }
  function _parseISO8601Duration(iso) {
    if (!iso) return { formatted: '', seconds: 0 };
    const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if (!m) return { formatted: '', seconds: 0 };
    const d = parseInt(m[1] || '0', 10); const h = d * 24 + parseInt(m[2] || '0', 10); const min = parseInt(m[3] || '0', 10); const sec = parseInt(m[4] || '0', 10);
    const total = h * 3600 + min * 60 + sec; const parts = [];
    if (h > 0) parts.push(h + ':'); parts.push((min > 0 || h > 0 ? String(min).padStart(2, '0') : '0') + ':'); parts.push(String(sec).padStart(2, '0'));
    return { formatted: parts.join(''), seconds: total };
  }
  function _getBestThumbnail(thumbnails) { if (!thumbnails) return ''; const order = ['maxres', 'high', 'standard', 'medium', 'default']; for (const key of order) { if (thumbnails[key] && thumbnails[key].url) return thumbnails[key].url; } return ''; }
  function getThumbnailUrl(videoId, quality) { quality = quality || 'mqdefault'; if (!videoId) return ''; return 'https://img.youtube.com/vi/' + videoId + '/' + quality + '.jpg'; }
  function resolveVideoId(link) { if (!link) return ''; if (link.youtubeId && /^[a-zA-Z0-9_-]{11}$/.test(link.youtubeId)) return link.youtubeId; const fromUrl = extractVideoId(link.url || ''); if (fromUrl) return fromUrl; if (link.id && /^[a-zA-Z0-9_-]{11}$/.test(link.id)) return link.id; return ''; }
  function getVideoUrl(videoId) { if (!videoId) return ''; return 'https://www.youtube.com/watch?v=' + videoId; }
  function clearCache() { metadataCache.clear(); }
  return { extractVideoId, fetchMetadata, getThumbnailUrl, getVideoUrl, resolveVideoId, parseDuration: _parseISO8601Duration, clearCache };
})();
if (typeof window !== 'undefined') { window.YouTube = YouTube; }


/* ==================== ИСТОЧНИК: _archive/js/services/logger.js ==================== */
const Logger = (() => {
  const importLogs = []; const exportLogs = [];
  function _timestamp() { return new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function log(moduleName, message, level = 'log') { const timestamp = _timestamp(); const fullMessage = `${timestamp} [${moduleName}] ${message}`; switch (level.toLowerCase()) { case 'error': console.error(fullMessage); break; case 'warn': console.warn(fullMessage); break; case 'info': console.info(fullMessage); break; default: console.log(fullMessage); } }
  function logExport(msg, type = 'info') { const consoleMsg = `[EXPORT] ${msg}`; if (type === 'error') console.error(consoleMsg); else if (type === 'warn') console.warn(consoleMsg); else console.log(consoleMsg); exportLogs.push(consoleMsg); if (exportLogs.length > 100) exportLogs.shift(); const logContainer = document.getElementById('export-log-content'); if (logContainer) { const p = document.createElement('div'); p.textContent = `> ${msg}`; p.style.color = type === 'error' ? '#ff6b6b' : (type === 'warn' ? '#ffd93d' : '#6bff6b'); p.style.fontFamily = 'monospace'; p.style.fontSize = '12px'; p.style.marginBottom = '4px'; logContainer.appendChild(p); logContainer.scrollTop = logContainer.scrollHeight; } }
  function downloadLog() { const lines = []; if (importLogs && importLogs.length > 0) { lines.push('=== IMPORT LOG ==='); lines.push(...importLogs); } if (exportLogs && exportLogs.length > 0) { lines.push(''); lines.push('=== EXPORT LOG ==='); lines.push(...exportLogs); } if (!lines.length) { alert('Лог пуст'); return; } const content = lines.join('\n'); const blob = new Blob([content], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `internal-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
  return { log, logExport, downloadLog };
})();
if (typeof window !== 'undefined') { window.Logger = Logger; }


/* ==================== ИСТОЧНИК: _archive/js/services/export_optimized.js ==================== */
const Export = (() => {
  const STATUS_LABELS = { queue: 'В очереди', later: 'Посмотреть позже', watching: 'Смотрю', watched: 'Просмотрено', archived: 'Архив' };
  function _escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function _escAttr(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _csvField(v) { return v ? '"' + String(v).replace(/"/g, '""') + '"' : '""'; }
  function _dateStamp() { return new Date().toISOString().slice(0, 10); }
  function _downloadFile(content, filename, mime) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
  function _exportCSV(data) {
    return new Promise((resolve) => {
      const BOM = '\uFEFF'; const header = 'Title,Channel,URL,Status,Group,Duration,Published,Notes\n'; let result = BOM + header; let processed = 0; const chunkSize = 100;
      function processChunk() { const start = processed; const end = Math.min(start + chunkSize, data.links.length); for (let i = start; i < end; i++) { const l = data.links[i]; const g = l.groupId ? (Storage.getGroupById(l.groupId) || {}).title || '' : ''; result += [_csvField(l.title), _csvField(l.channelTitle), _csvField(l.url), _csvField(STATUS_LABELS[l.status] || l.status), _csvField(g), _csvField(l.duration), _csvField(l.publishedAt), _csvField(l.notes)].join(',') + '\n'; } processed = end; if (processed < data.links.length) requestAnimationFrame(processChunk); else resolve(result); }
      processChunk();
    });
  }
  function _exportHTML(data) {
    const fragment = document.createDocumentFragment(); const cardsContainer = document.createElement('div'); cardsContainer.style.cssText = 'display: flex; flex-wrap: wrap; justify-content: flex-start;';
    data.links.forEach(l => { const t = l.thumbnailUrl || YouTube.getThumbnailUrl(l.youtubeId); const g = l.groupId ? (Storage.getGroupById(l.groupId) || {}).title || '' : ''; const card = document.createElement('div'); card.style.cssText = 'border:1px solid #444;border-radius:6px;margin:12px;overflow:hidden;max-width:320px;display:inline-block;vertical-align:top'; const link = document.createElement('a'); link.href = _escAttr(l.url); link.target = '_blank'; link.style.display = 'block'; const img = document.createElement('img'); img.src = _escAttr(t); img.style.width = '100%'; img.style.display = 'block'; img.alt = ''; link.appendChild(img); card.appendChild(link); const body = document.createElement('div'); body.style.padding = '8px'; const title = document.createElement('strong'); title.textContent = _escHtml(l.title || 'Без названия'); body.appendChild(title); if (l.channelTitle) { const channel = document.createElement('small'); channel.style.color = '#888'; channel.textContent = _escHtml(l.channelTitle); body.appendChild(document.createElement('br')); body.appendChild(channel); } if (l.duration) { const duration = document.createElement('small'); duration.style.color = '#666'; duration.textContent = ' (' + _escHtml(l.duration) + ')'; body.appendChild(duration); } const meta = document.createElement('small'); meta.style.color = '#666'; meta.textContent = _escHtml(STATUS_LABELS[l.status] || l.status); if (g) { meta.textContent += ' | ' + _escHtml(g); } body.appendChild(document.createElement('br')); body.appendChild(meta); card.appendChild(body); cardsContainer.appendChild(card); });
    fragment.appendChild(cardsContainer); const doc = document.implementation.createHTMLDocument('YT Manager'); doc.body.style.cssText = 'font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;background:#1a1a24;color:#eee'; const h1 = document.createElement('h1'); h1.textContent = 'YouTube URL Manager'; const info = document.createElement('p'); info.textContent = new Date().toLocaleString('ru-RU') + ' — ' + data.links.length + ' видео'; const hr = document.createElement('hr'); doc.body.appendChild(h1); doc.body.appendChild(info); doc.body.appendChild(hr); doc.body.appendChild(fragment); return doc.documentElement.outerHTML;
  }
  async function handleExport(format) {
    const modalId = 'export-progress-modal'; const existingModal = document.getElementById(modalId); if (existingModal) existingModal.remove();
    const modal = document.createElement('div'); modal.id = modalId; modal.className = 'modal-overlay'; modal.innerHTML = `<div class="modal" style="max-width:560px"><div class="modal__header"><h2>Экспорт данных (${_escHtml(format.toUpperCase())})</h2><button class="modal__close" onclick="document.getElementById('${modalId}').remove()">×</button></div><div class="modal__body"><p>Выполняется подготовка данных...</p><div id="export-log-content" style="background:#1e1e1e;padding:10px;height:300px;overflow-y:auto;border-radius:4px;font-size:12px;border:1px solid #333"></div></div></div>`;
    document.body.appendChild(modal); Logger.logExport('Начало экспорта в формате: ' + format); const data = Storage.exportAll(); Logger.logExport('Данные получены из хранилища. Ссылок: ' + data.links.length + ', Групп: ' + data.groups.length);
    let content, filename, mime;
    try {
      switch (format) { case 'json': content = JSON.stringify(data, null, 2); filename = 'yt-manager-' + _dateStamp() + '.json'; mime = 'application/json'; break; case 'csv': content = await _exportCSV(data); filename = 'yt-manager-' + _dateStamp() + '.csv'; mime = 'text/csv;charset=utf-8'; break; case 'html': content = _exportHTML(data); filename = 'yt-manager-' + _dateStamp() + '.html'; mime = 'text/html;charset=utf-8'; break; default: alert('Неизвестный формат экспорта'); modal.remove(); return; }
      _downloadFile(content, filename, mime); setTimeout(() => { const m = document.getElementById(modalId); if (m) m.remove(); }, 2000);
    } catch (error) { alert('Ошибка при экспорте данных: ' + error.message); modal.remove(); }
  }
  return { handleExport };
})();
if (typeof window !== 'undefined') { window.Export = Export; }