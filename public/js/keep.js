'use strict';

// Keep note background colors (matching Google Keep's palette)
const KEEP_COLORS = {
  default: '#ffffff',
  red: '#f28b82',
  pink: '#fdcfe8',
  purple: '#e6c9a8',
  blue: '#aecbfa',
  teal: '#d3f0e8',
  green: '#ccff90',
  yellow: '#fff475',
  orange: '#fbbc04',
  brown: '#e6c9a8',
  gray: '#e8eaed',
  graphite: '#bdc1c6',
  cerulean: '#aecbfa',
  sage: '#d3f0e8',
  'light green': '#ccff90',
};

function noteColor(color) {
  return KEEP_COLORS[(color || 'default').toLowerCase()] || KEEP_COLORS.default;
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderKeepSidebar(labels) {
  const list = el('keep-labels-list');
  list.innerHTML = labels.map(label => `
    <div class="sidebar-nav-row keep-label-item ${state.keepLabel === label ? 'active' : ''}" data-label="${escHtml(label)}">
      🏷️ ${escHtml(label)}
    </div>
  `).join('');

  list.querySelectorAll('.keep-label-item').forEach(item => {
    item.addEventListener('click', () => {
      state.keepLabel = item.dataset.label;
      state.keepPage = 1;
      loadKeep();
    });
  });

  el('keep-all-btn').classList.toggle('active', !state.keepLabel);
}

el('keep-all-btn').addEventListener('click', () => {
  state.keepLabel = null;
  state.keepPage = 1;
  loadKeep();
});

async function loadKeep() {
  const params = new URLSearchParams({ page: state.keepPage, limit: 50 });
  if (state.searchQuery) params.set('q', state.searchQuery);
  if (state.keepLabel) params.set('label', state.keepLabel);

  let data;
  try {
    data = await api(`/api/keep?${params}`);
  } catch (e) {
    el('keep-grid').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }

  renderKeepSidebar(data.labels || []);
  el('keep-count-label').textContent = `${data.total.toLocaleString()} note${data.total !== 1 ? 's' : ''}`;

  if (data.items.length === 0) {
    el('keep-grid').innerHTML = `<div class="empty-state"><span class="empty-state-icon">🗒️</span><span>No notes found</span></div>`;
  } else {
    el('keep-grid').innerHTML = `<div class="keep-masonry">${data.items.map(renderNoteCard).join('')}</div>`;
  }

  renderPagination('keep-pagination', data.page, data.total, data.pageSize, (p) => {
    state.keepPage = p;
    loadKeep();
  });
}

function renderNoteCard(note) {
  const bg = noteColor(note.color);
  const isDark = bg === KEEP_COLORS.default;
  const pinnedBadge = note.isPinned ? '<span class="keep-pinned">📌</span>' : '';
  const archivedBadge = note.isArchived ? '<span class="keep-archived">Archived</span>' : '';

  let body = '';
  if (note.listContent && note.listContent.length > 0) {
    body = `<ul class="keep-list">${note.listContent.slice(0, 8).map(item =>
      `<li class="${item.isChecked ? 'checked' : ''}">
        <span class="keep-checkbox">${item.isChecked ? '☑' : '☐'}</span>
        ${escHtml(item.text)}
      </li>`
    ).join('')}${note.listContent.length > 8 ? `<li class="more-items">+${note.listContent.length - 8} more items</li>` : ''}</ul>`;
  } else if (note.textContent) {
    const preview = note.textContent.slice(0, 300);
    body = `<p class="keep-text">${escHtml(preview)}${note.textContent.length > 300 ? '…' : ''}</p>`;
  }

  const labels = (note.labels || []).map(l =>
    `<span class="keep-label-chip">${escHtml(l)}</span>`
  ).join('');

  const editedDate = note.edited ? formatDate(note.edited, true) : '';

  return `
    <div class="keep-card" style="background:${bg}">
      <div class="keep-card-header">
        ${note.title ? `<div class="keep-card-title">${escHtml(note.title)}</div>` : ''}
        <div class="keep-card-badges">${pinnedBadge}${archivedBadge}</div>
      </div>
      ${body}
      ${labels ? `<div class="keep-labels">${labels}</div>` : ''}
      ${editedDate ? `<div class="keep-date">${escHtml(editedDate)}</div>` : ''}
    </div>
  `;
}

window.loadKeep = loadKeep;
