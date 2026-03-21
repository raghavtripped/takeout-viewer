'use strict';

const FILE_ICONS = {
  '.pdf': '📄', '.doc': '📝', '.docx': '📝', '.txt': '📃',
  '.xls': '📊', '.xlsx': '📊', '.csv': '📊',
  '.ppt': '📊', '.pptx': '📊',
  '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️', '.webp': '🖼️', '.svg': '🖼️',
  '.mp3': '🎵', '.wav': '🎵', '.flac': '🎵', '.m4a': '🎵',
  '.mp4': '🎬', '.mov': '🎬', '.avi': '🎬', '.mkv': '🎬',
  '.zip': '📦', '.tar': '📦', '.gz': '📦', '.7z': '📦',
  '.js': '⚙️', '.ts': '⚙️', '.py': '⚙️', '.java': '⚙️', '.go': '⚙️',
  '.html': '🌐', '.css': '🎨', '.json': '📋',
};

function fileIcon(ext) {
  return FILE_ICONS[ext.toLowerCase()] || '📄';
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderDriveFolderSidebar(folders) {
  const list = el('drive-folder-list');
  list.innerHTML = `
    <li class="folder-item ${!state.driveFolder ? 'active' : ''}" data-folder="">
      <span>📁 All Files</span>
    </li>
    ${folders.map(f => `
      <li class="folder-item ${state.driveFolder === f ? 'active' : ''}" data-folder="${escHtml(f)}">
        <span title="${escHtml(f)}">📁 ${escHtml(f.split('/').pop() || f)}</span>
      </li>
    `).join('')}
  `;
  list.querySelectorAll('.folder-item').forEach(item => {
    item.addEventListener('click', () => {
      state.driveFolder = item.dataset.folder || null;
      state.drivePage = 1;
      loadDrive();
    });
  });
}

async function loadDrive() {
  const params = new URLSearchParams({ page: state.drivePage, limit: 50 });
  if (state.searchQuery) params.set('q', state.searchQuery);
  if (state.driveFolder) params.set('folder', state.driveFolder);

  let data;
  try {
    data = await api(`/api/drive?${params}`);
  } catch (e) {
    el('drive-files').innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠️</span><span>${e.message}</span></div>`;
    return;
  }

  renderDriveFolderSidebar(data.folders || []);
  el('drive-count-label').textContent = `${data.total.toLocaleString()} file${data.total !== 1 ? 's' : ''}`;

  if (data.items.length === 0) {
    el('drive-files').innerHTML = `<div class="empty-state"><span class="empty-state-icon">📂</span><span>No files found</span></div>`;
  } else if (state.driveView === 'grid') {
    renderDriveGrid(data.items);
  } else {
    renderDriveList(data.items);
  }

  renderDrivePagination(data.page, data.total, data.pageSize);
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const PDF_EXTS = new Set(['.pdf']);

function openDrivePreview(file) {
  const overlay = el('drive-preview-overlay');
  const body = el('drive-preview-body');
  const ext = (file.ext || '').toLowerCase();

  let content = '';
  if (IMAGE_EXTS.has(ext)) {
    content = `<img src="/api/drive/preview/${escHtml(file.id)}" alt="${escHtml(file.name)}" style="max-width:100%;max-height:70vh;display:block;margin:auto;border-radius:4px;">`;
  } else if (PDF_EXTS.has(ext)) {
    content = `<iframe src="/api/drive/preview/${escHtml(file.id)}" style="width:100%;height:70vh;border:none;border-radius:4px;"></iframe>`;
  } else {
    content = `
      <div style="text-align:center;padding:32px 16px;">
        <div style="font-size:56px;margin-bottom:16px;">${fileIcon(file.ext)}</div>
        <div style="font-size:18px;font-weight:500;margin-bottom:8px;">${escHtml(file.name)}</div>
        <div style="color:#5f6368;font-size:13px;margin-bottom:4px;">${formatSize(file.size)}</div>
        <div style="color:#5f6368;font-size:13px;margin-bottom:24px;">${escHtml(formatDate(file.modified, true))}</div>
        <a href="/api/drive/download/${escHtml(file.id)}" class="btn-primary" download style="font-size:15px;padding:10px 28px;">Download</a>
      </div>
    `;
  }

  el('drive-preview-title').textContent = file.name;
  body.innerHTML = content;
  overlay.classList.remove('hidden');
}

function renderDriveGrid(files) {
  el('drive-files').innerHTML = `
    <div class="drive-grid">
      ${files.map(f => `
        <div class="drive-card" data-id="${escHtml(f.id)}" style="cursor:pointer;">
          <div class="drive-card-icon">${fileIcon(f.ext)}</div>
          <div class="drive-card-name" title="${escHtml(f.name)}">${escHtml(f.name)}</div>
          <div class="drive-card-meta">${formatSize(f.size)}</div>
          <div class="drive-card-meta">${escHtml(formatDate(f.modified, true))}</div>
        </div>
      `).join('')}
    </div>
  `;
  // Attach click handlers — need file objects for preview
  el('drive-files').querySelectorAll('.drive-card').forEach((card, i) => {
    card.addEventListener('click', () => openDrivePreview(files[i]));
  });
}

function renderDriveList(files) {
  el('drive-files').innerHTML = `
    <table class="drive-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Size</th>
          <th>Modified</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${files.map(f => `
          <tr data-idx="${files.indexOf(f)}" style="cursor:pointer;">
            <td class="file-name">${fileIcon(f.ext)} ${escHtml(f.name)}</td>
            <td class="file-size">${formatSize(f.size)}</td>
            <td class="file-date">${escHtml(formatDate(f.modified, true))}</td>
            <td><a href="/api/drive/download/${escHtml(f.id)}" class="btn-download" download onclick="event.stopPropagation()">Download</a></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  el('drive-files').querySelectorAll('tr[data-idx]').forEach(row => {
    row.addEventListener('click', () => openDrivePreview(files[parseInt(row.dataset.idx, 10)]));
  });
}

function renderDrivePagination(page, total, pageSize) {
  renderPagination('drive-pagination', page, total, pageSize, (p) => {
    state.drivePage = p;
    loadDrive();
  });
}

// Drive preview modal close
el('drive-preview-close').addEventListener('click', () => {
  el('drive-preview-overlay').classList.add('hidden');
  el('drive-preview-body').innerHTML = '';
});
el('drive-preview-overlay').addEventListener('click', (e) => {
  if (e.target === el('drive-preview-overlay')) {
    el('drive-preview-overlay').classList.add('hidden');
    el('drive-preview-body').innerHTML = '';
  }
});

// View toggle
el('drive-grid-btn').addEventListener('click', () => {
  state.driveView = 'grid';
  el('drive-grid-btn').classList.add('active');
  el('drive-list-btn').classList.remove('active');
  loadDrive();
});
el('drive-list-btn').addEventListener('click', () => {
  state.driveView = 'list';
  el('drive-list-btn').classList.add('active');
  el('drive-grid-btn').classList.remove('active');
  loadDrive();
});

window.loadDrive = loadDrive;
