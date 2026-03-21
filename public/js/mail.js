'use strict';

const FOLDER_ICONS = {
  Inbox: '📥',
  Sent: '📤',
  Drafts: '📝',
  Trash: '🗑️',
  Spam: '⛔',
  Starred: '⭐',
  'All Mail': '📧',
};

function folderIcon(name) {
  return FOLDER_ICONS[name] || '🏷️';
}

// Build folder sidebar from folderCounts
function renderFolderSidebar(folderCounts) {
  const list = el('folder-list');
  const folders = Object.keys(folderCounts).sort((a, b) => {
    const order = ['Inbox', 'Starred', 'Sent', 'Drafts', 'Spam', 'Trash', 'All Mail'];
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  list.innerHTML = folders.map(folder => `
    <li class="folder-item ${state.activeFolder === folder ? 'active' : ''}"
        data-folder="${escHtml(folder)}">
      <span>
        <span class="folder-icon">${folderIcon(folder)}</span>
        ${escHtml(folder)}
      </span>
      <span class="folder-count">${folderCounts[folder]}</span>
    </li>
  `).join('');

  list.querySelectorAll('.folder-item').forEach(item => {
    item.addEventListener('click', () => {
      state.activeFolder = item.dataset.folder;
      state.mailPage = 1;
      // hide detail pane
      el('email-detail-pane').classList.add('hidden');
      el('email-list-pane').style.flex = '';
      state.selectedEmailId = null;
      loadMail();
    });
  });
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadMail() {
  const params = new URLSearchParams({
    folder: state.activeFolder,
    page: state.mailPage,
    limit: 50,
  });
  if (state.searchQuery) {
    params.set('q', state.searchQuery);
    params.delete('folder');  // search across all folders
  }

  let data;
  try {
    data = await api(`/api/emails?${params}`);
  } catch (e) {
    el('email-list').innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠️</span><span>${e.message}</span></div>`;
    return;
  }

  // Sync persisted read state from server into the in-memory set
  if (data.readIds) {
    for (const id of data.readIds) state.readEmails.add(id);
  }

  renderFolderSidebar(data.folderCounts || {});
  el('email-count-label').textContent = `${data.total.toLocaleString()} conversation${data.total !== 1 ? 's' : ''}`;

  if (data.items.length === 0) {
    el('email-list').innerHTML = `<div class="empty-state"><span class="empty-state-icon">📭</span><span>No emails found</span></div>`;
  } else {
    el('email-list').innerHTML = data.items.map(renderEmailRow).join('');
    el('email-list').querySelectorAll('.email-row').forEach(row => {
      row.addEventListener('click', () => openEmail(row.dataset.id));
    });
  }

  renderPagination('mail-pagination', data.page, data.total, data.pageSize, (p) => {
    state.mailPage = p;
    loadMail();
  });

  // Re-highlight selected
  if (state.selectedEmailId) {
    const row = el('email-list').querySelector(`[data-id="${state.selectedEmailId}"]`);
    if (row) row.classList.add('selected');
  }
}

function renderEmailRow(email) {
  const isRead = state.readEmails.has(email.id);
  const readClass = isRead ? 'read' : '';
  const selectedClass = email.id === state.selectedEmailId ? 'selected' : '';

  const senderName = email.fromName || email.from || 'Unknown';
  const date = formatDate(email.date, true);
  const attachIcon = email.hasAttachment ? '<span class="attach-icon" title="Has attachment">📎</span>' : '';

  // Label chips (exclude the current folder label)
  const extraLabels = (email.labels || []).filter(l => l !== email.folder && l !== 'All Mail');
  const labelChips = extraLabels.slice(0, 2).map(l => `<span class="label-chip">${escHtml(l)}</span>`).join('');

  return `
    <div class="email-row ${readClass} ${selectedClass}" data-id="${escHtml(email.id)}">
      <div class="email-sender">${escHtml(senderName)}</div>
      <div class="email-body-col">
        <span class="email-subject-text">${escHtml(email.subject || '(no subject)')}</span>
        <span class="email-sep">—</span>
        <span class="email-snippet">${escHtml(email.snippet || '')}</span>
        ${labelChips}
      </div>
      <div class="email-meta">
        ${attachIcon}
        <span class="email-date">${escHtml(date)}</span>
      </div>
    </div>
  `;
}

async function openEmail(id) {
  state.selectedEmailId = id;
  // Persist read state to disk
  if (!state.readEmails.has(id)) {
    state.readEmails.add(id);
    fetch(`/api/emails/${id}/read`, { method: 'PATCH' }).catch(() => {});
  }

  // Update selection highlight
  el('email-list').querySelectorAll('.email-row').forEach(row => {
    row.classList.toggle('selected', row.dataset.id === id);
    if (row.dataset.id === id) row.classList.add('read');
  });

  // Show detail pane
  el('email-detail-pane').classList.remove('hidden');
  el('email-list-pane').style.flex = '0 0 380px';
  el('email-detail-content').innerHTML = '<div style="padding:24px;color:#5f6368;">Loading...</div>';

  try {
    const email = await api(`/api/emails/${id}`);
    renderEmailDetail(email);
  } catch (e) {
    el('email-detail-content').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
  }
}

function renderEmailDetail(email) {
  const senderName = email.fromName || email.from || 'Unknown';
  const initial = avatarInitial(senderName);
  const color = avatarColor(senderName);

  let bodyHtml = '';
  if (email.bodyHtml) {
    // Render HTML body in sandboxed iframe
    const encoded = encodeURIComponent(email.bodyHtml);
    bodyHtml = `<iframe class="email-iframe" srcdoc="${escHtml(email.bodyHtml)}" sandbox="allow-same-origin" style="width:100%;border:none;min-height:400px;margin-top:16px;" onload="this.style.height=this.contentDocument.body.scrollHeight+40+'px'"></iframe>`;
  } else if (email.bodyText) {
    bodyHtml = `<pre style="margin-top:16px;white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:14px;line-height:1.6;">${escHtml(email.bodyText)}</pre>`;
  } else {
    bodyHtml = '<p style="color:#5f6368;margin-top:16px;">(No body)</p>';
  }

  el('email-detail-content').innerHTML = `
    <h1 class="email-detail-subject">${escHtml(email.subject || '(no subject)')}</h1>
    <div class="email-detail-header">
      <div class="email-avatar" style="background:${color}">${initial}</div>
      <div style="flex:1;min-width:0;">
        <div class="email-detail-from">${escHtml(senderName)}</div>
        <div class="email-detail-to">
          <span style="color:#5f6368;">From: </span>${escHtml(email.from || '')}
          <br><span style="color:#5f6368;">To: </span>${escHtml(email.to || '')}
        </div>
      </div>
      <div class="email-detail-date">${escHtml(formatDate(email.date))}</div>
    </div>
    <div class="email-body">${bodyHtml}</div>
  `;
}

// ── Pagination ─────────────────────────────────────────────────────────────────
function renderPagination(containerId, page, total, pageSize, onPage) {
  const container = el(containerId);
  if (total <= pageSize) { container.innerHTML = ''; return; }
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  container.innerHTML = `
    <button class="btn-page" id="${containerId}-prev" ${page <= 1 ? 'disabled' : ''}>← Newer</button>
    <span class="page-info">${start}–${end} of ${total.toLocaleString()}</span>
    <button class="btn-page" id="${containerId}-next" ${page >= totalPages ? 'disabled' : ''}>Older →</button>
  `;
  container.querySelector(`#${containerId}-prev`).addEventListener('click', () => onPage(page - 1));
  container.querySelector(`#${containerId}-next`).addEventListener('click', () => onPage(page + 1));
}

// Back button
el('email-back-btn').addEventListener('click', () => {
  el('email-detail-pane').classList.add('hidden');
  el('email-list-pane').style.flex = '';
  state.selectedEmailId = null;
  el('email-list').querySelectorAll('.email-row').forEach(r => r.classList.remove('selected'));
});

// Expose globally
window.loadMail = loadMail;
