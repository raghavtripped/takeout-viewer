'use strict';

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let savedState = { page: 1, pageSize: 50, search: '' };

async function loadSaved() {
  const params = new URLSearchParams({ page: savedState.page, limit: savedState.pageSize });
  if (savedState.search) params.set('q', savedState.search);
  let data;
  try {
    data = await api(`/api/saved?${params}`);
  } catch (e) {
    el('saved-list').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }
  el('saved-count-label').textContent = `${data.total.toLocaleString()} saved link${data.total !== 1 ? 's' : ''}`;
  renderSavedList(data.items || []);
  renderPagination('saved-pagination', data.page, data.total, data.pageSize, (p) => {
    savedState.page = p;
    loadSaved();
  });
}

function renderSavedList(links) {
  const container = el('saved-list');
  if (!links.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">🔖</span><span>No saved links found</span></div>`;
    return;
  }
  container.innerHTML = `<div class="saved-links-list">${links.map(renderSavedLink).join('')}</div>`;
}

function renderSavedLink(link) {
  const domain = link.domain || '';
  const dateStr = link.addDate ? new Date(link.addDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const folderStr = link.folder && link.folder !== '/' ? `<span class="saved-folder">📁 ${escHtml(link.folder)}</span>` : '';
  // Use a letter avatar instead of Google favicon for privacy
  const initial = domain ? domain[0].toUpperCase() : '?';
  const domainColor = domainAvatarColor(domain);

  return `<div class="saved-link-item">
    <div class="saved-link-favicon" style="background:${domainColor}">${escHtml(initial)}</div>
    <div class="saved-link-content">
      <a class="saved-link-title" href="${escHtml(link.url || '#')}" target="_blank" rel="noopener">${escHtml(link.title || link.url || '(no title)')}</a>
      <div class="saved-link-meta">
        <span class="saved-link-domain">${escHtml(domain)}</span>
        ${dateStr ? `<span class="saved-link-date">${escHtml(dateStr)}</span>` : ''}
        ${folderStr}
      </div>
    </div>
  </div>`;
}

function domainAvatarColor(domain) {
  const colors = ['#4285f4','#ea4335','#34a853','#fbbc04','#9c27b0','#00bcd4','#ff5722','#607d8b'];
  let h = 0;
  for (let i = 0; i < (domain||'').length; i++) h = (h * 31 + domain.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

function setupSaved() {
  el('search-input').addEventListener('input', () => {
    if (state.activeTab !== 'saved') return;
    savedState.search = el('search-input').value.trim();
    savedState.page = 1;
    loadSaved();
  });
}

window.loadSaved = loadSaved;
setupSaved();
