'use strict';

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function domainColor(domain) {
  const colors = ['#4285f4','#ea4335','#34a853','#fbbc04','#9c27b0','#00bcd4','#ff5722','#607d8b','#3f51b5','#009688'];
  let h = 0;
  for (let i = 0; i < (domain||'').length; i++) h = (h * 31 + domain.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

function domainInitial(domain) {
  if (!domain) return '?';
  return (domain.replace(/^www\./,'')[0] || '?').toUpperCase();
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

let chromeState = {
  view: 'bookmarks', // 'bookmarks' | 'history'
  activeFolder: null,
  page: 1,
  pageSize: 50,
  search: '',
  allFolders: [],
};

async function loadChrome() {
  const params = new URLSearchParams({
    type: chromeState.view,
    page: chromeState.page,
    limit: chromeState.pageSize,
  });
  if (chromeState.activeFolder) params.set('folder', chromeState.activeFolder);
  if (chromeState.search) params.set('q', chromeState.search);

  let data;
  try {
    data = await api(`/api/chrome?${params}`);
  } catch (e) {
    el('chrome-content').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }

  if (chromeState.view === 'bookmarks') {
    el('chrome-count-label').textContent = `${data.total.toLocaleString()} bookmark${data.total !== 1 ? 's' : ''}`;
    chromeState.allFolders = data.folders || [];
    renderChromeFolders(data.folders || []);
    renderBookmarks(data.items || []);
  } else {
    el('chrome-count-label').textContent = `${data.total.toLocaleString()} history item${data.total !== 1 ? 's' : ''}`;
    el('chrome-folders-list').innerHTML = '';
    renderHistory(data.items || []);
  }

  renderPagination('chrome-pagination', data.page, data.total, data.pageSize, (p) => {
    chromeState.page = p;
    loadChrome();
  });
}

function renderChromeFolders(folders) {
  const container = el('chrome-folders-list');
  if (!container) return;
  container.innerHTML = `<div class="sidebar-nav-row ${!chromeState.activeFolder ? 'active' : ''}" id="chrome-all-folders">📚 All Bookmarks</div>` +
    folders.map(f => `<div class="sidebar-nav-row chrome-folder-btn ${chromeState.activeFolder === f ? 'active' : ''}" data-folder="${escHtml(f)}">📁 ${escHtml(f)}</div>`).join('');

  container.querySelector('#chrome-all-folders').addEventListener('click', () => {
    chromeState.activeFolder = null;
    chromeState.page = 1;
    loadChrome();
  });
  container.querySelectorAll('.chrome-folder-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chromeState.activeFolder = btn.dataset.folder;
      chromeState.page = 1;
      loadChrome();
    });
  });
}

function renderBookmarks(items) {
  const container = el('chrome-content');
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">🔖</span><span>No bookmarks found</span></div>`;
    return;
  }
  // Group by folder
  const byFolder = {};
  for (const item of items) {
    const f = item.folder || 'Bookmarks';
    if (!byFolder[f]) byFolder[f] = [];
    byFolder[f].push(item);
  }
  let html = '';
  for (const [folder, bookmarks] of Object.entries(byFolder)) {
    html += `<div class="chrome-group">
      <div class="chrome-group-header">📁 ${escHtml(folder)}</div>
      ${bookmarks.map(renderBookmarkItem).join('')}
    </div>`;
  }
  container.innerHTML = html;
}

function renderBookmarkItem(item) {
  const domain = (item.domain || '').replace(/^www\./, '');
  return `<div class="chrome-link-item">
    <div class="chrome-favicon" style="background:${domainColor(domain)}">${domainInitial(domain)}</div>
    <div class="chrome-link-content">
      <a class="chrome-link-title" href="${escHtml(item.url || '#')}" target="_blank" rel="noopener">${escHtml(item.title || item.url)}</a>
      <div class="chrome-link-meta">
        <span class="chrome-domain">${escHtml(domain)}</span>
        ${item.addDate ? `<span class="chrome-date">${escHtml(formatDate(item.addDate))}</span>` : ''}
      </div>
    </div>
  </div>`;
}

function renderHistory(items) {
  const container = el('chrome-content');
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">🕐</span><span>No history found</span></div>`;
    return;
  }
  // Group by date
  const byDate = {};
  for (const item of items) {
    const key = item.visitTime ? new Date(item.visitTime).toDateString() : 'Unknown';
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(item);
  }
  let html = '';
  for (const [dateKey, visits] of Object.entries(byDate)) {
    const d = new Date(dateKey);
    const label = isNaN(d) ? dateKey : d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    html += `<div class="chrome-group">
      <div class="chrome-group-header">🕐 ${escHtml(label)}</div>
      ${visits.map(renderHistoryItem).join('')}
    </div>`;
  }
  container.innerHTML = html;
}

function renderHistoryItem(item) {
  const domain = (item.domain || '').replace(/^www\./, '');
  return `<div class="chrome-link-item">
    <div class="chrome-favicon" style="background:${domainColor(domain)}">${domainInitial(domain)}</div>
    <div class="chrome-link-content">
      <a class="chrome-link-title" href="${escHtml(item.url || '#')}" target="_blank" rel="noopener">${escHtml(item.title || item.url)}</a>
      <div class="chrome-link-meta">
        <span class="chrome-domain">${escHtml(domain)}</span>
        <span class="chrome-date">${escHtml(formatDateTime(item.visitTime))}</span>
      </div>
    </div>
  </div>`;
}

function setupChrome() {
  el('chrome-bookmarks-btn').addEventListener('click', () => {
    chromeState.view = 'bookmarks';
    chromeState.page = 1;
    chromeState.activeFolder = null;
    el('chrome-bookmarks-btn').classList.add('active');
    el('chrome-history-btn').classList.remove('active');
    loadChrome();
  });
  el('chrome-history-btn').addEventListener('click', () => {
    chromeState.view = 'history';
    chromeState.page = 1;
    el('chrome-history-btn').classList.add('active');
    el('chrome-bookmarks-btn').classList.remove('active');
    loadChrome();
  });
  el('search-input').addEventListener('input', () => {
    if (state.activeTab !== 'chrome') return;
    chromeState.search = el('search-input').value.trim();
    chromeState.page = 1;
    loadChrome();
  });
}

window.loadChrome = loadChrome;
setupChrome();
