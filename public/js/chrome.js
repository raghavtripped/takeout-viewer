'use strict';

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Sidebar toggles
el('chrome-bookmarks-btn').addEventListener('click', () => {
  state.chromeType = 'bookmarks';
  state.chromePage = 1;
  el('chrome-bookmarks-btn').classList.add('active');
  el('chrome-history-btn').classList.remove('active');
  loadChrome();
});
el('chrome-history-btn').addEventListener('click', () => {
  state.chromeType = 'history';
  state.chromePage = 1;
  el('chrome-history-btn').classList.add('active');
  el('chrome-bookmarks-btn').classList.remove('active');
  loadChrome();
});

async function loadChrome() {
  const params = new URLSearchParams({
    type: state.chromeType,
    page: state.chromePage,
    limit: 50,
  });
  if (state.searchQuery) params.set('q', state.searchQuery);

  let data;
  try {
    data = await api(`/api/chrome?${params}`);
  } catch (e) {
    el('chrome-content').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }

  if (state.chromeType === 'bookmarks') {
    el('chrome-count-label').textContent = `${data.total.toLocaleString()} bookmark${data.total !== 1 ? 's' : ''}`;
    renderBookmarksFolderSidebar(data.folders || []);
    renderBookmarks(data.items || []);
  } else {
    el('chrome-count-label').textContent = `${data.total.toLocaleString()} history entr${data.total !== 1 ? 'ies' : 'y'}`;
    el('chrome-folders-list').innerHTML = '';
    renderHistory(data.items || []);
  }

  renderPagination('chrome-pagination', data.page, data.total, data.pageSize, (p) => {
    state.chromePage = p;
    loadChrome();
  });
}

function renderBookmarksFolderSidebar(folders) {
  el('chrome-folders-list').innerHTML = folders.map(f => `
    <div class="sidebar-nav-row chrome-folder-item" title="${escHtml(f)}">
      📁 ${escHtml(f === '/' ? 'All' : f)}
    </div>
  `).join('');
}

function renderBookmarks(bookmarks) {
  if (bookmarks.length === 0) {
    el('chrome-content').innerHTML = `<div class="empty-state"><span class="empty-state-icon">🔖</span><span>No bookmarks found</span></div>`;
    return;
  }

  // Group by folder
  const groups = {};
  for (const b of bookmarks) {
    const folder = b.folder || '/';
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push(b);
  }

  const html = Object.entries(groups).map(([folder, items]) => `
    <div class="chrome-bookmark-group">
      <div class="chrome-group-heading">📁 ${escHtml(folder === '/' ? 'Bookmarks' : folder)}</div>
      ${items.map(b => `
        <div class="chrome-link-row">
          <img class="favicon" src="https://www.google.com/s2/favicons?sz=16&domain=${escHtml(b.domain)}" alt="" loading="lazy" onerror="this.style.display='none'">
          <div class="chrome-link-body">
            <a href="${escHtml(b.url)}" target="_blank" rel="noopener noreferrer" class="chrome-link-title">${escHtml(b.title || b.url)}</a>
            <div class="chrome-link-url">${escHtml(b.domain)}</div>
          </div>
          <div class="chrome-link-date">${escHtml(formatDate(b.addDate, true))}</div>
        </div>
      `).join('')}
    </div>
  `).join('');

  el('chrome-content').innerHTML = `<div class="chrome-list">${html}</div>`;
}

function renderHistory(history) {
  if (history.length === 0) {
    el('chrome-content').innerHTML = `<div class="empty-state"><span class="empty-state-icon">🕐</span><span>No history found</span></div>`;
    return;
  }

  // Group by date
  const groups = {};
  for (const h of history) {
    const dateKey = h.visitTime
      ? new Date(h.visitTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : 'Unknown date';
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(h);
  }

  const html = Object.entries(groups).map(([date, items]) => `
    <div class="chrome-bookmark-group">
      <div class="chrome-group-heading">🕐 ${escHtml(date)}</div>
      ${items.map(h => `
        <div class="chrome-link-row">
          <img class="favicon" src="https://www.google.com/s2/favicons?sz=16&domain=${escHtml(h.domain)}" alt="" loading="lazy" onerror="this.style.display='none'">
          <div class="chrome-link-body">
            <a href="${escHtml(h.url)}" target="_blank" rel="noopener noreferrer" class="chrome-link-title">${escHtml(h.title || h.url)}</a>
            <div class="chrome-link-url">${escHtml(h.domain)}</div>
          </div>
          <div class="chrome-link-date">${escHtml(h.visitTime ? new Date(h.visitTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '')}</div>
        </div>
      `).join('')}
    </div>
  `).join('');

  el('chrome-content').innerHTML = `<div class="chrome-list">${html}</div>`;
}

window.loadChrome = loadChrome;
