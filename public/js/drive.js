'use strict';

const FILE_ICONS = {
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️', bmp: '🖼️', ico: '🖼️',
  pdf: '📄',
  doc: '📝', docx: '📝', txt: '📝', rtf: '📝', odt: '📝',
  xls: '📊', xlsx: '📊', csv: '📊', ods: '📊',
  ppt: '📋', pptx: '📋', odp: '📋',
  mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬', webm: '🎬', flv: '🎬',
  mp3: '🎵', wav: '🎵', ogg: '🎵', flac: '🎵', aac: '🎵', m4a: '🎵',
  zip: '🗜️', rar: '🗜️', gz: '🗜️', '7z': '🗜️', tar: '🗜️',
  html: '🌐', htm: '🌐',
  json: '📦', xml: '📦',
};

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico']);
const PDF_EXTS = new Set(['pdf']);
const TEXT_EXTS = new Set(['txt','csv','html','htm','md']);

function fileIcon(ext) {
  return FILE_ICONS[ext] || '📁';
}

function fmtSize(bytes) {
  if (!bytes) return '—';
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return Math.round(bytes / 1e3) + ' KB';
  return bytes + ' B';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Drive state
const driveState = {
  allFiles: [],
  folders: [],
  activeFolder: null,
  viewMode: 'grid',   // 'grid' | 'list'
  sortBy: 'modified', // 'name' | 'size' | 'modified'
  sortDir: 'desc',
  page: 1,
  pageSize: 60,
  search: '',
};

async function loadDrive() {
  const params = new URLSearchParams({
    folder: driveState.activeFolder || '',
    page: driveState.page,
    limit: driveState.pageSize,
    sort: driveState.sortBy,
    sortDir: driveState.sortDir,
  });
  if (driveState.search) params.set('q', driveState.search);

  let data;
  try {
    data = await api(`/api/drive?${params}`);
  } catch (e) {
    el('drive-files').innerHTML = `<div class="empty-state"><span class="empty-state-icon">⚠️</span><span>${e.message}</span></div>`;
    return;
  }

  driveState.allFiles = data.items || [];

  el('drive-count-label').textContent = `${(data.total || 0).toLocaleString()} file${data.total !== 1 ? 's' : ''}`;

  renderFolderTree(data.folders || []);
  renderBreadcrumb();
  renderDriveFiles(driveState.allFiles);
  renderPagination('drive-pagination', data.page, data.total, data.pageSize, (p) => {
    driveState.page = p;
    loadDrive();
  });
}

function renderFolderTree(folders) {
  const list = el('drive-folder-list');
  if (!list) return;

  // Build tree structure
  const tree = buildFolderTree(folders);
  list.innerHTML = renderFolderNode(tree, 0);

  list.querySelectorAll('.drive-folder-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const folder = item.dataset.folder;
      driveState.activeFolder = driveState.activeFolder === folder ? null : folder;
      driveState.page = 1;
      list.querySelectorAll('.drive-folder-item').forEach(i => i.classList.remove('active'));
      if (driveState.activeFolder) item.classList.add('active');
      loadDrive();
    });
    // Toggle children
    const toggle = item.querySelector('.folder-toggle');
    if (toggle) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const children = item.nextElementSibling;
        if (children && children.classList.contains('folder-children')) {
          children.classList.toggle('hidden');
          toggle.textContent = children.classList.contains('hidden') ? '▶' : '▼';
        }
      });
    }
  });
}

function buildFolderTree(folders) {
  const root = { children: {} };
  for (const f of folders) {
    const parts = f.replace(/^\//, '').split('/').filter(Boolean);
    let node = root;
    for (const part of parts) {
      if (!node.children[part]) node.children[part] = { name: part, path: '', children: {} };
      node = node.children[part];
    }
    node.fullPath = f;
  }
  return root;
}

function renderFolderNode(node, depth) {
  let html = '';
  for (const [name, child] of Object.entries(node.children)) {
    const hasChildren = Object.keys(child.children).length > 0;
    const isActive = driveState.activeFolder === child.fullPath;
    html += `<div class="drive-folder-item ${isActive ? 'active' : ''}" data-folder="${escHtml(child.fullPath || '/' + name)}" style="padding-left:${8 + depth * 14}px">
      ${hasChildren ? '<span class="folder-toggle">▼</span>' : '<span class="folder-toggle-spacer"></span>'}
      <span class="folder-icon-sm">📁</span>
      <span class="folder-name-text">${escHtml(name)}</span>
    </div>`;
    if (hasChildren) {
      html += `<div class="folder-children">${renderFolderNode(child, depth + 1)}</div>`;
    }
  }
  // All files option at top level
  if (depth === 0) {
    html = `<div class="drive-folder-item ${!driveState.activeFolder ? 'active' : ''}" data-folder="" style="padding-left:8px">
      <span class="folder-toggle-spacer"></span>
      <span class="folder-icon-sm">📂</span>
      <span class="folder-name-text">All Files</span>
    </div>` + html;
  }
  return html;
}

function renderBreadcrumb() {
  const toolbar = el('drive-toolbar');
  if (!toolbar) return;
  let bcHtml = '';
  if (driveState.activeFolder && driveState.activeFolder !== '/') {
    const parts = driveState.activeFolder.replace(/^\//, '').split('/').filter(Boolean);
    let built = '';
    bcHtml = `<div class="drive-breadcrumb">
      <span class="bc-item bc-link" data-path="">All Files</span>`;
    for (let i = 0; i < parts.length; i++) {
      built += '/' + parts[i];
      const isLast = i === parts.length - 1;
      bcHtml += ` <span class="bc-sep">/</span> `;
      if (isLast) {
        bcHtml += `<span class="bc-item bc-current">${escHtml(parts[i])}</span>`;
      } else {
        bcHtml += `<span class="bc-item bc-link" data-path="${escHtml(built)}">${escHtml(parts[i])}</span>`;
      }
    }
    bcHtml += `</div>`;
  }

  // Remove old breadcrumb if any
  const oldBc = toolbar.querySelector('.drive-breadcrumb');
  if (oldBc) oldBc.remove();
  if (bcHtml) {
    toolbar.insertAdjacentHTML('afterbegin', bcHtml);
    toolbar.querySelectorAll('.bc-link').forEach(bc => {
      bc.addEventListener('click', () => {
        driveState.activeFolder = bc.dataset.path || null;
        driveState.page = 1;
        loadDrive();
      });
    });
  }
}

function renderDriveFiles(files) {
  const container = el('drive-files');
  if (!files.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📂</span><span>No files found</span></div>`;
    return;
  }
  if (driveState.viewMode === 'grid') {
    container.className = 'drive-grid';
    container.innerHTML = files.map((f, i) => renderFileCard(f, i)).join('');
  } else {
    container.className = 'drive-list-table-wrap';
    container.innerHTML = `<table class="drive-list-table">
      <thead><tr>
        <th class="sort-col ${driveState.sortBy==='name'?'sort-active':''}" data-sort="name">Name ${driveState.sortBy==='name'?(driveState.sortDir==='asc'?'↑':'↓'):''}</th>
        <th>Folder</th>
        <th class="sort-col ${driveState.sortBy==='size'?'sort-active':''}" data-sort="size">Size ${driveState.sortBy==='size'?(driveState.sortDir==='asc'?'↑':'↓'):''}</th>
        <th class="sort-col ${driveState.sortBy==='modified'?'sort-active':''}" data-sort="modified">Modified ${driveState.sortBy==='modified'?(driveState.sortDir==='asc'?'↑':'↓'):''}</th>
        <th></th>
      </tr></thead>
      <tbody>${files.map((f, i) => renderFileRow(f, i)).join('')}</tbody>
    </table>`;
    container.querySelectorAll('.sort-col').forEach(th => {
      th.addEventListener('click', () => {
        const s = th.dataset.sort;
        if (driveState.sortBy === s) driveState.sortDir = driveState.sortDir === 'asc' ? 'desc' : 'asc';
        else { driveState.sortBy = s; driveState.sortDir = 'asc'; }
        driveState.page = 1;
        loadDrive();
      });
    });
  }
  // Bind click events
  container.querySelectorAll('[data-file-idx]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.drive-download-btn')) return;
      openPreview(files[parseInt(item.dataset.fileIdx)]);
    });
  });
  container.querySelectorAll('.drive-download-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `/api/drive/download/${btn.dataset.id}`;
    });
  });
}

function renderFileCard(file, idx) {
  const isImage = IMAGE_EXTS.has(file.ext);
  let thumb = '';
  if (isImage && file.isPreviewable) {
    thumb = `<div class="file-card-thumb"><img src="/api/drive/preview/${file.id}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<span class=\\'file-card-icon\\'>${fileIcon(file.ext)}</span>'"></div>`;
  } else {
    thumb = `<div class="file-card-thumb"><span class="file-card-icon">${fileIcon(file.ext)}</span></div>`;
  }
  return `<div class="file-card" data-file-idx="${idx}" title="${escHtml(file.name)}">
    ${thumb}
    <div class="file-card-info">
      <div class="file-card-name">${escHtml(file.name)}</div>
      <div class="file-card-meta">${fmtSize(file.size)} · ${fmtDate(file.modified)}</div>
    </div>
    <button class="drive-download-btn" data-id="${file.id}" title="Download">⬇</button>
  </div>`;
}

function renderFileRow(file, idx) {
  const folderShort = file.folder === '/' ? '—' : file.folder.replace(/^\//, '').split('/').slice(-1)[0];
  return `<tr class="drive-list-row" data-file-idx="${idx}">
    <td class="drive-list-name"><span class="list-icon">${fileIcon(file.ext)}</span> ${escHtml(file.name)}</td>
    <td class="drive-list-folder" title="${escHtml(file.folder)}">${escHtml(folderShort)}</td>
    <td class="drive-list-size">${fmtSize(file.size)}</td>
    <td class="drive-list-date">${fmtDate(file.modified)}</td>
    <td><button class="drive-download-btn btn-icon-sm" data-id="${file.id}" title="Download">⬇</button></td>
  </tr>`;
}

function openPreview(file) {
  el('drive-preview-title').textContent = file.name;
  const body = el('drive-preview-body');

  if (IMAGE_EXTS.has(file.ext)) {
    body.innerHTML = `<div class="preview-img-wrap"><img src="/api/drive/preview/${file.id}" alt="${escHtml(file.name)}" style="max-width:100%;max-height:70vh;object-fit:contain;"></div>`;
  } else if (PDF_EXTS.has(file.ext)) {
    body.innerHTML = `<iframe src="/api/drive/preview/${file.id}" style="width:100%;height:70vh;border:none;"></iframe>`;
  } else if (TEXT_EXTS.has(file.ext)) {
    body.innerHTML = `<div class="preview-loading">Loading…</div>`;
    fetch(`/api/drive/preview/${file.id}`)
      .then(r => r.text())
      .then(text => {
        body.innerHTML = `<pre class="preview-text">${escHtml(text.slice(0, 50000))}</pre>`;
      })
      .catch(() => {
        body.innerHTML = previewFallback(file);
      });
    // Return early to avoid the overlay show code being duplicated
    el('drive-preview-overlay').classList.remove('hidden');
    el('drive-preview-close').onclick = () => el('drive-preview-overlay').classList.add('hidden');
    return;
  } else {
    body.innerHTML = previewFallback(file);
  }

  el('drive-preview-overlay').classList.remove('hidden');
  el('drive-preview-close').onclick = () => el('drive-preview-overlay').classList.add('hidden');
}

function previewFallback(file) {
  return `<div class="preview-fallback">
    <div class="preview-fallback-icon">${fileIcon(file.ext)}</div>
    <div class="preview-fallback-name">${escHtml(file.name)}</div>
    <div class="preview-fallback-meta">${fmtSize(file.size)} · Modified ${fmtDate(file.modified)}</div>
    <div class="preview-fallback-folder">📁 ${escHtml(file.folder)}</div>
    <a href="/api/drive/download/${file.id}" class="btn-primary preview-download-btn" download="${escHtml(file.name)}">⬇ Download</a>
  </div>`;
}

// ── Setup ───────────────────────────────────────────────────────────────────
function setupDrive() {
  // View toggle
  el('drive-grid-btn').addEventListener('click', () => {
    driveState.viewMode = 'grid';
    el('drive-grid-btn').classList.add('active');
    el('drive-list-btn').classList.remove('active');
    renderDriveFiles(driveState.allFiles);
  });
  el('drive-list-btn').addEventListener('click', () => {
    driveState.viewMode = 'list';
    el('drive-list-btn').classList.add('active');
    el('drive-grid-btn').classList.remove('active');
    renderDriveFiles(driveState.allFiles);
  });

  // Search
  el('search-input').addEventListener('input', () => {
    if (state.activeTab !== 'drive') return;
    driveState.search = el('search-input').value.trim();
    driveState.page = 1;
    loadDrive();
  });

  // Close preview on overlay click
  el('drive-preview-overlay').addEventListener('click', (e) => {
    if (e.target === el('drive-preview-overlay')) el('drive-preview-overlay').classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el('drive-preview-overlay').classList.add('hidden');
  });
}

window.loadDrive = loadDrive;
window.setupDrive = setupDrive;
setupDrive();
