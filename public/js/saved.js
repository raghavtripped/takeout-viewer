'use strict';

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadSaved() {
  const params = new URLSearchParams({ page: state.savedPage, limit: 50 });
  if (state.searchQuery) params.set('q', state.searchQuery);

  let data;
  try {
    data = await api(`/api/saved?${params}`);
  } catch (e) {
    el('saved-list').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }

  el('saved-count-label').textContent = `${data.total.toLocaleString()} saved link${data.total !== 1 ? 's' : ''}`;

  if (data.items.length === 0) {
    el('saved-list').innerHTML = `<div class="empty-state"><span class="empty-state-icon">🔖</span><span>No saved links found</span></div>`;
  } else {
    el('saved-list').innerHTML = `<div class="chrome-list">${data.items.map(renderSavedLink).join('')}</div>`;
  }

  renderPagination('saved-pagination', data.page, data.total, data.pageSize, (p) => {
    state.savedPage = p;
    loadSaved();
  });
}

function renderSavedLink(link) {
  const dateStr = link.addDate ? formatDate(link.addDate, true) : '';
  return `
    <div class="chrome-link-row">
      <img class="favicon" src="https://www.google.com/s2/favicons?sz=16&domain=${escHtml(link.domain)}" alt="" loading="lazy" onerror="this.style.display='none'">
      <div class="chrome-link-body">
        <a href="${escHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="chrome-link-title">${escHtml(link.title || link.url)}</a>
        <div class="chrome-link-url">${escHtml(link.domain)}</div>
      </div>
      ${dateStr ? `<div class="chrome-link-date">${escHtml(dateStr)}</div>` : ''}
    </div>
  `;
}

window.loadSaved = loadSaved;
