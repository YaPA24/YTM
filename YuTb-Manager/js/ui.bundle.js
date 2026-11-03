/* ============================================================
   ui.bundle.js - Интерфейс, модальные окна и управление
   Версия этого файла: v27 (правится ТОЛЬКО при изменении этого файла;
   дублирует ?v= у тега <script> в index.html)
   ============================================================ */

/* ==================== ИСТОЧНИК: _archive/js/ui/toast.js ==================== */
const Toast = (() => {
  let toastContainer = null;
  function _getContainer() { if (!toastContainer) { toastContainer = document.createElement('div'); toastContainer.id = 'toast-container'; toastContainer.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 10000; max-width: 300px; pointer-events: none;`; document.body.appendChild(toastContainer); } return toastContainer; }
  function _createToast(message, type = 'info') { const toast = document.createElement('div'); toast.className = 'toast toast--' + (type || 'info'); const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warn' ? '!' : 'i'; const iconEl = document.createElement('span'); iconEl.className = 'toast__icon'; iconEl.textContent = icon; const msgEl = document.createElement('span'); msgEl.className = 'toast__msg'; msgEl.textContent = message; const closeBtn = document.createElement('button'); closeBtn.className = 'toast__close'; closeBtn.type = 'button'; closeBtn.textContent = '✕'; closeBtn.addEventListener('click', () => toast.remove()); toast.appendChild(iconEl); toast.appendChild(msgEl); toast.appendChild(closeBtn); return toast; }
  function show(message, type = 'info') { const container = _getContainer(); const toast = _createToast(message, type); container.appendChild(toast); setTimeout(() => { if (toast.parentNode === container) toast.remove(); }, 3000); }
  // v8.6: постоянный тост (без авто-удаления через 3с) для длинных операций —
  // обновление метаданных; update/setProgress обновляют его на месте, dismiss закрывает.
  function showPersistent(message, type = 'info') { const container = _getContainer(); const toast = _createToast(message, type); container.appendChild(toast); return toast; }
  function update(toastEl, message, type) { if (!toastEl || !toastEl.parentNode) return toastEl; const msgEl = toastEl.querySelector('.toast__msg'); if (msgEl) msgEl.textContent = message; if (type) { toastEl.className = 'toast toast--' + type; const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warn' ? '!' : 'i'; const iconEl = toastEl.querySelector('.toast__icon'); if (iconEl) iconEl.textContent = icon; } return toastEl; }
  function setProgress(toastEl, percent) { if (!toastEl || !toastEl.parentNode) return toastEl; let bar = toastEl.querySelector('.toast__progress'); if (!bar) { bar = document.createElement('span'); bar.className = 'toast__progress'; toastEl.appendChild(bar); } bar.style.width = Math.max(0, Math.min(100, percent || 0)) + '%'; return toastEl; }
  function dismiss(toastEl) { if (toastEl && toastEl.parentNode) toastEl.remove(); }
  function clear() { const container = _getContainer(); container.innerHTML = ''; }
  return { show, showPersistent, update, setProgress, dismiss, clear };
})();
if (typeof window !== 'undefined') { window.Toast = Toast; }


/* ==================== ИСТОЧНИК: _archive/js/ui/modal.js ==================== */
const Modal = (() => {
  const STATUS_LABELS = { queue: 'В очереди', later: 'Посмотреть позже', watching: 'Смотрю', watched: 'Просмотрено', archived: 'Архив' };
  function _escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function _escAttr(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _formatDate(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso; } }
  function _formatDateTime(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; } }

  function _buildGroupOptions(selId) {
    const groups = Storage.getGroups();
    let h = '<option value="">— Без группы —</option>';
    const _r = (pid, ind) => { groups.filter(g => g.parentId === pid).forEach(g => { h += '<option value="' + _escAttr(g.id) + '"' + (g.id === selId ? ' selected' : '') + '>' + '\u00A0\u00A0'.repeat(ind) + _escHtml(g.title) + '</option>'; _r(g.id, ind + 1); }); };
    _r('', 0); return h;
  }

  function _displayValue(field, value) {
    if (field === 'status' && STATUS_LABELS[value]) return STATUS_LABELS[value];
    if (field === 'groupId') { const g = Storage.getGroupById(value); return g ? g.title : ''; }
    if (field === 'tags') return Array.isArray(value) ? value.join(', ') : value;
    if (field === 'thumbnailUrl') return value ? '(обновлено)' : '';
    if (field === 'publishedAt') return _formatDate(value);
    return String(value || '');
  }

  function showAddLinkModal() {
    const currentGroupId = window.Sidebar ? Sidebar.getCurrentGroupId() : '';
    const groupOpts = _buildGroupOptions(currentGroupId);
    const statusOpts = Object.entries(STATUS_LABELS).map(([k, v]) => '<option value="' + k + '">' + _escHtml(v) + '</option>').join('');
    let html = '<div class="modal-overlay" id="addLinkModal"><div class="modal">';
    html += '<div class="modal__header"><h2>Добавить ссылку</h2><button class="modal__close" data-close>&times;</button></div>';
    html += '<div class="modal__body">';
    html += '<div class="form-group"><label>YouTube URL</label><input type="text" id="addUrl" placeholder="https://youtube.com/watch?v=..." autofocus></div>';
    html += '<div class="form-group"><label>Статус</label><select id="addStatus">' + statusOpts + '</select></div>';
    html += '<div class="form-group"><label>Группа</label><select id="addGroup">' + groupOpts + '</select></div>';
    html += '<div class="form-group"><label>Заметка</label><textarea id="addNotes" rows="2" placeholder="Необязательно..."></textarea></div>';
    html += '</div>';
    html += '<div class="modal__footer"><button class="modal-btn" data-close>Отмена</button><button class="modal-btn modal-btn--primary" id="addLinkSave">Добавить</button></div>';
    html += '</div></div>';
    
    document.getElementById('modals').innerHTML = html;
    const overlay = document.getElementById('addLinkModal');
    overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    const urlInput = document.getElementById('addUrl');
    urlInput.focus();
    urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') _doAddLink(overlay); });
    document.getElementById('addLinkSave').addEventListener('click', () => _doAddLink(overlay));
  }

  async function _doAddLink(overlay) {
    const url = document.getElementById('addUrl').value.trim();
    if (!url) { alert('Введите URL'); return; }
    const videoId = YouTube.extractVideoId(url);
    if (!videoId) { alert('Не распознан YouTube URL'); return; }
    if (Storage.getLinks().find(l => l.youtubeId === videoId)) { alert('Уже добавлено'); return; }

    const link = Storage.addLink({
      url, youtubeId: videoId, status: document.getElementById('addStatus').value, groupId: document.getElementById('addGroup').value,
      notes: document.getElementById('addNotes').value.trim(), thumbnailUrl: YouTube.getThumbnailUrl(videoId)
    });

    overlay.remove();
    if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (window.Sidebar) Sidebar.render();
    if (window.Toast) Toast.show('Загружаю метаданные...', 'info');

    try {
      const ytToken = await Storage.getYouTubeAccessToken();
      const meta = await YouTube.fetchMetadata(videoId, ytToken);
      if (meta.title || meta.channelTitle) {
        Storage.updateLinkMetadata(link.id, meta);
        if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (window.Sidebar) Sidebar.render();
        if (window.Toast) Toast.show('Метаданные загружены (' + (meta.fetchSource || '') + ')', 'success');
      }
    } catch (err) { if (window.Toast) Toast.show('Ошибка метаданных', 'error'); }
    if (window.Details) Details.selectLink(link.id);
  }

  // v8.4: режим «создать группу» удалён вместе с кнопкой A2f #menuAddGroupBtn
  // (дублировал «+ Создать папку…» #newFolderModal). Осталось только редактирование
  // папки: переименование/перемещение из контекстного меню папки (rename-folder).
  function showGroupModal(editId) {
    if (!editId) return; const group = Storage.getGroupById(editId); if (!group) return; const groups = Storage.getGroups();
    let parentOpts = '<option value="">— Без родителя —</option>';
    const _r = (pid, indent) => { groups.filter(g => g.parentId === pid).forEach(g => { if (g.id === editId) return; const sel = group.parentId === g.id ? ' selected' : ''; parentOpts += '<option value="' + g.id + '"' + sel + '>' + '\u00A0\u00A0'.repeat(indent) + _escHtml(g.title) + '</option>'; _r(g.id, indent + 1); }); };
    _r('', 0);
    
    let html = '<div class="modal-overlay" id="groupModal"><div class="modal">';
    html += '<div class="modal__header"><h2>Редактировать папку</h2><button class="modal__close" data-close>&times;</button></div>';
    html += '<div class="modal__body"><div class="form-group"><label>Название</label><input type="text" id="grpTitle" value="' + _escAttr(group.title) + '"></div>';
    html += '<div class="form-group"><label>Родительская папка</label><select id="grpParent">' + parentOpts + '</select></div></div>';
    html += '<div class="modal__footer">';
    html += '<button class="modal-btn modal-btn--danger" id="grpDelete">Удалить</button>';
    html += '<button class="modal-btn" data-close>Отмена</button><button class="modal-btn modal-btn--primary" id="grpSave">Сохранить</button>';
    html += '</div></div></div>';
    
    document.getElementById('modals').innerHTML = html;
    const overlay = document.getElementById('groupModal');
    overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    
    document.getElementById('grpSave').addEventListener('click', () => {
      const title = document.getElementById('grpTitle').value.trim(); if (!title) { alert('Введите название'); return; }
      Storage.updateGroup(editId, { title, parentId: document.getElementById('grpParent').value });
      overlay.remove();
      if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (window.Sidebar) Sidebar.render();
      if (window.Toast) Toast.show('Папка обновлена', 'success');
    });
    
    document.getElementById('grpDelete').addEventListener('click', () => {
      Modal.showConfirmModal('Удалить папку?', () => {
        const grp = Storage.getGroupById(editId); const parentId = grp ? grp.parentId : '';
        Storage.deleteGroup(editId); const currentGroupId = window.Sidebar ? Sidebar.getCurrentGroupId() : '';
        if (currentGroupId === editId) { if (window.Sidebar) { Sidebar.setCurrentGroupId(parentId || ''); Sidebar.render(); } if (window.Details) Details.selectLink(''); }
        overlay.remove();
        if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render();
        if (window.Toast) Toast.show('Папка удалена', 'info');
      }, () => {});
    });
  }

  // v8: создание новой папки + немедленное перемещение выбранных видео в неё.
  // Вызывается из контекст-меню «Переместить в...» → «+ Создать папку…» и
  // (с v8.4) из меню папки → «+ Создать папку…» (тогда presetParent = эта папка —
  // создаётся вложенная папка; linkIds пуст — перемещения нет).
  function showNewFolderModal(linkIds, presetParent) {
    const ids = Array.isArray(linkIds) ? linkIds.filter(id => Storage.getLinkById(id)) : [];
    const groups = Storage.getGroups();
    const selectedParent = (presetParent !== undefined && presetParent !== null) ? presetParent : (window.Sidebar ? Sidebar.getCurrentGroupId() : '');
    let parentOpts = '<option value="">— Корень —</option>';
    const _r = (pid, indent) => { groups.filter(g => g.parentId === pid).forEach(g => { const sel = g.id === selectedParent ? ' selected' : ''; parentOpts += '<option value="' + g.id + '"' + sel + '>' + '\u00A0\u00A0'.repeat(indent) + _escHtml(g.title) + '</option>'; _r(g.id, indent + 1); }); };
    _r('', 0);

    let html = '<div class="modal-overlay" id="newFolderModal"><div class="modal modal--sm">';
    html += '<div class="modal__header"><h2>Новая папка</h2><button class="modal__close" data-close>&times;</button></div>';
    html += '<div class="modal__body"><div class="form-group"><label>Название</label><input type="text" id="nfTitle" placeholder="Например: Музыка" autocomplete="off"></div>';
    html += '<div class="form-group"><label>Разместить в</label><select id="nfParent">' + parentOpts + '</select></div>';
    if (ids.length) html += '<div class="form-hint">После создания ' + (ids.length > 1 ? ids.length + ' видео будут перемещены' : 'видео будет перемещено') + ' в эту папку.</div>';
    html += '</div>';
    html += '<div class="modal__footer"><button class="modal-btn" data-close>Отмена</button><button class="modal-btn modal-btn--primary" id="nfSave">' + (ids.length ? 'Создать и переместить' : 'Создать') + '</button></div>';
    html += '</div></div>';

    document.getElementById('modals').innerHTML = html;
    const overlay = document.getElementById('newFolderModal');
    overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    const titleInput = document.getElementById('nfTitle');
    setTimeout(() => { titleInput.focus(); }, 50);
    const save = () => {
      const title = titleInput.value.trim();
      if (!title) { titleInput.focus(); return; }
      const parentId = document.getElementById('nfParent').value;
      const grp = Storage.addGroup(title, parentId);
      overlay.remove();
      ids.forEach(id => Storage.updateLink(id, { groupId: grp.id }));
      if (window.MultiSelect) MultiSelect.clear();
      if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (window.Sidebar) Sidebar.render();
      if (window.Statusbar) Statusbar.update();
      if (window.Toast) Toast.show('Папка «' + title + '» создана' + (ids.length ? ', перемещено: ' + ids.length : ''), 'success');
    };
    document.getElementById('nfSave').addEventListener('click', save);
    titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  }

  function showHistoryModal(id) {
    const link = Storage.getLinkById(id); if (!link) { alert('Выберите видео'); return; }
    const history = link.history || [];
    const FL = { title: 'Название', channelTitle: 'Канал', duration: 'Длительность', publishedAt: 'Дата', thumbnailUrl: 'Превью', status: 'Статус', groupId: 'Группа', notes: 'Заметки', tags: 'Метки' };
    let listHtml = '';
    if (history.length === 0) { listHtml = '<div style="padding:20px;text-align:center;color:var(--text-muted)">История пуста</div>'; }
    else {
      listHtml = '<div class="history-list">';
      history.slice().reverse().forEach(entry => {
        const time = _formatDateTime(entry.timestamp); let changes = '';
        Object.entries(entry.changes || {}).forEach(([field, vals]) => {
          changes += '<div class="history-item__change"><strong>' + _escHtml(FL[field] || field) + ':</strong> ' + _escHtml(_displayValue(field, vals.old) || '(пусто)') + ' &rarr; ' + _escHtml(_displayValue(field, vals.new) || '(пусто)') + (entry.fetchUpdate ? ' <span class="history-item__fetch-badge">fetch</span>' : '') + '</div>';
        });
        listHtml += '<div class="history-item"><div class="history-item__time">' + time + '</div>' + changes + '</div>';
      });
      listHtml += '</div>';
    }
    let html = '<div class="modal-overlay" id="historyModal"><div class="modal">';
    html += '<div class="modal__header"><h2>История: ' + _escHtml(link.title || 'Без названия') + '</h2><button class="modal__close" data-close>&times;</button></div>';
    html += '<div class="modal__body">' + listHtml + '</div><div class="modal__footer"><button class="modal-btn" data-close>Закрыть</button></div>';
    html += '</div></div>';
    document.getElementById('modals').innerHTML = html;
    const overlay = document.getElementById('historyModal');
    overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  // v8.2: «О программе» — пофайловые версии. Правило проекта: версия пишется только
  // в том файле, который меняется: index.html → window.APP_VERSIONS.index,
  // css/js → ?v= в их тегах в index.html, server.py → константа внутри файла.
  // Это окно при выпуске НЕ правится — версии собираются из DOM и /api/health.
  function _tagFileVersion(fileName) {
    const els = document.querySelectorAll('link[rel="stylesheet"], script[src]');
    for (let i = 0; i < els.length; i++) {
      const url = els[i].href || els[i].src || '';
      if (url.indexOf(fileName) !== -1) { const m = url.match(/[?&]v=([^&]+)/); return m ? 'v' + m[1] : '—'; }
    }
    return '—';
  }

  function showAboutModal() {
    const idxV = (window.APP_VERSIONS && window.APP_VERSIONS.index) || '—';
    const rows = [
      ['index.html', _escHtml(idxV)],
      ['css/style_optimized.css', _tagFileVersion('style_optimized.css')],
      ['js/services.bundle.js', _tagFileVersion('services.bundle.js')],
      ['js/ui.bundle.js', _tagFileVersion('ui.bundle.js')],
      ['server.py', '<span id="aboutServerVersion">…</span>']
    ];
    const tableHtml = rows.map(r => '<tr><td class="about-file">' + r[0] + '</td><td class="about-ver">' + r[1] + '</td></tr>').join('');
    let html = '<div class="modal-overlay" id="aboutModal"><div class="modal modal--sm">';
    html += '<div class="modal__header"><h2>О программе</h2><button class="modal__close" data-close>&times;</button></div>';
    html += '<div class="modal__body">';
    html += '<div class="about-app"><strong>YTM Manager</strong><span>Менеджер личной коллекции YouTube-ссылок: папки, статусы, мультивыбор, метаданные, история изменений.</span></div>';
    html += '<table class="about-table"><thead><tr><th>Файл</th><th>Версия</th></tr></thead><tbody>' + tableHtml + '</tbody></table>';
    html += '<div class="form-hint" style="margin-top:12px">Каждый файл несёт свою версию — при выпуске обновляются только изменённые файлы.</div>';
    html += '</div>';
    html += '<div class="modal__footer"><button class="modal-btn" data-close>Закрыть</button></div>';
    html += '</div></div>';
    document.getElementById('modals').innerHTML = html;
    const overlay = document.getElementById('aboutModal');
    overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    // Версия server.py — живая из /api/health; при недоступности сервера — «н/д»
    fetch('/api/health', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status))).then(j => {
      const el = document.getElementById('aboutServerVersion');
      if (el) el.textContent = (j && j.version) ? 'v' + j.version : '—';
    }).catch(() => { const el = document.getElementById('aboutServerVersion'); if (el) el.textContent = 'н/д'; });
  }

  function showSettingsModal() {
    let html = '<div class="modal-overlay" id="settingsModal"><div class="modal">';
    html += '<div class="modal__header"><h2>Настройки</h2><button class="modal__close" data-close>&times;</button></div>';
    html += '<div class="modal__body">';
    html += '<div class="form-group"><label>Доступ к YouTube (OAuth 2.0)</label><div class="auth-status" id="setAuthStatus">Проверка…</div><span class="detail-hint" style="display:block;margin-top:4px">Ключи API не требуются. С scope: название, канал, длительность, дата. Без scope: название, канал, превью (oEmbed).</span></div>';
    html += '<div class="form-group"><div class="setting-label-row"><label for="setMosaicSize">Размер миниатюр в мозаике</label><span class="setting-value" id="setMosaicSizeVal">' + Storage.getMosaicThumbPercent() + '%</span></div><input type="range" id="setMosaicSize" min="10" max="100" step="5" value="' + Storage.getMosaicThumbPercent() + '"></div>';
    html += '<div class="form-group"><button class="modal-btn" id="downloadInternalLogBtn">Скачать внутренний лог</button></div>';
    html += '<div class="form-group"><button class="modal-btn" id="aboutBtn">О программе</button><span class="detail-hint" style="display:block;margin-top:4px">Версии всех файлов приложения: index.html, css, js, server.py.</span></div>';
    html += '<div class="form-group"><button class="modal-btn" id="settingsRefreshMetaBtn">Обновить метаданные</button><span class="detail-hint" style="display:block;margin-top:4px">Обновит названия, каналы, длительность и даты для всех видео (YouTube API / oEmbed).</span></div>';
    html += '</div>';
    html += '<div class="modal__footer"><button class="modal-btn" data-close>Отмена</button><button class="modal-btn modal-btn--primary" id="setSave">Сохранить</button></div>';
    html += '</div></div>';
    
    document.getElementById('modals').innerHTML = html;
    const overlay = document.getElementById('settingsModal');
    overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    
    (async () => {
      const box = document.getElementById('setAuthStatus'); if (!box) return;
      let st = { reachable: false, user: null }; try { st = await Storage.checkAuth(); } catch (e) { }
      if (!st.reachable) { box.innerHTML = '<span class="auth-status__off">Сервер недоступен</span> — данные хранятся локально.'; return; }
      if (!st.user) { box.innerHTML = '<span class="auth-status__off">Не авторизован</span> — войдите через Google.'; return; }
      const scopeOk = !!st.user.hasYouTubeScope;
      let html = '<div class="auth-status__row"><span class="auth-status__dot ' + (scopeOk ? 'auth-status__dot--ok' : 'auth-status__dot--off') + '"></span><span>' + _escHtml(st.user.email || st.user.googleId) + '</span></div>';
      html += '<div class="auth-status__row">' + (scopeOk ? 'YouTube API: <strong>доступ выдан</strong>' : 'YouTube API: <strong class="auth-status__off">доступ не выдан</strong> (метаданные — через oEmbed)') + '</div>';
      if (scopeOk) { html += '<button type="button" class="modal-btn" id="setRevokeYt" style="margin-top:8px">Отозвать доступ к YouTube</button>'; }
      else { html += '<button type="button" class="modal-btn" id="setReloginYt" style="margin-top:8px">Войти заново (выдать доступ)</button>'; }
      box.innerHTML = html;
      const revokeBtn = document.getElementById('setRevokeYt');
      if (revokeBtn) {
        revokeBtn.addEventListener('click', async () => {
          if (typeof confirm === 'function' && !confirm('Отозвать доступ к YouTube? Метаданные будут приходить только через oEmbed. Для восстановления войдите заново.')) return;
          try { await Storage.revokeYouTubeAccess(); if (window.Toast) Toast.show('Доступ к YouTube отозван', 'success'); overlay.remove(); if (window.app) app.refreshAll(); }
          catch (e) { if (window.Toast) Toast.show('Не удалось отозвать: ' + e.message, 'error'); }
        });
      }
      const reloginBtn = document.getElementById('setReloginYt');
      if (reloginBtn) { reloginBtn.addEventListener('click', () => Storage.login()); }
    })();

    const mosaicSizeRange = document.getElementById('setMosaicSize');
    const mosaicSizeVal = document.getElementById('setMosaicSizeVal');
    if (mosaicSizeRange) {
      mosaicSizeRange.addEventListener('input', () => {
        const v = parseInt(mosaicSizeRange.value, 10);
        if (mosaicSizeVal) mosaicSizeVal.textContent = v + '%';
        if (window.Mosaic) Mosaic.setThumbSize(v);
      });
    }

    document.getElementById('setSave').addEventListener('click', () => {
      if (mosaicSizeRange) Storage.saveSettings({ mosaicThumbPercent: parseInt(mosaicSizeRange.value, 10) || 50 });
      if (window.Mosaic) Mosaic.setThumbSize(Storage.getMosaicThumbPercent());
      overlay.remove(); if (window.Toast) Toast.show('Настройки сохранены', 'success');
    });
    document.getElementById('downloadInternalLogBtn').addEventListener('click', () => { if (window.Logger) Logger.downloadLog(); });
    const settingsRefreshMetaBtn = document.getElementById('settingsRefreshMetaBtn');
    if (settingsRefreshMetaBtn) { settingsRefreshMetaBtn.addEventListener('click', () => { if (window.ContextMenu) ContextMenu.refreshAllMeta(); }); }
    const aboutBtn = document.getElementById('aboutBtn');
    if (aboutBtn) aboutBtn.addEventListener('click', () => { Modal.showAboutModal(); });
  }

  function showDataModal() {
    let html = '<div class="modal-overlay" id="dataModal"><div class="modal">';
    html += '<div class="modal__header"><h2>Данные</h2><button class="modal__close" data-close>&times;</button></div>';
    html += '<div class="modal__body">';
    html += '<div style="display:flex; flex-direction:column; gap:10px;">';
    html += '<button class="modal-btn" id="dataExportJson">Экспорт JSON</button>';
    html += '<button class="modal-btn" id="dataExportCsv">Экспорт CSV</button>';
    html += '<button class="modal-btn" id="dataExportHtml">Экспорт HTML</button>';
    html += '<hr style="border:0; border-top:1px solid #444; margin:10px 0;">';
    html += '<button class="modal-btn" id="dataImportJson">Импорт из JSON...</button>';
    html += '<button class="modal-btn" id="dataImportBookmarks">Импорт закладок...</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="modal__footer"><button class="modal-btn" data-close>Закрыть</button></div>';
    html += '</div></div>';
    
    document.getElementById('modals').innerHTML = html;
    const overlay = document.getElementById('dataModal');
    overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    
    document.getElementById('dataExportJson').addEventListener('click', () => { if (window.Export) Export.handleExport('json'); });
    document.getElementById('dataExportCsv').addEventListener('click', () => { if (window.Export) Export.handleExport('csv'); });
    document.getElementById('dataExportHtml').addEventListener('click', () => { if (window.Export) Export.handleExport('html'); });
    
    document.getElementById('dataImportJson').addEventListener('click', () => {
      overlay.remove();
      if (window.app && window.app.triggerImportJson) window.app.triggerImportJson();
    });
    document.getElementById('dataImportBookmarks').addEventListener('click', () => {
      overlay.remove();
      if (window.app && window.app.triggerImportBookmarks) window.app.triggerImportBookmarks();
    });
  }

  function showConfirmModal(message, onConfirm, onCancel = () => {}) {
    const html = `<div class="modal-overlay" id="confirmModal"><div class="modal"><div class="modal__header"><h2>Подтверждение</h2><button class="modal__close" data-close>&times;</button></div><div class="modal__body"><p>${_escHtml(message)}</p></div><div class="modal__footer"><button class="modal-btn" data-close>Нет</button><button class="modal-btn modal-btn--danger" id="confirmYesBtn">Да</button></div></div></div>`;
    document.getElementById('modals').innerHTML = html;
    const overlay = document.getElementById('confirmModal'); const yesBtn = document.getElementById('confirmYesBtn');
    overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { onCancel(); overlay.remove(); }));
    overlay.addEventListener('click', e => { if (e.target === overlay) { onCancel(); overlay.remove(); } });
    yesBtn.addEventListener('click', () => { onConfirm(); overlay.remove(); });
  }

  return { showAddLinkModal, showGroupModal, showNewFolderModal, showHistoryModal, showSettingsModal, showDataModal, showAboutModal, showConfirmModal };
})();
if (typeof window !== 'undefined') { window.Modal = Modal; }


/* ==================== ИСТОЧНИК: _archive/js/ui/sidebar_optimized.js ==================== */
const Sidebar = (() => {
  let currentGroupId = ''; let currentFilter = 'all';
  function getCurrentGroupId() { return currentGroupId; }
  function setCurrentGroupId(id) { currentGroupId = id; }
  function getCurrentFilter() { return currentFilter; }
  function setCurrentFilter(filter) { currentFilter = filter; }
  const FOLDER_SVG = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  const BACK_SVG = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
  function _renderGroup(group) { const count = _countLinksInGroup(group.id); const isSelected = currentGroupId === group.id ? ' active' : ''; let html = '<li class="nav-item' + isSelected + '" data-group-id="' + _escAttr(group.id) + '">'; html += '<div class="nav-item-content"><span class="nav-item-icon">' + FOLDER_SVG + '</span><span class="nav-label">' + _escHtml(group.title) + '</span><span class="nav-count">' + count + '</span></div></li>'; return html; }
  function _renderParentGroup() { const parentGroup = _getParentGroup(); const parentTitle = parentGroup ? parentGroup.title : 'Корень'; let html = '<li class="nav-item nav-item--parent" data-group-id="">'; html += '<div class="nav-item-content"><span class="nav-item-icon">' + BACK_SVG + '</span><span class="nav-label">' + _escHtml(parentTitle) + '</span></div></li>'; return html; }
  function _escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function _escAttr(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _countLinksInGroup(groupId) { const ids = _getGroupAndDescendantIds(groupId); return Storage.getLinks().filter(l => ids.includes(l.groupId)).length; }
  function _getGroupAndDescendantIds(gid) { const groups = Storage.getGroups(); const ids = [gid]; const collect = pid => { groups.filter(g => g.parentId === pid).forEach(g => { ids.push(g.id); collect(g.id); }); }; collect(gid); return ids; }
  function _getParentGroup() { if (!currentGroupId) return null; const currentGroup = Storage.getGroups().find(g => g.id === currentGroupId); if (!currentGroup || !currentGroup.parentId) return null; return Storage.getGroups().find(g => g.id === currentGroup.parentId); }
  function _syncFilterMenu() { document.querySelectorAll('#menuFilter .tb-dropdown__item').forEach(item => { item.classList.toggle('active', item.dataset.filter === currentFilter); }); }
  
  function _closeSidebarOnMobile() {
    if (document.body.classList.contains('sidebar-overlay-mode')) {
      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('sidebarBackdrop');
      if (sidebar) sidebar.classList.add('collapsed');
      if (backdrop) backdrop.classList.remove('active');
    }
  }

  function render() {
    const groupsList = document.getElementById('sidebarGroups'); if (!groupsList) return;
    let html = ''; if (currentGroupId) html += _renderParentGroup();
    const childGroups = Storage.getGroups().filter(g => g.parentId === currentGroupId).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    childGroups.forEach(group => { html += _renderGroup(group); });
    if (!html) html = '<li class="nav-item nav-item--empty"><div class="nav-item-content"><span class="nav-label">Нет папок</span></div></li>';
    groupsList.innerHTML = html;
    groupsList.querySelectorAll('.nav-item').forEach(item => { 
      item.addEventListener('click', () => { 
        const groupId = item.dataset.groupId || ''; 
        _closeSidebarOnMobile();
        if (window.Nav) { window.Nav.goto(groupId); return; } 
        setCurrentGroupId(groupId); setCurrentFilter('all'); _syncFilterMenu(); render(); 
        if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); 
      }); 
    });
  }
  return { getCurrentGroupId, setCurrentGroupId, getCurrentFilter, setCurrentFilter, _syncFilterMenu, render, _closeSidebarOnMobile };
})();
if (typeof window !== 'undefined') { window.Sidebar = Sidebar; }


/* ==================== ИСТОЧНИК: _archive/js/ui/table_optimized.js ==================== */
const Table = (() => {
  const FOLDER_SVG = "<svg class=\"icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"/></svg>";
  const CHEVRON_LEFT_SVG = "<svg class=\"icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><polyline points=\"15 18 9 12 15 6\"/></svg>";
  const STATUS_LABELS = { queue: 'В очереди', later: 'Посмотреть позже', watching: 'Смотрю', watched: 'Просмотрено', archived: 'Архив' };
  
  const COL_VARS = {
    title: '--col-title',
    channelTitle: '--col-channel',
    status: '--col-status',
    durationSeconds: '--col-duration',
    publishedAt: '--col-published'
  };

  let sortArray = []; 
  let searchQuery = ''; 
  let viewMode = 'rows';

  function setSort(field) {
    const idx = sortArray.findIndex(s => s.field === field);
    if (idx === -1) {
      sortArray.push({ field, asc: true });
    } else if (sortArray[idx].asc === true) {
      sortArray[idx].asc = false;
    } else {
      sortArray.splice(idx, 1);
    }
    if (sortArray.length > 3) sortArray.shift();
  }

  function getSortArray() { return sortArray; }
  
  function setSearchQuery(query) { searchQuery = query; } function getSearchQuery() { return searchQuery; }
  function setViewMode(mode) { viewMode = mode; } function getViewMode() { return viewMode; }
  
  function _escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function _escAttr(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _formatDate(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return iso; } }
  function _getGroupAndDescendantIds(gid) { const groups = Storage.getGroups(); const ids = [gid]; const collect = pid => { groups.filter(g => g.parentId === pid).forEach(g => { ids.push(g.id); collect(g.id); }); }; collect(gid); return ids; }
  function _countLinksInGroup(groupId) { const ids = _getGroupAndDescendantIds(groupId); return Storage.getLinks().filter(l => ids.includes(l.groupId)).length; }
  
  function _getFilteredLinks() {
    let links = Storage.getLinks(); 
    const currentGroupId = window.Sidebar ? Sidebar.getCurrentGroupId() : ''; 
    const currentFilter = window.Sidebar ? Sidebar.getCurrentFilter() : 'all';
    
    if (currentGroupId) links = links.filter(l => l.groupId === currentGroupId);
    if (currentFilter !== 'all') links = links.filter(l => l.status === currentFilter);
    if (searchQuery) links = links.filter(l => { 
      const haystack = [l.title, l.channelTitle, l.url, l.status, l.notes, l.youtubeId].concat(l.tags || []).filter(Boolean).join(' ').toLowerCase(); 
      return haystack.includes(searchQuery); 
    });
    
    if (sortArray.length > 0) {
      links.sort((a, b) => {
        for (let s of sortArray) {
          let va = a[s.field]; let vb = b[s.field];
          if (s.field === 'durationSeconds') { va = va || 0; vb = vb || 0; }
          else if (s.field === 'status') { 
            const STATUS_ORDER = ['queue', 'later', 'watching', 'watched', 'archived']; 
            va = STATUS_ORDER.indexOf(va); vb = STATUS_ORDER.indexOf(vb); 
            if (va < 0) va = STATUS_ORDER.length; if (vb < 0) vb = STATUS_ORDER.length; 
          } else { va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase(); }
          
          const cmp = va < vb ? -1 : va > vb ? 1 : 0; 
          if (cmp !== 0) return s.asc ? cmp : -cmp;
        }
        return 0;
      });
    } else { 
      links.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); 
    }
    return links;
  }
  
  function _getChildGroups() { const currentGroupId = window.Sidebar ? Sidebar.getCurrentGroupId() : ''; return Storage.getGroups().filter(g => g.parentId === currentGroupId).sort((a, b) => (a.title || '').localeCompare(b.title || '')); }
  
  function _applySavedWidths() {
    const settings = Storage.getSettings() || {};
    const widths = settings.tableColWidths || {};
    // «Статус», «Длительность», «Дата» зафиксированы: случайно сохранённые
    // (перетаскиванием в старых версиях) ширины этих колонок удаляем из настроек.
    let cleaned = false;
    ['status', 'durationSeconds', 'publishedAt'].forEach(f => {
      if (widths[f] !== undefined) { delete widths[f]; cleaned = true; }
    });
    // Ширина «Название», сохранённая старыми версиями (без флага titleManual),
    // не применяется — колонка остаётся резиновой.
    const titleManual = settings.titleManual === true && Number(widths.title) > 0;
    Object.keys(widths).forEach(field => {
      if (COL_VARS[field] && (field !== 'title' || titleManual)) {
        // Ограничиваем сохранённые ширины разумными рамками
        const w = Math.min(2000, Math.max(80, Number(widths[field]) || 0));
        document.documentElement.style.setProperty(COL_VARS[field], w + 'px');
      }
    });
    if (!titleManual) document.documentElement.style.removeProperty('--col-title');
    document.body.classList.toggle('title-manual', titleManual);
    if (cleaned) Storage.saveSettings({ tableColWidths: widths });
  }

  function _updateSortArrows() {
    document.querySelectorAll('.table-header .th[data-field]').forEach(th => {
      const arrow = th.querySelector('.sort-arrow');
      if (!arrow) return;
      const field = th.dataset.field;
      const idx = sortArray.findIndex(s => s.field === field);
      if (idx === -1) {
        arrow.textContent = '';
      } else {
        const asc = sortArray[idx].asc;
        const num = sortArray.length > 1 ? (idx + 1) : '';
        arrow.textContent = (asc ? '▲' : '▼') + num;
        arrow.style.color = 'var(--accent)';
      }
    });
  }

  function _bindResize() {
    document.querySelectorAll('.th[data-field]').forEach(th => {
      const field = th.dataset.field;
      // Ширины «Статус», «Длительность», «Дата» зафиксированы (данные стандартные):
      // ползунки изменения ширины есть только у «Название» и «Канал».
      if (field !== 'title' && field !== 'channelTitle') return;
      if (th.querySelector('.resizer')) return;
      const resizer = document.createElement('div');
      resizer.className = 'resizer';
      th.appendChild(resizer);
      
      let startX, startWidth;
      const isTitle = field === 'title';
      
      resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        startX = e.clientX;
        startWidth = th.offsetWidth;
        if (isTitle) {
          // Фиксируем текущую отображаемую ширину как базовую — без скачка.
          // Дальше колонка следует за курсором точно, а после отпускания
          // продолжает заполнять свободное место (заданная ширина = минимум),
          // поэтому «Дата» остаётся у правого края без зазора.
          document.documentElement.style.setProperty(COL_VARS.title, Math.round(startWidth) + 'px');
          document.body.classList.add('title-manual', 'title-dragging');
        }
        resizer.classList.add('dragging');
        document.body.classList.add('resizing');
        
        function onMouseMove(ev) {
          const newWidth = startWidth + (ev.clientX - startX);
          if (newWidth >= 80 && COL_VARS[field]) {
            document.documentElement.style.setProperty(COL_VARS[field], Math.round(newWidth) + 'px');
          }
          // Вызываем перерасчет layout, чтобы сайдбар вовремя уходил в оверлей
          if (window.app && window.app.updateLayoutMode) window.app.updateLayoutMode();
        }
        
        function onMouseUp() {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          // Замеряем ширину ДО включения авторастяжения — сохраняем именно
          // ту ширину, до которой дотянул пользователь
          const finalWidth = Math.round(th.offsetWidth);
          resizer.classList.remove('dragging');
          document.body.classList.remove('resizing', 'title-dragging');
          
          const settings = Storage.getSettings() || {};
          const widths = settings.tableColWidths || {};
          widths[field] = finalWidth;
          // Флаг titleManual отличает ручную ширину новой версии
          // от унаследованных значений старых версий приложения
          Storage.saveSettings({ tableColWidths: widths, titleManual: isTitle ? true : (settings.titleManual === true) });
          
          if (window.app && window.app.updateLayoutMode) window.app.updateLayoutMode();
        }
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
      
      // Двойной клик по границе «Название» — сброс к авторежиму (резиновая колонка)
      if (isTitle) {
        resizer.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          document.body.classList.remove('title-manual');
          document.documentElement.style.removeProperty('--col-title');
          const settings = Storage.getSettings() || {};
          const widths = settings.tableColWidths || {};
          delete widths.title;
          Storage.saveSettings({ tableColWidths: widths, titleManual: false });
        });
      }
    });
  }

  function _renderRow(link) {
    const title = link.title || 'Без названия'; const channel = link.channelTitle || ''; const status = STATUS_LABELS[link.status] || link.status || ''; const duration = link.duration || ''; const published = link.publishedAt ? _formatDate(link.publishedAt) : '';
    const selectedLinkId = window.Details ? Details.getSelectedLinkId() : ''; const sel = (link.id === selectedLinkId ? ' selected' : '') + (window.MultiSelect && MultiSelect.has(link.id) ? ' multi-selected' : '');
    const vid = YouTube.resolveVideoId(link); const thumb = link.thumbnailUrl || YouTube.getThumbnailUrl(vid);
    
    let html = '<div class="trow' + sel + '" data-id="' + _escAttr(link.id) + '">';
    html += '<div class="tcell tcell--name" data-field="title">'; if (thumb) html += '<img class="row-thumb" src="' + _escAttr(thumb) + '" alt="" loading="lazy">'; html += _escHtml(title) + '</div>';
    html += '<div class="tcell tcell--channel" data-field="channelTitle">' + _escHtml(channel) + '</div>';
    html += '<div class="tcell tcell--status" data-field="status">' + (status ? '<span class="status-badge status-badge--' + (link.status || 'archived') + '">' + _escHtml(status) + '</span>' : '') + '</div>';
    html += '<div class="tcell tcell--duration" data-field="durationSeconds">' + _escHtml(duration) + '</div>';
    html += '<div class="tcell tcell--published" data-field="publishedAt">' + _escHtml(published) + '</div>';
    html += '</div>'; return html;
  }
  
  function _renderFolderRow(group) { 
    const count = _countLinksInGroup(group.id); 
    let html = '<div class="trow trow--folder" data-folder-id="' + _escAttr(group.id) + '">'; 
    html += '<div class="tcell tcell--name" data-field="title"><span class="folder-icon">' + FOLDER_SVG + '</span>' + _escHtml(group.title) + '</div>'; 
    html += '<div class="tcell tcell--channel" data-field="channelTitle">' + count + ' видео</div>';
    html += '<div class="tcell tcell--status" data-field="status"></div>';
    html += '<div class="tcell tcell--duration" data-field="durationSeconds"></div>';
    html += '<div class="tcell tcell--published" data-field="publishedAt"></div>';
    html += '</div>'; 
    return html; 
  }
  
  function _renderParentFolderRow(parentGroup) { 
    const parentTitle = parentGroup ? parentGroup.title : 'Назад в корень'; 
    let html = '<div class="trow trow--folder trow--parent" data-parent-folder="true">'; 
    html += '<div class="tcell tcell--name" data-field="title"><span class="folder-icon">' + CHEVRON_LEFT_SVG + '</span>' + _escHtml(parentTitle) + '</div>';
    html += '<div class="tcell tcell--channel" data-field="channelTitle"></div>';
    html += '<div class="tcell tcell--status" data-field="status"></div>';
    html += '<div class="tcell tcell--duration" data-field="durationSeconds"></div>';
    html += '<div class="tcell tcell--published" data-field="publishedAt"></div>';
    html += '</div>'; 
    return html; 
  }
  
  function render() {
    const links = _getFilteredLinks(); const childGroups = _getChildGroups();
    const body = document.getElementById('tableBody'); const empty = document.getElementById('tableEmpty'); const wrapper = document.getElementById('tableWrapper');
    if (!body || !wrapper) return;
    
    _applySavedWidths();
    
    const fragment = document.createElement('div'); let html = '';
    try {
      const currentGroupId = window.Sidebar ? Sidebar.getCurrentGroupId() : null; let parentGroup = null;
      if (currentGroupId) { parentGroup = Storage.getGroups().find(g => g.id === currentGroupId)?.parentId; if (parentGroup) parentGroup = Storage.getGroups().find(g => g.id === parentGroup); }
      if (currentGroupId) html += _renderParentFolderRow(parentGroup);
    } catch (error) { }
    childGroups.forEach(g => { html += _renderFolderRow(g); });
    links.forEach(l => { html += _renderRow(l); });
    if (!html.trim()) { body.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');
    fragment.innerHTML = html; body.innerHTML = ''; while (fragment.firstChild) { body.appendChild(fragment.firstChild); }
    
    _updateSortArrows();
    _bindResize();
    
    try {
      const backButtonRow = body.querySelector('.trow--parent[data-parent-folder="true"]');
      if (backButtonRow) { backButtonRow.addEventListener('click', () => { const currentGroupId = window.Sidebar ? Sidebar.getCurrentGroupId() : ''; const current = Storage.getGroupById(currentGroupId); const parentId = current ? current.parentId || '' : ''; if (window.Nav) { window.Nav.goto(parentId); return; } if (window.Sidebar) { Sidebar.setCurrentGroupId(parentId); Sidebar.render(); } render(); }); }
    } catch (error) { }
    body.querySelectorAll('.trow--folder[data-folder-id]').forEach(row => { row.addEventListener('click', () => { if (window.Nav) { window.Nav.goto(row.dataset.folderId); return; } if (window.Sidebar) { Sidebar.setCurrentGroupId(row.dataset.folderId); Sidebar.setCurrentFilter('all'); Sidebar._syncFilterMenu(); Sidebar.render(); } render(); }); });
    body.querySelectorAll('.trow:not(.trow--folder)').forEach(row => {
      row.addEventListener('click', (e) => {
        const id = row.dataset.id;
        // Ctrl/Cmd+клик — переключить строку в мультивыборе, Shift+клик — диапазон от якоря
        if ((e.ctrlKey || e.metaKey) && id && window.MultiSelect) { MultiSelect.toggle(id); return; }
        if (e.shiftKey && id && window.MultiSelect) { MultiSelect.rangeTo(id); return; }
        // Обычный клик — ТОЛЬКО выбор строки: выделение заменяется на эту строку,
        // ничего больше не открывается. «Подробности» — по двойному клику
        // (на сенсорных экранах — по тапу).
        if (window.MultiSelect && !isCoarsePointer()) { MultiSelect.set([id], id); return; }
        if (window.Details) Details.selectLink(id);
      });
      row.addEventListener('dblclick', () => { const id = row.dataset.id; if (id && window.Details) Details.selectLink(id); });
    });
    
    if (window.app && window.app.updateLayoutMode) window.app.updateLayoutMode();
  }

  function updateItem(id) {
    const link = Storage.getLinkById(id); if (!link) return;
    const existing = document.querySelector('.trow[data-id="' + id + '"]'); if (!existing) return;
    const tmp = document.createElement('div'); tmp.innerHTML = _renderRow(link);
    const newRow = tmp.firstElementChild;
    newRow.addEventListener('click', (e) => {
      const id = newRow.dataset.id;
      // Ctrl/Cmd+клик — переключить, Shift+клик — диапазон, обычный клик — только выбор
      if ((e.ctrlKey || e.metaKey) && id && window.MultiSelect) { MultiSelect.toggle(id); return; }
      if (e.shiftKey && id && window.MultiSelect) { MultiSelect.rangeTo(id); return; }
      if (window.MultiSelect && !isCoarsePointer()) { MultiSelect.set([id], id); return; }
      if (window.Details) Details.selectLink(id);
    });
    newRow.addEventListener('dblclick', () => { const id = newRow.dataset.id; if (id && window.Details) Details.selectLink(id); });
    existing.replaceWith(newRow);
  }
  return { setSort, getSortArray, setSearchQuery, getSearchQuery, setViewMode, getViewMode, render, updateItem };
})();
if (typeof window !== 'undefined') { window.Table = Table; }


/* ==================== ИСТОЧНИК: _archive/js/ui/mosaic_optimized.js ==================== */
const Mosaic = (() => {
  const metadataCache = new Map();
  const FOLDER_SVG = "<svg class=\"icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"/></svg>";
  const CHEVRON_LEFT_SVG = "<svg class=\"icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><polyline points=\"15 18 9 12 15 6\"/></svg>";
  function _escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function _escAttr(s) { if (!s) return ''; const AMP = String.fromCharCode(38); return String(s).replace(/&/g, AMP + 'amp;').replace(/"/g, AMP + 'quot;').replace(/'/g, AMP + '#39;').replace(/</g, AMP + 'lt;').replace(/>/g, AMP + 'gt;'); }
  function _getGroupAndDescendantIds(gid) { const groups = Storage.getGroups(); const ids = [gid]; const collect = pid => { groups.filter(g => g.parentId === pid).forEach(g => { ids.push(g.id); collect(g.id); }); }; collect(gid); return ids; }
  function _countLinksInGroup(groupId) { const ids = _getGroupAndDescendantIds(groupId); return Storage.getLinks().filter(l => ids.includes(l.groupId)).length; }
  
  function _renderMosaicCard(link) {
    let thumb, title, duration; const vid = YouTube.resolveVideoId(link);
    if (metadataCache.has(link.id)) { const cached = metadataCache.get(link.id); thumb = cached.thumbnailUrl || link.thumbnailUrl || YouTube.getThumbnailUrl(vid); title = cached.title || link.title || 'Без названия'; duration = cached.duration || link.duration || ''; }
    else { thumb = link.thumbnailUrl || YouTube.getThumbnailUrl(vid); title = link.title || 'Без названия'; duration = link.duration || ''; }
    if (!thumb) thumb = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#3a3a48"/><text x="50%" y="50%" fill="#777788" font-family="sans-serif" font-size="14" text-anchor="middle">Нет превью</text></svg>');
    const selectedLinkId = window.Details ? Details.getSelectedLinkId() : ''; const sel = (link.id === selectedLinkId ? ' selected' : '') + (window.MultiSelect && MultiSelect.has(link.id) ? ' multi-selected' : '');
    let html = '<div class="mosaic-card' + sel + '" data-id="' + _escAttr(link.id) + '">';
    html += '<div class="mosaic-card__thumb"><img src="' + _escAttr(thumb) + '" alt="" loading="lazy">';
    if (duration) html += '<span class="mosaic-card__duration">' + _escHtml(duration) + '</span>';
    html += '</div><div class="mosaic-card__body"><div class="mosaic-card__title" title="' + _escAttr(title) + '">' + _escHtml(title) + '</div></div></div>';
    return html;
  }
  function _renderMosaicFolderCard(group) { const count = _countLinksInGroup(group.id); let html = '<div class="mosaic-card mosaic-card--folder" data-folder-id="' + _escAttr(group.id) + '">'; html += '<div class="mosaic-card__thumb"><span class="mosaic-card__icon mosaic-card__folder-icon">' + FOLDER_SVG + '</span><span class="mosaic-card__count" title="' + count + ' видео">' + count + ' видео</span></div><div class="mosaic-card__body"><div class="mosaic-card__title" title="' + _escAttr(group.title) + '">' + _escHtml(group.title) + '</div></div></div>'; return html; }
  function _renderMosaicParentCard() { let html = '<div class="mosaic-card mosaic-card--parent" data-parent="1">'; html += '<div class="mosaic-card__thumb"><span class="mosaic-card__icon mosaic-card__parent-icon">' + CHEVRON_LEFT_SVG + '</span></div><div class="mosaic-card__body"><div class="mosaic-card__title">Назад</div></div></div>'; return html; }
  
  function render() {
    const currentGroupId = window.Sidebar ? Sidebar.getCurrentGroupId() : ''; const currentFilter = window.Sidebar ? Sidebar.getCurrentFilter() : 'all';
    const searchQuery = window.Table ? Table.getSearchQuery() : ''; const sortArray = window.Table ? Table.getSortArray() : [];
    let links = Storage.getLinks();
    if (currentGroupId) links = links.filter(l => l.groupId === currentGroupId);
    if (currentFilter !== 'all') links = links.filter(l => l.status === currentFilter);
    if (searchQuery) links = links.filter(l => { const haystack = [l.title, l.channelTitle, l.url, l.status, l.notes, l.youtubeId].concat(l.tags || []).filter(Boolean).join(' ').toLowerCase(); return haystack.includes(searchQuery); });
    
    if (sortArray.length > 0) {
      links.sort((a, b) => {
        for (let s of sortArray) {
          let va = a[s.field]; let vb = b[s.field];
          if (s.field === 'durationSeconds') { va = va || 0; vb = vb || 0; }
          else if (s.field === 'status') { 
            const STATUS_ORDER = ['queue', 'later', 'watching', 'watched', 'archived']; 
            va = STATUS_ORDER.indexOf(va); vb = STATUS_ORDER.indexOf(vb); 
            if (va < 0) va = STATUS_ORDER.length; if (vb < 0) vb = STATUS_ORDER.length; 
          } else { va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase(); }
          const cmp = va < vb ? -1 : va > vb ? 1 : 0; 
          if (cmp !== 0) return s.asc ? cmp : -cmp;
        }
        return 0;
      });
    } else { links.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
    
    const childGroups = Storage.getGroups().filter(g => g.parentId === currentGroupId).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    const mosaic = document.getElementById('mosaicView'); const mosaicEmpty = document.getElementById('mosaicEmpty');
    if (!mosaic) return;
    if (typeof Storage.getMosaicThumbPercent === 'function') mosaic.style.setProperty('--mosaic-size', String(Storage.getMosaicThumbPercent()));
    const fragment = document.createElement('div'); let html = '';
    if (currentGroupId) html += _renderMosaicParentCard();
    childGroups.forEach(g => { html += _renderMosaicFolderCard(g); });
    links.forEach(l => { html += _renderMosaicCard(l); });
    if (!html.trim()) { mosaic.innerHTML = ''; if (mosaicEmpty) mosaicEmpty.classList.remove('hidden'); return; }
    if (mosaicEmpty) mosaicEmpty.classList.add('hidden');
    fragment.innerHTML = html; mosaic.innerHTML = ''; while (fragment.firstChild) { mosaic.appendChild(fragment.firstChild); }
  }

  function _bindEvents() {
    const mosaic = document.getElementById('mosaicView'); if (!mosaic || mosaic.dataset.eventsBound) return; mosaic.dataset.eventsBound = '1';
    mosaic.addEventListener('click', (e) => {
      const card = e.target.closest('.mosaic-card'); if (!card) return;
      if (card.classList.contains('mosaic-card--parent')) { const currentGroupId = window.Sidebar ? Sidebar.getCurrentGroupId() : ''; const current = Storage.getGroupById(currentGroupId); const parentId = current ? current.parentId || '' : ''; if (window.Nav) { window.Nav.goto(parentId); return; } if (window.Sidebar) { Sidebar.setCurrentGroupId(parentId); Sidebar.render(); } render(); return; }
      if (card.classList.contains('mosaic-card--folder')) { if (window.Nav) { window.Nav.goto(card.dataset.folderId); return; } if (window.Sidebar) { Sidebar.setCurrentGroupId(card.dataset.folderId); Sidebar.setCurrentFilter('all'); Sidebar._syncFilterMenu(); Sidebar.render(); } render(); return; }
      if (!e.target.closest('a')) { const id = card.dataset.id; if ((e.ctrlKey || e.metaKey) && id && window.MultiSelect) { MultiSelect.toggle(id); return; } if (e.shiftKey && id && window.MultiSelect) { MultiSelect.rangeTo(id); return; } if (window.MultiSelect && !isCoarsePointer()) { MultiSelect.set([id], id); return; } if (window.Details) Details.selectLink(id); }
    });
    mosaic.addEventListener('dblclick', (e) => { const card = e.target.closest('.mosaic-card:not(.mosaic-card--folder):not(.mosaic-card--parent)'); if (!card) return; const id = card.dataset.id; if (id && window.Details) Details.selectLink(id); });
  }

  function updateItem(id) {
    const link = Storage.getLinkById(id); if (!link) return;
    const existing = document.querySelector('.mosaic-card[data-id="' + id + '"]'); if (!existing) return;
    metadataCache.set(id, { title: link.title, duration: link.duration, thumbnailUrl: link.thumbnailUrl });
    const tmp = document.createElement('div'); tmp.innerHTML = _renderMosaicCard(link);
    const newCard = tmp.firstElementChild; existing.replaceWith(newCard);
  }

  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _bindEvents); else _bindEvents(); }

  function setThumbSize(percent) { const mosaic = document.getElementById('mosaicView'); if (!mosaic) return; let p = parseInt(percent, 10); if (!isFinite(p)) p = 50; p = Math.min(100, Math.max(10, p)); mosaic.style.setProperty('--mosaic-size', String(p)); }
  return { render, updateItem, setThumbSize };
})();
if (typeof window !== 'undefined') { window.Mosaic = Mosaic; }


/* ==================== ИСТОЧНИК: _archive/js/ui/details_optimized.js ==================== */
const Details = (() => {
  let selectedLinkId = null; let currentLink = null;
  const STATUS_LABELS = { queue: 'В очереди', later: 'Посмотреть позже', watching: 'Смотрю', watched: 'Просмотрено', archived: 'Архив' };
  const PLACEHOLDER_THUMB = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#3a3a48"/><text x="50%" y="50%" fill="#777788" font-family="sans-serif" font-size="14" text-anchor="middle">Нет превью</text></svg>');
  function getSelectedLinkId() { return selectedLinkId; }
  function selectLink(id, suppressShow) {
    selectedLinkId = id || null; currentLink = id ? Storage.getLinkById(id) : null;
    if (currentLink && !currentLink.youtubeId) { const vid = YouTube.resolveVideoId(currentLink); if (vid) { currentLink.youtubeId = vid; if (!currentLink.thumbnailUrl) currentLink.thumbnailUrl = YouTube.getThumbnailUrl(vid); Storage.updateLink(currentLink.id, { youtubeId: vid, thumbnailUrl: currentLink.thumbnailUrl }); } }
    document.querySelectorAll('.trow.selected, .mosaic-card.selected').forEach(el => el.classList.remove('selected'));
    if (selectedLinkId) { const row = document.querySelector('.trow[data-id="' + selectedLinkId + '"]'); if (row) row.classList.add('selected'); const card = document.querySelector('.mosaic-card[data-id="' + selectedLinkId + '"]'); if (card) card.classList.add('selected'); }
    if (selectedLinkId && window.Nav && typeof Nav.gotoLink === 'function') { Nav.gotoLink(selectedLinkId); }
    if (suppressShow) return;
    if (currentLink) { _renderDetails(); } else { _hidePanel(); }
    if (window.Statusbar) Statusbar.update();
  }
  function showPanel(id) { selectLink(id || selectedLinkId, false); }
  function _hidePanel() { const detailsPanel = document.getElementById('detailsPanel'); const resizeHandle = document.getElementById('resizeHandleV'); if (detailsPanel) { detailsPanel.classList.add('hidden'); detailsPanel.classList.remove('open'); } if (resizeHandle) resizeHandle.classList.add('hidden'); }
  
  function _renderDetails() {
    if (!currentLink) return; const detailsPanel = document.getElementById('detailsPanel'); if (!detailsPanel) return;
    detailsPanel.classList.remove('hidden'); detailsPanel.classList.add('open'); const resizeHandle = document.getElementById('resizeHandleV'); if (resizeHandle) resizeHandle.classList.remove('hidden');
    const statusOptions = Object.entries(STATUS_LABELS).map(([k, v]) => '<option value="' + k + '"' + (currentLink.status === k ? ' selected' : '') + '>' + _escHtml(v) + '</option>').join('');
    const vid = currentLink.youtubeId || YouTube.resolveVideoId(currentLink); const thumbUrl = currentLink.thumbnailUrl || YouTube.getThumbnailUrl(vid) || PLACEHOLDER_THUMB;
    const html = `<div class="details-header"><h2>Подробности</h2><button class="details-close" title="Закрыть"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="details-body"><div class="details-section"><div class="details-item details-item--thumb"><img id="detailsThumb" src="${_escAttr(thumbUrl)}" alt=""></div><div class="details-item"><div class="details-label">Название</div><div class="details-value">${_escHtml(currentLink.title || 'Без названия')}</div></div><div class="details-item"><div class="details-label">Канал</div><div class="details-value">${_escHtml(currentLink.channelTitle || 'Не указано')}</div></div><div class="details-item"><div class="details-label">URL</div><div class="details-value"><a href="${_escAttr(currentLink.url)}" target="_blank">${_escHtml(currentLink.url)}</a></div></div><div class="details-item"><div class="details-label">Статус</div><div class="details-value"><select id="detailsStatus">${statusOptions}</select></div></div><div class="details-item"><div class="details-label">Группа</div><div class="details-value"><select id="detailsGroup"><option value="">Без группы</option>${_renderGroupOptions()}</select></div></div><div class="details-item"><div class="details-label">Длительность</div><div class="details-value">${_escHtml(currentLink.duration || 'Не указано')}</div></div><div class="details-item"><div class="details-label">Дата публикации</div><div class="details-value">${_escHtml(currentLink.publishedAt || 'Не указано')}</div></div><div class="details-item"><div class="details-label">Метки</div><div class="details-value"><input type="text" id="detailsTags" value="${_escAttr(currentLink.tags ? currentLink.tags.join(', ') : '')}" placeholder="Введите метки через запятую"></div></div><div class="details-item"><div class="details-label">Заметки</div><div class="details-value"><textarea id="detailsNotes" rows="4">${_escHtml(currentLink.notes || '')}</textarea></div></div></div><div class="details-actions"><button id="saveDetails" class="btn btn-primary">Сохранить</button><button id="cancelDetails" class="btn btn-secondary">Отмена</button></div></div>`;
    detailsPanel.innerHTML = html;
    if (resizeHandle) detailsPanel.appendChild(resizeHandle);
    detailsPanel.querySelector('.details-close').addEventListener('click', _hidePanel);
    document.getElementById('saveDetails').addEventListener('click', _saveDetails);
    document.getElementById('cancelDetails').addEventListener('click', () => { _hidePanel(); selectLink('', true); });
  }
  function _renderGroupOptions() { const groups = Storage.getGroups(); let html = ''; function renderGroups(parentId = '', level = 0) { groups.filter(g => g.parentId === parentId).forEach(group => { const indent = '  '.repeat(level); const selected = currentLink.groupId === group.id ? 'selected' : ''; html += '<option value="' + _escAttr(group.id) + '" ' + selected + '>' + _escHtml(indent + group.title) + '</option>'; renderGroups(group.id, level + 1); }); } renderGroups(); return html; }
  function _saveDetails() {
    if (!currentLink) return; const status = document.getElementById('detailsStatus').value; const groupId = document.getElementById('detailsGroup').value; const tagsInput = document.getElementById('detailsTags').value; const notes = document.getElementById('detailsNotes').value; const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
    Storage.updateLink(currentLink.id, { status, groupId, tags, notes }); _refreshAll(); if (window.Toast) Toast.show('Изменения сохранены', 'success');
  }
  function _refreshAll() { if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (window.Sidebar) Sidebar.render(); }
  function _escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function _escAttr(s) { if (!s) return ''; const AMP = String.fromCharCode(38); return String(s).replace(/&/g, AMP + 'amp;').replace(/"/g, AMP + 'quot;').replace(/'/g, AMP + '#39;').replace(/</g, AMP + 'lt;').replace(/>/g, AMP + 'gt;'); }
  return { getSelectedLinkId, selectLink, showPanel };
})();
if (typeof window !== 'undefined') { window.Details = Details; }


/* Сенсорный экран (телефон/планшет): тап открывает «Подробности»,
   мультивыбор и двойной клик — только для мыши. */
function isCoarsePointer() { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); }

/* ==================== МУЛЬТИВЫБОР СТРОК (таблица/мозаика) ====================
   Обычный клик — только выбор строки (замена выделения), Ctrl/Cmd+клик —
   добавить/убрать строку, Shift+клик — диапазон от якоря, двойной клик —
   «Подробности», правый клик по выделенной строке — батч-контекстное меню. */
const MultiSelect = (() => {
  const _ids = new Set(); let _anchorId = '';
  function has(id) { return _ids.has(id); }
  function count() { return _ids.size; }
  function getIds() { return Array.from(_ids); }
  function setAnchor(id) { _anchorId = id || ''; }
  function clear() { if (_ids.size === 0) { return; } _ids.clear(); _anchorId = ''; _syncDom(); }
  function set(ids, anchorId) { _ids.clear(); (ids || []).forEach(id => _ids.add(id)); _anchorId = anchorId || ''; _syncDom(); }
  function toggle(id) { if (!id) return; if (_ids.has(id)) _ids.delete(id); else { _ids.add(id); _anchorId = id; } _syncDom(); }
  function rangeTo(id) {
    if (!id) return;
    let visible = [];
    const tw = document.getElementById('tableWrapper');
    if (tw && !tw.classList.contains('hidden')) visible = Array.from(document.querySelectorAll('#tableBody .trow[data-id]')).map(el => el.dataset.id);
    else visible = Array.from(document.querySelectorAll('#mosaicView .mosaic-card[data-id]')).map(el => el.dataset.id);
    if (!visible.includes(id)) return;
    if (!_anchorId || !visible.includes(_anchorId)) { _ids.clear(); _ids.add(id); _anchorId = id; _syncDom(); return; }
    const i1 = visible.indexOf(_anchorId), i2 = visible.indexOf(id); const from = Math.min(i1, i2), to = Math.max(i1, i2);
    _ids.clear(); for (let i = from; i <= to; i++) _ids.add(visible[i]);
    _syncDom();
  }
  function _syncDom() {
    document.querySelectorAll('.trow[data-id], .mosaic-card[data-id]').forEach(el => { el.classList.toggle('multi-selected', _ids.has(el.dataset.id)); });
    if (window.Statusbar) Statusbar.update();
  }
  return { has, count, getIds, set, setAnchor, toggle, rangeTo, clear };
})();
if (typeof window !== 'undefined') { window.MultiSelect = MultiSelect; }


/* ==================== ИСТОЧНИК: _archive/js/ui/context-menu.js ====================
   v8: батч-режим (действия над всеми выделенными строками), подменю
   «Статус в...» и «+ Создать папку...» внутри «Переместить в...». */
const ContextMenu = (() => {
  const STATUS_LABELS = { queue: 'В очереди', later: 'Посмотреть позже', watching: 'Смотрю', watched: 'Просмотрено', archived: 'Архив' };
  let ctxTargetId = ''; let ctxTargetIsFolder = false; let ctxTargetIds = [];
  function _escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function _validIds() { return ctxTargetIds.filter(id => Storage.getLinkById(id)); }
  function _closeMenu() { const m = document.getElementById('ctxMenu'); if (m) m.classList.remove('open'); const s1 = document.getElementById('ctxStatusSubmenu'); if (s1) s1.classList.remove('open', 'flip'); const s2 = document.getElementById('ctxMoveSubmenu'); if (s2) s2.classList.remove('open', 'flip'); }
  function _refreshViews() {
    // Полное обновление через app.refreshAll: рендеры + счётчики сайдбара + хлебные крошки
    if (window.app && window.app.refreshAll) { window.app.refreshAll(); return; }
    if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (window.Sidebar) Sidebar.render(); if (window.Statusbar) Statusbar.update();
  }
  function _syncDetailsFor(ids) { const selId = window.Details ? Details.getSelectedLinkId() : ''; const detailsPanel = document.getElementById('detailsPanel'); if (window.Details && selId && ids.includes(selId) && detailsPanel && !detailsPanel.classList.contains('hidden')) { Details.showPanel(selId); } }

  function _populateStatusSubmenu() {
    const sub = document.getElementById('ctxStatusSubmenu'); if (!sub) return;
    const ids = _validIds();
    const first = ids.length ? Storage.getLinkById(ids[0]) : null;
    const allSame = ids.length > 0 && ids.every(id => (Storage.getLinkById(id) || {}).status === (first || {}).status);
    const current = allSame && first ? first.status : null;
    let html = '';
    Object.entries(STATUS_LABELS).forEach(([k, v]) => { const cls = k === current ? ' class="ctx-menu__item active"' : ' class="ctx-menu__item"'; html += '<button' + cls + ' data-set-status="' + k + '">' + _escHtml(v) + '</button>'; });
    sub.innerHTML = html;
    sub.querySelectorAll('[data-set-status]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation(); const status = btn.dataset.setStatus; const ids2 = _validIds(); if (!ids2.length) return;
        let changed = 0; ids2.forEach(id => { const l = Storage.getLinkById(id); if (l && l.status !== status) { Storage.updateLink(id, { status }); changed++; } });
        if (window.MultiSelect) MultiSelect.clear();
        _closeMenu(); _refreshViews(); _syncDetailsFor(ids2);
        if (window.Toast) Toast.show(changed > 0 ? 'Статус: ' + STATUS_LABELS[status] + (ids2.length > 1 ? ' (' + ids2.length + ')' : '') : 'Статус уже установлен', changed > 0 ? 'success' : 'info');
      });
    });
  }

  function _populateMoveSubmenu() {
    const sub = document.getElementById('ctxMoveSubmenu'); if (!sub) return;
    const ids = _validIds(); const link = Storage.getLinkById(ctxTargetId); const currentGroupIdLink = link ? link.groupId : ''; const groups = Storage.getGroups();
    const sameGroup = ids.length > 0 && ids.every(id => { const l = Storage.getLinkById(id); return (l ? l.groupId : '') === currentGroupIdLink; });
    let html = '<button class="ctx-menu__item ctx-menu__item--new" data-create-folder>+ Создать папку…</button><div class="ctx-menu__divider"></div>';
    const noGroupSel = sameGroup && currentGroupIdLink === '' ? ' class="ctx-menu__item active"' : ' class="ctx-menu__item"'; html += '<button' + noGroupSel + ' data-move-group="">— Без группы —</button>';
    const addGroups = (pid, indent) => { groups.filter(g => g.parentId === pid).forEach(g => { const isCurrent = sameGroup && g.id === currentGroupIdLink; const cls = isCurrent ? ' class="ctx-menu__item active"' : ' class="ctx-menu__item"'; const prefix = '\u00A0\u00A0'.repeat(indent); html += '<button' + cls + ' data-move-group="' + g.id + '">' + prefix + _escHtml(g.title) + '</button>'; addGroups(g.id, indent + 1); }); };
    addGroups('', 0); sub.innerHTML = html;
    const createBtn = sub.querySelector('[data-create-folder]');
    if (createBtn) createBtn.addEventListener('click', e => { e.stopPropagation(); const ids2 = _validIds(); _closeMenu(); if (window.Modal) Modal.showNewFolderModal(ids2); });
    sub.querySelectorAll('[data-move-group]').forEach(btn => { btn.addEventListener('click', e => { e.stopPropagation(); const groupId = btn.dataset.moveGroup; const ids2 = _validIds(); if (!ids2.length) return; ids2.forEach(id => Storage.updateLink(id, { groupId })); if (window.MultiSelect) MultiSelect.clear(); _closeMenu(); _refreshViews(); _syncDetailsFor(ids2); const groupName = groupId ? (Storage.getGroupById(groupId) || {}).title || groupId : 'без группы'; if (window.Toast) Toast.show('Перемещено в: ' + groupName + (ids2.length > 1 ? ' (' + ids2.length + ')' : ''), 'success'); }); });
  }

  function bind() {
    const ctxMenu = document.getElementById('ctxMenu'); if (!ctxMenu) return;
    const moveBtn = document.getElementById('ctxMoveToFolder'); const moveSub = document.getElementById('ctxMoveSubmenu');
    const linkSection = ctxMenu.querySelector('.ctx-link-section'); const folderSection = ctxMenu.querySelector('.ctx-folder-section');
    const tableBody = document.getElementById('tableBody'); const mosaicView = document.getElementById('mosaicView');
    if (tableBody) {
      tableBody.addEventListener('contextmenu', e => {
        if (e.target.closest('.trow--parent')) return;
        const folderRow = e.target.closest('.trow--folder'); const linkRow = folderRow ? null : e.target.closest('.trow');
        if (folderRow) { e.preventDefault(); if (window.MultiSelect) MultiSelect.clear(); ctxTargetId = folderRow.dataset.folderId; ctxTargetIds = [ctxTargetId]; ctxTargetIsFolder = true; _showCtxMenu(e.clientX, e.clientY, true); }
        else if (linkRow) {
          e.preventDefault(); const id = linkRow.dataset.id;
          // Правый клик по выделенной строке (в мультивыборе) — меню на ВСЕ выделенные,
          // включая первую (якорную); правый клик мимо выделения — одиночный режим
          const inMulti = !!(window.MultiSelect && MultiSelect.has(id));
          if (window.MultiSelect && !MultiSelect.has(id)) MultiSelect.clear();
          if (!inMulti && window.Details) Details.selectLink(id, true);
          ctxTargetId = id; ctxTargetIds = inMulti ? MultiSelect.getIds() : [id]; ctxTargetIsFolder = false;
          _showCtxMenu(e.clientX, e.clientY, false);
        }
      });
    }
    if (mosaicView) {
      mosaicView.addEventListener('contextmenu', e => {
        const folderCard = e.target.closest('.mosaic-card--folder'); const videoCard = folderCard ? null : e.target.closest('.mosaic-card:not(.mosaic-card--parent)');
        if (folderCard) { e.preventDefault(); if (window.MultiSelect) MultiSelect.clear(); ctxTargetId = folderCard.dataset.folderId; ctxTargetIds = [ctxTargetId]; ctxTargetIsFolder = true; _showCtxMenu(e.clientX, e.clientY, true); }
        else if (videoCard) {
          e.preventDefault(); const id = videoCard.dataset.id;
          const inMulti = !!(window.MultiSelect && MultiSelect.has(id));
          if (window.MultiSelect && !MultiSelect.has(id)) MultiSelect.clear();
          if (!inMulti && window.Details) Details.selectLink(id, true);
          ctxTargetId = id; ctxTargetIds = inMulti ? MultiSelect.getIds() : [id]; ctxTargetIsFolder = false;
          _showCtxMenu(e.clientX, e.clientY, false);
        }
      });
    }
    function _showCtxMenu(x, y, isFolder) {
      if (linkSection) linkSection.classList.toggle('hidden', isFolder); if (folderSection) folderSection.classList.toggle('hidden', !isFolder);
      // Батч-режим: заголовок «Выбрано: N» + скрытие одиночных действий
      const batch = !isFolder && ctxTargetIds.length > 1;
      const batchTitle = document.getElementById('ctxBatchTitle');
      if (batchTitle) { batchTitle.classList.toggle('hidden', !batch); if (batch) batchTitle.textContent = 'Выбрано: ' + ctxTargetIds.length; }
      ctxMenu.classList.toggle('ctx-menu--batch', batch);
      ctxMenu.querySelectorAll('[data-single-only]').forEach(el => el.classList.toggle('hidden', batch));
      if (!isFolder) { _populateStatusSubmenu(); _populateMoveSubmenu(); }
      if (moveSub) moveSub.classList.remove('open'); const stSub = document.getElementById('ctxStatusSubmenu'); if (stSub) stSub.classList.remove('open');
      ctxMenu.classList.add('open');
      requestAnimationFrame(() => { const rect = ctxMenu.getBoundingClientRect(); if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4; if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4; if (x < 0) x = 4; if (y < 0) y = 4; ctxMenu.style.left = x + 'px'; ctxMenu.style.top = y + 'px'; });
    }
    const closeCtx = () => { ctxMenu.classList.remove('open'); if (moveSub) moveSub.classList.remove('open', 'flip'); const statusSub = document.getElementById('ctxStatusSubmenu'); if (statusSub) statusSub.classList.remove('open', 'flip'); };
    document.addEventListener('click', e => { if (!e.target.closest('.ctx-menu')) closeCtx(); });
    document.addEventListener('contextmenu', e => { if (!e.target.closest('.trow') && !e.target.closest('.mosaic-card')) closeCtx(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCtx(); });
    // Оба подменю («Статус в...» и «Переместить в...») открываются по ховеру с флипом у края экрана
    [['ctxStatusBtn', 'ctxStatusSubmenu'], ['ctxMoveToFolder', 'ctxMoveSubmenu']].forEach(pair => {
      const btn = document.getElementById(pair[0]); const sub = document.getElementById(pair[1]); if (!btn || !sub) return;
      const openSub = () => { if (sub.children.length === 0) return; sub.classList.add('open'); requestAnimationFrame(() => { const r = sub.getBoundingClientRect(); if (r.right > window.innerWidth) sub.classList.add('flip'); else if (r.left < 0) sub.classList.remove('flip'); }); };
      const closeSub = () => sub.classList.remove('open', 'flip');
      btn.addEventListener('mouseenter', openSub); btn.addEventListener('mouseleave', closeSub); sub.addEventListener('mouseenter', openSub); sub.addEventListener('mouseleave', closeSub);
    });
    ctxMenu.querySelectorAll('.ctx-link-section .ctx-menu__item[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        ctxMenu.classList.remove('open'); const action = btn.dataset.action;
        const ids = _validIds(); if (!ids.length || ctxTargetIsFolder) return; const id = ids[0]; const link = Storage.getLinkById(id); if (!link) return;
        switch (action) {
          case 'open': { const vid = YouTube.resolveVideoId(link); if (vid) window.open(YouTube.getVideoUrl(vid), '_blank'); else if (link.url) window.open(link.url, '_blank'); break; }
          case 'refresh': if (ids.length > 1) _doRefreshMetaBatch(ids); else _doRefreshMeta(id); break;
          case 'copy-url': { const text = ids.map(i => (Storage.getLinkById(i) || {}).url || '').filter(Boolean).join('\n'); navigator.clipboard.writeText(text).then(() => { if (window.Toast) Toast.show(ids.length > 1 ? 'Скопировано URL: ' + ids.length : 'URL скопирован', 'success'); }); break; }
          case 'copy-title': { const text = ids.map(i => (Storage.getLinkById(i) || {}).title || '').filter(Boolean).join('\n'); navigator.clipboard.writeText(text).then(() => { if (window.Toast) Toast.show(ids.length > 1 ? 'Скопировано названий: ' + ids.length : 'Название скопировано', 'success'); }); break; }
          case 'history': if (window.Modal) Modal.showHistoryModal(id); break;
          case 'delete': { const msg = ids.length > 1 ? 'Удалить выбранные видео (' + ids.length + ')?' : 'Удалить это видео?'; Modal.showConfirmModal(msg, () => { ids.forEach(i => Storage.deleteLink(i)); if (window.MultiSelect) MultiSelect.clear(); const selectedLinkId = window.Details ? Details.getSelectedLinkId() : ''; if (selectedLinkId && ids.includes(selectedLinkId) && window.Details) Details.selectLink(''); _refreshViews(); if (window.Toast) Toast.show(ids.length > 1 ? 'Удалено: ' + ids.length : 'Удалено', 'info'); }, () => {}); break; }
        }
      });
    });
    ctxMenu.querySelectorAll('.ctx-folder-section .ctx-menu__item[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        ctxMenu.classList.remove('open'); const action = btn.dataset.action; const id = ctxTargetId; if (!id || !ctxTargetIsFolder) return;
        switch (action) {
          case 'create-folder': if (window.Modal) Modal.showNewFolderModal([], id); break;
          case 'rename-folder': if (window.Modal) Modal.showGroupModal(id); break;
          case 'delete-folder': Modal.showConfirmModal('Удалить папку и всё вложенное?', () => { const grp = Storage.getGroupById(id); const parentId = grp ? grp.parentId : ''; Storage.deleteGroup(id); const currentGroupId = window.Sidebar ? Sidebar.getCurrentGroupId() : ''; if (currentGroupId === id) { if (window.Sidebar) { Sidebar.setCurrentGroupId(parentId || ''); Sidebar.render(); } if (window.Details) Details.selectLink(''); } if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (window.Toast) Toast.show('Папка удалена', 'info'); }, () => {}); break;
        }
      });
    });
  }

  async function _doRefreshMeta(id, silent) {
    const link = Storage.getLinkById(id); if (!link) return false;
    if (!silent && window.Toast) Toast.show('Обновляю метаданные...', 'info');
    try {
      const vid = YouTube.resolveVideoId(link); if (!vid) { if (!silent && window.Toast) Toast.show('Не удалось определить ID видео', 'error'); return false; }
      if (YouTube.clearCache) YouTube.clearCache(); const ytToken = await Storage.getYouTubeAccessToken(); const meta = await YouTube.fetchMetadata(vid, ytToken);
      if (!meta || meta.fetchError) { if (!silent && window.Toast) Toast.show('Не удалось обновить метаданные' + (meta && meta.fetchError ? ': ' + meta.fetchError : ''), 'error'); return false; }
      if (link.manualTitle && meta.title) delete meta.title; ['title', 'channelTitle', 'duration', 'publishedAt', 'thumbnailUrl'].forEach(f => { if (meta[f] === '' || meta[f] === undefined) delete meta[f]; }); if (!meta.durationSeconds) delete meta.durationSeconds;
      Storage.updateLinkMetadata(id, meta); const detailsPanel = document.getElementById('detailsPanel'); if (window.Details && Details.getSelectedLinkId() === id && detailsPanel && !detailsPanel.classList.contains('hidden')) { Details.showPanel(id); }
      if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (!silent && window.Toast) Toast.show('Метаданные обновлены (' + (meta.fetchSource || 'ok') + ')', 'success');
      return true;
    } catch (err) { if (!silent && window.Toast) Toast.show('Ошибка: ' + err.message, 'error'); return false; }
  }

  // v8.6: общий флаг — не дать двум батч-обновлениям (настройки/мультивыбор) идти одновременно
  let metaRefreshRunning = false;

  // Батч-обновление метаданных для мультивыбора: постоянный тост прогресса (i / N,
  // обновлено, ошибок + полоса) + сводка. Раньше тост исчезал через 3с и цикл шёл молча.
  async function _doRefreshMetaBatch(ids) {
    if (!ids || !ids.length) return;
    if (metaRefreshRunning) { if (window.Toast) Toast.show('Обновление метаданных уже идёт…', 'warn'); return; }
    metaRefreshRunning = true;
    const pt = window.Toast ? Toast.showPersistent('Обновляю метаданные: 0 / ' + ids.length, 'info') : null;
    let ok = 0, fail = 0, i = 0;
    try {
      for (const id of ids) { const r = await _doRefreshMeta(id, true); if (r) ok++; else fail++; i++; if (pt) { Toast.update(pt, 'Обновляю метаданные: ' + i + ' / ' + ids.length + ' · обновлено: ' + ok + (fail ? ' · ошибок: ' + fail : ''), 'info'); Toast.setProgress(pt, (i / ids.length) * 100); } }
    } finally {
      if (pt) Toast.dismiss(pt);
      if (window.MultiSelect) MultiSelect.clear();
      _refreshViews();
      metaRefreshRunning = false;
    }
    if (window.Toast) Toast.show('Метаданные: обновлено ' + ok + (fail ? ', ошибок: ' + fail : ''), (fail && !ok) ? 'error' : 'success');
  }

  // v8.6: «Обновить метаданные» из Настроек (#settingsRefreshMetaBtn). Постоянный
  // тост прогресса «i / N · обновлено: X · ошибок: Y» + полоса — раньше после 3с
  // исчезал стартовый тост и весь цикл шёл молча (пользователь видел «ничего»).
  async function refreshAllMeta() {
    const links = Storage.getLinks(); if (links.length === 0) { if (window.Toast) Toast.show('Нет видео для обновления', 'info'); return; }
    if (metaRefreshRunning) { if (window.Toast) Toast.show('Обновление метаданных уже идёт…', 'warn'); return; }
    metaRefreshRunning = true;
    if (YouTube.clearCache) YouTube.clearCache();
    const ytToken = await Storage.getYouTubeAccessToken();
    const pt = window.Toast ? Toast.showPersistent('Обновляю метаданные: 0 / ' + links.length, 'info') : null;
    let updated = 0; let failed = 0; let i = 0;
    try {
      for (const link of links) {
        try {
          const vid = YouTube.resolveVideoId(link); if (!vid) { failed++; } else {
            const meta = await YouTube.fetchMetadata(vid, ytToken);
            if (!meta || meta.fetchError) { failed++; } else {
              if (link.manualTitle && meta.title) delete meta.title;
              ['title', 'channelTitle', 'duration', 'publishedAt', 'thumbnailUrl'].forEach(f => { if (meta[f] === '' || meta[f] === undefined) delete meta[f]; }); if (!meta.durationSeconds) delete meta.durationSeconds;
              Storage.updateLinkMetadata(link.id, meta); const detailsPanel = document.getElementById('detailsPanel'); if (window.Details && Details.getSelectedLinkId() === link.id && detailsPanel && !detailsPanel.classList.contains('hidden')) { Details.showPanel(link.id); }
              if (window.Table && Table.getViewMode() === 'rows') Table.updateItem(link.id); else if (window.Mosaic) Mosaic.updateItem(link.id); updated++;
            }
          }
        } catch (err) { failed++; }
        i++;
        if (pt) { Toast.update(pt, 'Обновляю метаданные: ' + i + ' / ' + links.length + ' · обновлено: ' + updated + (failed ? ' · ошибок: ' + failed : ''), 'info'); Toast.setProgress(pt, (i / links.length) * 100); }
        await new Promise(r => setTimeout(r, 350));
      }
    } finally {
      metaRefreshRunning = false;
      if (pt) Toast.dismiss(pt);
    }
    if (window.Toast) { const msg = 'Обновлено: ' + updated + ' / ' + links.length + (failed ? ', ошибок: ' + failed : ''); Toast.show(msg, failed ? 'warn' : 'success'); }
  }
  return { bind, refreshAllMeta };
})();
if (typeof window !== 'undefined') { window.ContextMenu = ContextMenu; }


/* ==================== ИСТОЧНИК: js/ui/nav.js ==================== */
const Nav = (() => {
  let history = [{ t: 'g', id: '' }]; let index = 0; let applying = false; const listeners = [];
  function current() { return history[index] || { t: 'g', id: '' }; }
  function canBack() { return index > 0; }
  function canForward() { return index < history.length - 1; }
  function on(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function _emit() { listeners.forEach(fn => { try { fn(); } catch (e) { } }); }
  function _entryIsFolder(entry, groupId) { return !!(entry && entry.t === 'g' && (entry.id || '') === (groupId || '')); }
  function _apply() {
    const entry = current(); applying = true;
    try {
      // При навигации по папкам/истории мультивыбор сбрасывается
      if (window.MultiSelect) MultiSelect.clear();
      if (entry && entry.t === 'l' && window.Storage) {
        const link = Storage.getLinkById(entry.id);
        if (link) { if (window.Sidebar) { Sidebar.setCurrentGroupId(link.groupId || ''); Sidebar.setCurrentFilter('all'); Sidebar._syncFilterMenu(); Sidebar.render(); } if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (window.Breadcrumb) Breadcrumb.render(); if (window.Details) Details.selectLink(link.id); if (window.Statusbar) Statusbar.update(); _emit(); return; }
      }
      const gid = (entry && entry.t === 'g') ? (entry.id || '') : (window.Sidebar ? Sidebar.getCurrentGroupId() : '');
      if (window.Sidebar) { Sidebar.setCurrentGroupId(gid); Sidebar.setCurrentFilter('all'); Sidebar._syncFilterMenu(); Sidebar.render(); }
      if (window.Details) Details.selectLink(null); if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (window.Breadcrumb) Breadcrumb.render(); if (window.Statusbar) Statusbar.update(); _emit();
    } finally { applying = false; }
  }
  function goto(groupId) { if (!groupId) groupId = ''; if (_entryIsFolder(current(), groupId)) return; if (canBack() && _entryIsFolder(history[index - 1], groupId)) { index--; _apply(); return; } if (canForward() && _entryIsFolder(history[index + 1], groupId)) { index++; _apply(); return; } history = history.slice(0, index + 1); history.push({ t: 'g', id: groupId }); index = history.length - 1; _apply(); }
  function gotoLink(linkId) { if (!linkId || applying) return; const cur = current(); if (cur.t === 'l' && cur.id === linkId) return; history = history.slice(0, index + 1); history.push({ t: 'l', id: linkId }); index = history.length - 1; _emit(); }
  function reset() { history = [{ t: 'g', id: '' }]; index = 0; _apply(); }
  function back() { if (canBack()) { index--; _apply(); } }
  function forward() { if (canForward()) { index++; _apply(); } }
  return { current, canBack, canForward, goto, gotoLink, back, forward, reset, on };
})();
if (typeof window !== 'undefined') { window.Nav = Nav; }


/* ==================== ИСТОЧНИК: js/ui/breadcrumb.js ==================== */
const Breadcrumb = (() => {
  const ICON_LIB = "<svg class=\"icon icon--sm\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z\"/><path d=\"M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z\"/></svg>";
  const ICON_FOLDER = "<svg class=\"icon icon--sm\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"/></svg>";
  function _escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function _escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _chain() { const chain = []; let id = window.Sidebar ? Sidebar.getCurrentGroupId() : ''; let guard = 0; while (id && guard++ < 50) { const g = Storage.getGroupById(id); if (!g) break; chain.unshift({ id: g.id, title: g.title }); id = g.parentId || ''; } return chain; }
  function render() {
    const el = document.getElementById('breadcrumb'); if (!el) return; const chain = _chain(); let html = '';
    if (chain.length === 0) { html += '<span class="crumb crumb--current">' + ICON_LIB + ' Библиотека</span>'; }
    else { html += '<button type="button" class="crumb" data-gid="" title="К корню">' + ICON_LIB + ' Библиотека</button>'; chain.forEach((g, i) => { html += '<span class="crumb-sep">›</span>'; if (i === chain.length - 1) { html += '<span class="crumb crumb--current">' + _escHtml(g.title) + '</span>'; } else { html += '<button type="button" class="crumb" data-gid="' + _escAttr(g.id) + '">' + ICON_FOLDER + ' ' + _escHtml(g.title) + '</button>'; } }); }
    el.innerHTML = html; el.querySelectorAll('.crumb[data-gid]').forEach(btn => { btn.addEventListener('click', () => { if (window.Nav) window.Nav.goto(btn.dataset.gid || ''); }); });
  }
  return { render };
})();
if (typeof window !== 'undefined') { window.Breadcrumb = Breadcrumb; }


/* ==================== ИСТОЧНИК: js/ui/statusbar.js ==================== */
const Statusbar = (() => {
  function _plural(n, one, few, many) { const m10 = n % 10; const m100 = n % 100; if (m10 === 1 && m100 !== 11) return one; if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few; return many; }
  function _visibleCount() { const tableWrapper = document.getElementById('tableWrapper'); const mosaicView = document.getElementById('mosaicView'); if (tableWrapper && !tableWrapper.classList.contains('hidden')) return document.querySelectorAll('#tableBody .trow:not(.trow--parent)').length; if (mosaicView && !mosaicView.classList.contains('hidden')) return document.querySelectorAll('#mosaicView .mosaic-card:not(.mosaic-card--parent)').length; return 0; }
  function update() { const items = document.getElementById('statusItems'); const sel = document.getElementById('statusSel'); if (items) { const n = _visibleCount(); items.textContent = n + ' ' + _plural(n, 'элемент', 'элемента', 'элементов'); } if (sel) { const nMulti = window.MultiSelect ? MultiSelect.count() : 0; const selected = nMulti > 0 ? nMulti : (window.Details && Details.getSelectedLinkId() ? 1 : 0); sel.textContent = selected ? 'выбрано: ' + selected : ''; sel.classList.toggle('hidden', selected === 0); } }
  return { update };
})();
if (typeof window !== 'undefined') { window.Statusbar = Statusbar; }


/* ==================== ИСТОЧНИК: _archive/js/app_optimized_fixed.js ==================== */
(function () {
  'use strict';
  let currentView = 'rows'; let searchTimer = null;
  function $(id) { return document.getElementById(id); }
  const _$ = $;

  function _refreshAll() { if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (window.Sidebar) Sidebar.render(); _updateCounts(); if (window.Breadcrumb) Breadcrumb.render(); if (window.Statusbar) Statusbar.update(); }
  function _updateCounts() { const links = Storage.getLinks(); const map = { countAll: links.length, countQueue: links.filter(l => l.status === 'queue').length, countLater: links.filter(l => l.status === 'later').length, countWatching: links.filter(l => l.status === 'watching').length, countWatched: links.filter(l => l.status === 'watched').length, countArchived: links.filter(l => l.status === 'archived').length }; Object.keys(map).forEach(id => { const el = _$(id); if (el) el.textContent = map[id]; }); }

  function _setView(mode) {
    currentView = mode; const tableWrapper = $('tableWrapper'); const mosaicView = $('mosaicView'); const rowsBtn = $('viewRowsBtn'); const mosaicBtn = $('viewMosaicBtn'); if (!tableWrapper || !mosaicView) return;
    if (window.Table) Table.setViewMode(mode);
    if (mode === 'mosaic') { tableWrapper.classList.add('hidden'); mosaicView.classList.remove('hidden'); if (window.Mosaic) Mosaic.render(); }
    else { mosaicView.classList.add('hidden'); tableWrapper.classList.remove('hidden'); if (window.Table) Table.render(); }
    if (rowsBtn) rowsBtn.classList.toggle('active', mode === 'rows');
    if (mosaicBtn) mosaicBtn.classList.toggle('active', mode === 'mosaic');
    if (window.Statusbar) Statusbar.update();
  }

  function _bindSearch() {
    const input = $('searchInput'); const clearBtn = $('searchClear'); if (!input) return;
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const q = input.value.trim().toLowerCase();
        if (window.Table) Table.setSearchQuery(q); if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render();
        if (clearBtn) clearBtn.classList.toggle('hidden', !q); if (window.Statusbar) Statusbar.update();
      }, 250);
    });
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = ''; if (window.Table) Table.setSearchQuery(''); if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render();
        clearBtn.classList.add('hidden'); input.focus(); if (window.Statusbar) Statusbar.update();
      });
    }
  }

  function _syncFilterMenu() {
    const currentFilter = window.Sidebar ? Sidebar.getCurrentFilter() : 'all';
    document.querySelectorAll('#menuFilter .tb-dropdown__item').forEach(item => { item.classList.toggle('active', item.dataset.filter === currentFilter); });
    document.querySelectorAll('.nav-list[data-filter="status"] .nav-item').forEach(item => { item.classList.toggle('active', item.dataset.filter === currentFilter); });
  }

  function _closeToolbarDropdowns() { document.querySelectorAll('.tb-dropdown.active').forEach(d => d.classList.remove('active')); }

  function _bindFilters() {
    document.querySelectorAll('.nav-list[data-filter="status"] .nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.Sidebar) Sidebar.setCurrentFilter(item.dataset.filter || 'all');
        _syncFilterMenu(); _closeToolbarDropdowns(); if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render(); if (window.Statusbar) Statusbar.update();
      });
    });
  }

  function _bindSortMenu() {
    document.querySelectorAll('.table-header .th[data-field]').forEach(th => {
      th.addEventListener('click', (e) => {
        if (e.target.closest('.resizer')) return;
        const field = th.dataset.field;
        if (window.Table) Table.setSort(field);
        if (window.Table) Table.render(); if (window.Mosaic) Mosaic.render();
      });
    });
  }

  function _triggerImportJson() {
    _pickFile('.json,application/json', (content) => {
      try {
        const r = Storage.importJSON(content, false); _refreshAll();
        if (window.Toast) Toast.show('Импортировано ссылок: ' + r.linksAdded + ', групп: ' + r.groupsAdded, 'success');
      } catch (err) { alert('Ошибка импорта: ' + err.message); }
    });
  }

  function _triggerImportBookmarks() {
    _pickFile('.html,text/html', (content) => {
      const r = Storage.importBookmarks(content, true);
      if (r.success) { _refreshAll(); if (window.Toast) { Toast.show('Закладки: найдено ' + r.found + ', добавлено ' + r.added, 'success'); } }
      else { alert('Ошибка импорта закладок: ' + r.error); }
    });
  }

  function _pickFile(accept, onContent) {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept;
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader(); reader.onload = (ev) => onContent(ev.target.result); reader.readAsText(file);
    };
    input.click();
  }

  function _bindToolbarButtons() {
    // v8.5: кнопка A2e #menuAddLinkBtn «Добавить ссылку» удалена — дубль A1b
    // #sidebarAddLinkBtn из боковой панели (единственная точка добавления).

    const sidebarToggle = $('sidebarToggle');
    function _toggleSidebar() {
      const sidebar = $('sidebar');
      const backdrop = $('sidebarBackdrop');
      if (sidebar) {
        sidebar.classList.toggle('collapsed');
        if (document.body.classList.contains('sidebar-overlay-mode')) {
          if (!sidebar.classList.contains('collapsed')) {
            backdrop.classList.add('active');
          } else {
            backdrop.classList.remove('active');
          }
        }
      }
    }
    if (sidebarToggle) { sidebarToggle.addEventListener('click', _toggleSidebar); }
    // Свёрнутая полоса (rail): функционал разворота перенесён сюда с кнопки
    // #sidebarToggle (в свёрнутом виде она скрыта). Клик по полосе разворачивает
    // панель; клики по кнопкам на полосе ([+], аватар профиля) — нет.
    const sidebarRail = $('sidebar');
    if (sidebarRail) {
      sidebarRail.addEventListener('click', (e) => {
        if (!sidebarRail.classList.contains('collapsed')) return;
        if (e.target.closest('button')) return;
        _toggleSidebar();
      });
    }
    const sidebarAddLinkBtn = $('sidebarAddLinkBtn');
    if (sidebarAddLinkBtn) { sidebarAddLinkBtn.addEventListener('click', () => { if (window.Modal) Modal.showAddLinkModal(); }); }

    const backdrop = $('sidebarBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        const sidebar = $('sidebar');
        if (sidebar) sidebar.classList.add('collapsed');
        backdrop.classList.remove('active');
      });
    }

    const rowsBtn = $('viewRowsBtn');
    if (rowsBtn) rowsBtn.addEventListener('click', () => _setView('rows'));
    const mosaicBtn = $('viewMosaicBtn');
    if (mosaicBtn) mosaicBtn.addEventListener('click', () => _setView('mosaic'));
    const navBackBtn = $('navBackBtn');
    if (navBackBtn) navBackBtn.addEventListener('click', () => { if (window.Nav) window.Nav.back(); });
    const navForwardBtn = $('navForwardBtn');
    if (navForwardBtn) navForwardBtn.addEventListener('click', () => { if (window.Nav) window.Nav.forward(); });
  }

  function _updateNavButtons() {
    const b = $('navBackBtn'); const f = $('navForwardBtn');
    if (b) b.disabled = !(window.Nav && window.Nav.canBack());
    if (f) f.disabled = !(window.Nav && window.Nav.canForward());
  }

  function _bindNavKeys() {
    document.addEventListener('keydown', (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (window.Nav) window.Nav.back(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (window.Nav) window.Nav.forward(); }
    });
  }

  function _bindResize() {
    const handle = $('resizeHandleV'); const panel = $('detailsPanel');
    if (!handle || !panel) return;
    const saved = (Storage.getSettings() && Storage.getSettings().detailsWidth) || '';
    if (saved && saved >= 220 && saved <= 640) { document.documentElement.style.setProperty('--details-width', saved + 'px'); }
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX; const startW = panel.offsetWidth; const MIN = 220; const MAX = 640;
      function onMove(ev) { let w = startW + (startX - ev.clientX); if (w < MIN) w = MIN; if (w > MAX) w = MAX; document.documentElement.style.setProperty('--details-width', w + 'px'); }
      function onUp() {
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('resizing');
        try { Storage.saveSettings({ detailsWidth: panel.offsetWidth }); } catch (err) { }
      }
      document.body.classList.add('resizing'); document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (e.target && e.target.closest && e.target.closest('.details-panel input, .details-panel textarea, .details-panel select')) return;
      // Escape в первую очередь закрывает открытые меню (профиль/тулбар),
      // повторный Escape закрывает панель «Подробности»
      const openDd = document.querySelectorAll('.tb-dropdown.active');
      if (openDd.length) { openDd.forEach(d => d.classList.remove('active')); return; }
      if (document.querySelector('.modal-overlay, .ctx-menu.open')) return;
      // Снятие мультивыбора строк — до закрытия панели «Подробности»
      if (window.MultiSelect && MultiSelect.count()) { MultiSelect.clear(); return; }
      const p = $('detailsPanel');
      if (p && !p.classList.contains('hidden')) { p.classList.add('hidden'); p.classList.remove('open'); const h = $('resizeHandleV'); if (h) h.classList.add('hidden'); }
    });
  }

  // Пофайловые версии: в шапке сайдбара — версия index.html (window.APP_VERSIONS.index);
  // полный список — Настройки → «О программе». Раньше строка была зашита здесь ('v3.0').
  function _showVersion() { const el = $('version-display'); if (el) el.textContent = 'v' + ((window.APP_VERSIONS && window.APP_VERSIONS.index) || '?'); }

  function _renderProfileButton() {
    const nameEl = $('profileName'); const avEl = $('profileAvatar'); if (!nameEl) return;
    const setAvatar = (name) => { if (avEl) { const ch = (name || '').trim().charAt(0); avEl.textContent = ch ? ch.toUpperCase() : '?'; } };
    const mode = Storage.getMode();
    if (mode === 'server') {
      const u = Storage.getAuthUser();
      const name = (u && (u.name || u.email)) ? (u.name || u.email) : 'Google Аккаунт';
      nameEl.textContent = name; setAvatar(name);
      return;
    }
    nameEl.textContent = 'Локальный режим'; setAvatar('Локальный');
  }

  function _renderProfileMenu() {
    const menu = $('profileMenu'); if (!menu) return;
    menu.innerHTML = '';

    const addSep = () => { const s = document.createElement('div'); s.className = 'tb-dropdown__sep'; menu.appendChild(s); };
    const addBtn = (text, cls, onClick) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls || 'tb-dropdown__item'; b.textContent = text; if (onClick) b.addEventListener('click', onClick); menu.appendChild(b); return b; };

    // 1. НАСТРОЙКИ И ДАННЫЕ
    addBtn('Настройки', '', () => { _closeToolbarDropdowns(); if (window.Modal) Modal.showSettingsModal(); });
    addBtn('Данные', '', () => { _closeToolbarDropdowns(); if (window.Modal) Modal.showDataModal(); });
    
    addSep();

    // 2. ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМОВ
    const mode = Storage.getMode();
    if (mode === 'server') {
      const u = Storage.getAuthUser();
      addBtn('Аккаунт Google: ' + (u.email || ''), 'tb-dropdown__item--muted');
      addBtn('Переключиться на Локальный', '', () => { _closeToolbarDropdowns(); Storage.setForceLocal(true); });
      addSep();
      
      // 3. YOUTUBE ДОСТУП И ВЫХОД
      const scopeOk = !!u.hasYouTubeScope;
      addBtn('YouTube: ' + (scopeOk ? 'доступ выдан' : 'доступ не выдан'), 'tb-dropdown__item--muted');
      if (scopeOk) {
        addBtn('Отозвать доступ к YouTube...', '', async () => {
          _closeToolbarDropdowns();
          if (typeof confirm === 'function' && !confirm('Отозвать доступ к YouTube? Метаданные будут приходить только через oEmbed. Для восстановления войдите заново.')) return;
          try { await Storage.revokeYouTubeAccess(); _renderProfileButton(); _renderAuthBanners(); if (window.Toast) Toast.show('Доступ к YouTube отозван', 'success'); }
          catch (e) { if (window.Toast) Toast.show('Не удалось отозвать: ' + e.message, 'error'); }
        });
      }
      addBtn('Выйти из аккаунта Google', 'tb-dropdown__item--danger', () => { _closeToolbarDropdowns(); Storage.logout(); });
    } else {
      addBtn('Текущий режим: Локальный', 'tb-dropdown__item--muted');
      addBtn('Войти через Google', 'tb-dropdown__item--accent', () => { _closeToolbarDropdowns(); Storage.login(); });
    }

    // 4. ИНФО-БЛОК: версия, назначение, ссылки (интеграция старого футера сайдбара)
    addSep();
    const info = document.createElement('div');
    info.className = 'tb-dropdown__info';
    info.innerHTML = '<strong>YTM Manager v' + ((window.APP_VERSIONS && window.APP_VERSIONS.index) || '') + '</strong> — organize and manage personal video links.';
    menu.appendChild(info);
    const links = document.createElement('div');
    links.className = 'tb-dropdown__links';
    links.innerHTML = '<a href="/terms.html">Terms</a><span>·</span><a href="/privacy.html">Privacy</a>';
    menu.appendChild(links);
  }

  function _bindProfileMenu() {
    const btn = $('profileBtn'); const dropdown = $('profileDropdown');
    if (!btn || !dropdown) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasActive = dropdown.classList.contains('active');
      document.querySelectorAll('.tb-dropdown.active').forEach(d => d.classList.remove('active'));
      if (!wasActive) { dropdown.classList.add('active'); _renderProfileMenu(); }
    });
    // Закрытие профиль-меню кликом вне его области (стандартное поведение;
    // ранее .active зависал открытым и блокировал Escape панели «Подробности»)
    document.addEventListener('click', (e) => {
      if (!dropdown.classList.contains('active')) return;
      if (dropdown.contains(e.target) || (btn && btn.contains(e.target))) return;
      dropdown.classList.remove('active');
    });
  }

  function _renderAuthBanners() {
    let banner = $('ytAccessBanner');
    const u = Storage.getAuthUser();
    const needBanner = Storage.getMode() === 'server' && u && !u.hasYouTubeScope;
    if (needBanner) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'ytAccessBanner';
        banner.className = 'yt-access-banner';
        banner.innerHTML = '<span class="yt-access-banner__text">⚠ Доступ к YouTube API не выдан: название/канал/превью приходят через oEmbed, длительность недоступна. Чтобы включить полные метаданные — войдите заново (Google попросит разрешение).</span><button type="button" class="yt-access-banner__btn">Войти заново</button>';
        const toolbar = document.querySelector('.toolbar');
        if (toolbar && toolbar.parentNode) { toolbar.parentNode.insertBefore(banner, toolbar); } else { document.body.appendChild(banner); }
        const reloginBtn = banner.querySelector('.yt-access-banner__btn');
        if (reloginBtn) reloginBtn.addEventListener('click', () => Storage.login());
      }
      banner.classList.remove('hidden');
    } else if (banner) {
      banner.classList.add('hidden');
    }
  }

  // Функция для динамического переключения режима сайдбара
  function _updateLayoutMode() {
    const sidebarWidth = 260; // Соответствует CSS переменной --sidebar-width
    // Минимальная ширина таблицы: пол «Название» 80px + фикс. колонки + паддинги 32px
    const cs = getComputedStyle(document.documentElement);
    const num = (v) => parseFloat(v) || 0;
    const minTable = 80 + num(cs.getPropertyValue('--col-channel')) + num(cs.getPropertyValue('--col-status')) + num(cs.getPropertyValue('--col-duration')) + num(cs.getPropertyValue('--col-published')) + 32;

    // Оверлей включаем только когда окно реально узкое для таблицы + панель
    if (window.innerWidth < minTable + sidebarWidth + 24) {
      if (!document.body.classList.contains('sidebar-overlay-mode')) {
        document.body.classList.add('sidebar-overlay-mode');
        // При переходе в оверлей панель скрываем, чтобы не перекрывать контент
        const sb = $('sidebar'); const bd = $('sidebarBackdrop');
        if (sb) sb.classList.add('collapsed');
        if (bd) bd.classList.remove('active');
      }
    } else {
      if (document.body.classList.contains('sidebar-overlay-mode')) {
        document.body.classList.remove('sidebar-overlay-mode');
        const sidebar = $('sidebar');
        const backdrop = $('sidebarBackdrop');
        if (sidebar) sidebar.classList.remove('collapsed'); // Разворачиваем, если места хватает
        if (backdrop) backdrop.classList.remove('active');
      }
    }
  }

  function init() {
    _bindToolbarButtons(); _bindFilters(); _bindSortMenu(); _bindSearch(); _bindResize(); _bindProfileMenu(); _renderProfileButton();
    if (window.ContextMenu) ContextMenu.bind();
    _syncFilterMenu(); _updateCounts(); _showVersion();
    _setView('rows'); if (window.Sidebar) Sidebar.render();
    if (window.Breadcrumb) Breadcrumb.render(); if (window.Statusbar) Statusbar.update();
    if (window.Nav) { Nav.on(_updateNavButtons); _updateNavButtons(); }
    _bindNavKeys();
    
    // Инициализация адаптивности
    window.addEventListener('resize', _updateLayoutMode);
    setTimeout(_updateLayoutMode, 100); // Даем таблице отрисоваться
  }

  async function _waitAndInit() {
    if (window.Storage && window.Table && window.Modal && window.Sidebar && window.Mosaic && window.Nav && window.Breadcrumb && window.Statusbar) {
      try { await window.Storage.bootstrap(); } catch (e) { }
      _renderAuthBanners();
      init();
    } else {
      setTimeout(_waitAndInit, 25);
    }
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', _waitAndInit); } else { _waitAndInit(); }
  
  window.app = { 
    init, 
    refreshAll: _refreshAll,
    updateLayoutMode: _updateLayoutMode, // Экспортируем функцию
    triggerImportJson: _triggerImportJson,
    triggerImportBookmarks: _triggerImportBookmarks
  };
})();