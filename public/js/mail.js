'use strict';

function tryFixEncoding(str) {
  if (!str) return str;
  // Only attempt if >2% of characters are 0xC2 (Â), strong mojibake signal
  let c2count = 0;
  for (let i = 0; i < Math.min(str.length, 500); i++) {
    if (str.charCodeAt(i) === 0xC2) c2count++;
  }
  if (c2count < Math.max(2, Math.min(str.length, 500) * 0.02)) return str;
  try {
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 0xFF) return str;
    }
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xFF;
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return str;
  }
}

function getAttachmentIcon(contentType, filename) {
  const ext = ((filename || '').split('.').pop() || '').toLowerCase();
  const ct = contentType || '';
  if (ct.startsWith('image/')) return '🖼️';
  if (ct.startsWith('video/')) return '🎬';
  if (ct.startsWith('audio/')) return '🎵';
  if (ext === 'pdf' || ct === 'application/pdf') return '📄';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📋';
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return '🗜️';
  return '📎';
}

function formatAttSize(bytes) {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

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
        <span class="email-snippet" style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;">${escHtml(email.snippet || '')}</span>
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

  // Fix encoding on body content (handles mojibake from QP decoding bug)
  const fixedBodyHtml = tryFixEncoding(email.bodyHtml || '');
  const fixedBodyText = tryFixEncoding(email.bodyText || '');

  let bodyHtml = '';
  const htmlToRender = fixedBodyHtml || (/^\s*<!doctype |^\s*<html/i.test(fixedBodyText) ? fixedBodyText : '');
  if (htmlToRender) {
    bodyHtml = `<iframe class="email-iframe" srcdoc="${escHtml(htmlToRender)}" sandbox="allow-same-origin allow-popups" style="width:100%;border:none;min-height:400px;margin-top:16px;" onload="this.style.height=this.contentDocument.body.scrollHeight+40+'px'"></iframe>`;
  } else if (fixedBodyText) {
    bodyHtml = `<pre style="margin-top:16px;white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:14px;line-height:1.6;">${escHtml(fixedBodyText)}</pre>`;
  } else {
    bodyHtml = '<p style="color:#5f6368;margin-top:16px;">(No body)</p>';
  }

  // Attachment chips
  let attachmentsHtml = '';
  if (email.attachments && email.attachments.length > 0) {
    const chips = email.attachments.map(att => {
      const icon = getAttachmentIcon(att.contentType, att.name);
      const sizeStr = formatAttSize(att.size);
      if (att.unavailable) {
        return `<div class="attachment-chip attachment-chip-unavailable" title="Too large to preview">
          <span class="att-icon">${icon}</span>
          <span class="att-name">${escHtml(att.name)}</span>
          <span class="att-size">${sizeStr}</span>
        </div>`;
      }
      const safeName = att.safeName || att.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_').slice(0, 200);
      const url = `/api/attachments/${encodeURIComponent(email.id)}/${encodeURIComponent(safeName)}`;
      return `<a class="attachment-chip" href="${url}" target="_blank" title="${escHtml(att.name)}">
        <span class="att-icon">${icon}</span>
        <span class="att-name">${escHtml(att.name)}</span>
        <span class="att-size">${sizeStr}</span>
      </a>`;
    }).join('');
    attachmentsHtml = `<div class="attachment-bar">
      <div class="attachment-bar-label">${email.attachments.length} attachment${email.attachments.length !== 1 ? 's' : ''}</div>
      <div class="attachment-chips">${chips}</div>
    </div>`;
  }

  const ccRow = email.cc ? `<br><span style="color:#5f6368;">CC: </span>${escHtml(email.cc)}` : '';
  const extraHeaders = email.replyTo
    ? `<div class="email-extra-headers" id="email-extra-headers" style="display:none;margin-top:4px;font-size:12px;color:#5f6368;">
        <span style="color:#5f6368;">Reply-To: </span>${escHtml(email.replyTo)}
      </div>`
    : '';
  const showMoreBtn = email.replyTo
    ? `<button class="email-show-more-btn" id="email-show-more-btn" style="font-size:11px;color:#1a73e8;background:none;border:none;padding:2px 0;cursor:pointer;margin-top:2px;">show more</button>`
    : '';

  el('email-detail-content').innerHTML = `
    <h1 class="email-detail-subject">${escHtml(email.subject || '(no subject)')}</h1>
    <div class="email-detail-header">
      <div class="email-avatar" style="background:${color}">${initial}</div>
      <div style="flex:1;min-width:0;">
        <div class="email-detail-from">${escHtml(senderName)}</div>
        <div class="email-detail-to">
          <span style="color:#5f6368;">From: </span>${escHtml(email.from || '')}
          <br><span style="color:#5f6368;">To: </span>${escHtml(email.to || '')}
          ${ccRow}
          ${extraHeaders}
          ${showMoreBtn}
        </div>
      </div>
      <div class="email-detail-date">${escHtml(formatDate(email.date))}</div>
    </div>
    ${attachmentsHtml}
    <div class="email-body">${bodyHtml}</div>
  `;

  if (email.replyTo) {
    const btn = el('email-detail-content').querySelector('#email-show-more-btn');
    const extra = el('email-detail-content').querySelector('#email-extra-headers');
    if (btn && extra) {
      btn.addEventListener('click', () => {
        const hidden = extra.style.display === 'none';
        extra.style.display = hidden ? '' : 'none';
        btn.textContent = hidden ? 'show less' : 'show more';
      });
    }
  }
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
