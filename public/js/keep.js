'use strict';

const KEEP_COLORS = {
  DEFAULT:    '#ffffff',
  RED:        '#f28b82',
  PINK:       '#fdcfe8',
  PURPLE:     '#d7aefb',
  BLUE:       '#aecbfa',
  TEAL:       '#b9d5c7',
  SAGE:       '#e6f3ed',
  GRAY:       '#e8eaed',
  BROWN:      '#e6c9a8',
  ORANGE:     '#fbbc04',
  YELLOW:     '#fff475',
  GREEN:      '#ccff90',
  CERULEAN:   '#a8dff0',
  SPEARMINT:  '#89eed6',
};

// Colors where dark text is more readable
const DARK_TEXT_COLORS = new Set(['DEFAULT','GRAY','SAGE','CERULEAN','SPEARMINT','GREEN','YELLOW','ORANGE']);

function noteColor(colorName) {
  return KEEP_COLORS[(colorName || 'DEFAULT').toUpperCase()] || KEEP_COLORS.DEFAULT;
}

function isDarkText(colorName) {
  return DARK_TEXT_COLORS.has((colorName || 'DEFAULT').toUpperCase());
}

function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderKeepSidebar(labels) {
  const container = el('keep-labels-list');
  if (!container) return;
  container.innerHTML = labels.map(l => `
    <div class="sidebar-nav-row keep-label-item ${state.keepLabel === l ? 'active' : ''}" data-label="${escHtml(l)}">
      \uD83C\uDFF7\uFE0F ${escHtml(l)}
    </div>`).join('');
  container.querySelectorAll('.keep-label-item').forEach(item => {
    item.addEventListener('click', () => {
      state.keepLabel = state.keepLabel === item.dataset.label ? null : item.dataset.label;
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
  const params = new URLSearchParams({ page: state.keepPage, limit: 48 });
  if (state.searchQuery) params.set('q', state.searchQuery);
  if (state.keepLabel) params.set('label', state.keepLabel);
  let data;
  try {
    data = await api(`/api/keep?${params}`);
  } catch (e) {
    el('keep-grid').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }
  el('keep-count-label').textContent = `${data.total.toLocaleString()} note${data.total !== 1 ? 's' : ''}`;
  renderKeepSidebar(data.labels || []);
  renderKeepGrid(data.items || []);
  renderPagination('keep-pagination', data.page, data.total, data.pageSize, (p) => {
    state.keepPage = p;
    loadKeep();
  });
}

function renderKeepGrid(notes) {
  const grid = el('keep-grid');
  if (!notes.length) {
    grid.innerHTML = `<div class="empty-state"><span class="empty-state-icon">\uD83D\uDDD2\uFE0F</span><span>No notes found</span></div>`;
    return;
  }
  grid.innerHTML = `<div class="keep-masonry">${notes.map((note, i) => renderNoteCard(note, i)).join('')}</div>`;
  grid.querySelectorAll('.keep-card').forEach((card, i) => {
    card.addEventListener('click', () => openNoteModal(notes[i]));
  });
}

function renderNoteCard(note, idx) {
  const bg = noteColor(note.color);
  const dark = isDarkText(note.color);
  const textClass = dark ? 'keep-card-dark' : 'keep-card-light';

  let bodyHtml = '';
  if (note.listContent && note.listContent.length) {
    const items = note.listContent.slice(0, 8);
    bodyHtml = `<ul class="keep-checklist">${items.map(item =>
      `<li class="${item.isChecked ? 'checked' : ''}">${escHtml(item.text || '')}</li>`
    ).join('')}</ul>`;
    if (note.listContent.length > 8) bodyHtml += `<div class="keep-more-items">+ ${note.listContent.length - 8} more items</div>`;
  } else if (note.textContent) {
    const preview = note.textContent.slice(0, 300);
    bodyHtml = `<p class="keep-body-text">${escHtml(preview)}${note.textContent.length > 300 ? '\u2026' : ''}</p>`;
  }

  const labels = (note.labels || []).slice(0, 3);
  const badges = [
    note.isPinned   ? '<span class="keep-badge keep-pinned">\uD83D\uDCCC Pinned</span>'   : '',
    note.isArchived ? '<span class="keep-badge keep-archived">\uD83D\uDCE6 Archived</span>' : '',
  ].filter(Boolean).join('');

  const dateStr = note.edited
    ? new Date(note.edited).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return `<div class="keep-card ${textClass}" style="background:${bg}" data-idx="${idx}">
    ${badges ? `<div class="keep-badges">${badges}</div>` : ''}
    ${note.title ? `<div class="keep-card-title">${escHtml(note.title)}</div>` : ''}
    ${bodyHtml}
    ${labels.length ? `<div class="keep-labels">${labels.map(l => `<span class="keep-label-chip">${escHtml(l)}</span>`).join('')}</div>` : ''}
    ${dateStr ? `<div class="keep-card-date">${escHtml(dateStr)}</div>` : ''}
  </div>`;
}

function openNoteModal(note) {
  const bg = noteColor(note.color);
  let bodyHtml = '';
  if (note.listContent && note.listContent.length) {
    bodyHtml = `<ul class="keep-checklist-full">${note.listContent.map(item =>
      `<li class="${item.isChecked ? 'checked' : ''}"><span class="check-icon">${item.isChecked ? '\u2611' : '\u2610'}</span> ${escHtml(item.text || '')}</li>`
    ).join('')}</ul>`;
  } else if (note.textContent) {
    bodyHtml = `<pre class="keep-modal-text">${escHtml(note.textContent)}</pre>`;
  }

  const labels = (note.labels || []).map(l => `<span class="keep-label-chip">${escHtml(l)}</span>`).join('');

  const overlay = el('contact-modal-overlay');
  el('contact-modal-content').innerHTML = `
    <div class="keep-modal-header" style="background:${bg};border-radius:8px 8px 0 0;padding:16px;">
      ${note.isPinned ? '<span class="keep-badge keep-pinned">\uD83D\uDCCC Pinned</span>' : ''}
      ${note.title ? `<div class="keep-modal-title">${escHtml(note.title)}</div>` : ''}
    </div>
    <div class="keep-modal-body">
      ${bodyHtml || '<p style="color:#5f6368;">(empty note)</p>'}
      ${labels ? `<div class="keep-labels" style="margin-top:12px">${labels}</div>` : ''}
      <div class="keep-modal-dates">
        ${note.created ? `Created ${new Date(note.created).toLocaleDateString()}` : ''}
        ${note.edited  ? ` \u00B7 Edited ${new Date(note.edited).toLocaleDateString()}` : ''}
      </div>
    </div>`;
  overlay.classList.remove('hidden');
  el('contact-modal-close').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
}

window.loadKeep = loadKeep;
