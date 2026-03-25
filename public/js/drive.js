'use strict';

const FILE_ICONS = {
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️', bmp: '🖼️', ico: '🖼️',
  pdf: '📄',
  doc: '📝', docx: '📝', txt: '📝', rtf: '📝', odt: '📝',
  xls: '📊', xlsx: '📊', csv: '📊', ods: '📊',
  ppt: '📋', pptx: '📋', odp: '📋',
  mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬', webm: '🎬',
  mp3: '🎵', wav: '🎵', ogg: '🎵', flac: '🎵', aac: '🎵', m4a: '🎵',
  zip: '🗜️', rar: '🗜️', gz: '🗜️', '7z': '🗜️', tar: '🗜️',
  html: '🌐', htm: '🌐',
  json: '📦', xml: '📦',
};

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico']);

function fileIcon(ext) { return FILE_ICONS[ext] || '📄'; }

function fmtSize(bytes) {
  if (!bytes) return '—';
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return Math.round(bytes / 1e3) + ' KB';
  return bytes + ' B';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Drive state
const driveState = {
  allFiles: [],
  allFolders: [],       // full list from server (all folder paths)
  activeFolder: '/',    // current folder path; '/' = root
  viewMode: 'grid',
  sortBy: 'name',
  sortDir: 'asc',
  page: 1,
  pageSize: 60,
  search: '',
};

// Returns direct child folder paths of a given parent
function getDirectSubfolders(allFolders, parent) {
  const prefix = parent === '/' ? '' : parent;
  return allFolders.filter(f => {
    if (f === '/') return false;
    if (!f.startsWith(prefix + '/')) return false;
    const rest = f.slice(prefix.length + 1); // strip parent prefix + '/'
    return rest.length > 0 && !rest.includes('/'); // no further slashes = direct child
  });
}

async function loadDrive() {
  const params = new URLSearchParams({
    folder: driveState.search ? '' : driveState.activeFolder,
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
  driveState.allFolders = data.folders || [];

  const subfolders = driveState.search ? [] : getDirectSubfolders(driveState.allFolders, driveState.activeFolder);

  const fileCount = data.total || 0;
  const folderCount = subfolders.length;
  let label = '';
  if (folderCount && fileCount) label = `${folderCount} folder${folderCount !== 1 ? 's' : ''}, ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
  else if (folderCount) label = `${folderCount} folder${folderCount !== 1 ? 's' : ''}`;
  else label = `${fileCount} file${fileCount !== 1 ? 's' : ''}`;
  el('drive-count-label').textContent = label;

  renderFolderSidebar(driveState.allFolders);
  renderBreadcrumb();
  renderDriveContent(subfolders, driveState.allFiles);

  if (!driveState.search) {
    renderPagination('drive-pagination', data.page, data.total, data.pageSize, (p) => {
      driveState.page = p;
      loadDrive();
    });
  } else {
    el('drive-pagination').innerHTML = '';
  }
}

// ── Sidebar (collapsible tree for quick-jump) ───────────────────────────────
function renderFolderSidebar(allFolders) {
  const list = el('drive-folder-list');
  if (!list) return;
  const tree = buildFolderTree(allFolders);
  list.innerHTML =
    `<div class="drive-folder-item ${driveState.activeFolder === '/' ? 'active' : ''}" data-folder="/">
      <span class="folder-toggle-spacer"></span>
      <span class="folder-icon-sm">📂</span>
      <span class="folder-name-text">My Drive</span>
    </div>` +
    renderFolderNode(tree, 0);

  list.querySelectorAll('.drive-folder-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToFolder(item.dataset.folder);
    });
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
    if (f === '/') continue;
    const parts = f.replace(/^\//, '').split('/').filter(Boolean);
    let node = root;
    for (const part of parts) {
      if (!node.children[part]) node.children[part] = { name: part, fullPath: '', children: {} };
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
    const fp = child.fullPath || ('/' + name);
    html += `<div class="drive-folder-item ${isActive ? 'active' : ''}" data-folder="${escHtml(fp)}" style="padding-left:${8 + depth * 14}px">
      ${hasChildren ? '<span class="folder-toggle">▼</span>' : '<span class="folder-toggle-spacer"></span>'}
      <span class="folder-icon-sm">📁</span>
      <span class="folder-name-text">${escHtml(name)}</span>
    </div>`;
    if (hasChildren) {
      html += `<div class="folder-children">${renderFolderNode(child, depth + 1)}</div>`;
    }
  }
  return html;
}

// ── Breadcrumb ──────────────────────────────────────────────────────────────
function renderBreadcrumb() {
  const toolbar = el('drive-toolbar');
  const oldBc = toolbar.querySelector('.drive-breadcrumb');
  if (oldBc) oldBc.remove();

  const folder = driveState.activeFolder;
  if (!folder || folder === '/') return;

  const parts = folder.replace(/^\//, '').split('/').filter(Boolean);
  let built = '';
  let html = `<div class="drive-breadcrumb">
    <span class="bc-item bc-link" data-path="/">My Drive</span>`;
  for (let i = 0; i < parts.length; i++) {
    built += '/' + parts[i];
    html += ` <span class="bc-sep">/</span> `;
    if (i === parts.length - 1) {
      html += `<span class="bc-item bc-current">${escHtml(parts[i])}</span>`;
    } else {
      html += `<span class="bc-item bc-link" data-path="${escHtml(built)}">${escHtml(parts[i])}</span>`;
    }
  }
  html += `</div>`;

  toolbar.insertAdjacentHTML('afterbegin', html);
  toolbar.querySelectorAll('.bc-link').forEach(bc => {
    bc.addEventListener('click', () => navigateToFolder(bc.dataset.path || '/'));
  });
}

// ── Navigate to folder ──────────────────────────────────────────────────────
function navigateToFolder(folderPath) {
  driveState.activeFolder = folderPath || '/';
  driveState.page = 1;
  loadDrive();
}

// ── Main content area ───────────────────────────────────────────────────────
function renderDriveContent(subfolders, files) {
  const container = el('drive-files');

  if (driveState.viewMode === 'list') {
    renderListView(subfolders, files, container);
    return;
  }

  // Grid view: folders first, then files
  let html = '';

  if (subfolders.length) {
    html += `<div class="drive-section-label">Folders</div><div class="drive-grid drive-folder-grid">`;
    html += subfolders.map(fp => {
      const name = fp.split('/').pop();
      return `<div class="file-card drive-folder-card" data-folder="${escHtml(fp)}">
        <div class="file-card-thumb"><span class="file-card-icon">📁</span></div>
        <div class="file-card-info">
          <div class="file-card-name">${escHtml(name)}</div>
        </div>
      </div>`;
    }).join('');
    html += `</div>`;
  }

  if (files.length) {
    if (subfolders.length) html += `<div class="drive-section-label">Files</div>`;
    html += `<div class="drive-grid">`;
    html += files.map((f, i) => renderFileCard(f, i)).join('');
    html += `</div>`;
  }

  if (!subfolders.length && !files.length) {
    html = `<div class="empty-state"><span class="empty-state-icon">📂</span><span>This folder is empty</span></div>`;
  }

  container.className = '';
  container.innerHTML = html;

  // Folder card clicks → navigate
  container.querySelectorAll('.drive-folder-card').forEach(card => {
    card.addEventListener('click', () => navigateToFolder(card.dataset.folder));
  });

  // File card clicks → preview
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

function renderListView(subfolders, files, container) {
  container.className = 'drive-list-table-wrap';
  let rows = '';

  subfolders.forEach(fp => {
    const name = fp.split('/').pop();
    rows += `<tr class="drive-list-row drive-folder-row" data-folder="${escHtml(fp)}">
      <td class="drive-list-name"><span class="list-icon">📁</span> ${escHtml(name)}</td>
      <td>—</td><td>—</td><td>—</td><td></td>
    </tr>`;
  });

  files.forEach((f, i) => {
    rows += `<tr class="drive-list-row" data-file-idx="${i}">
      <td class="drive-list-name"><span class="list-icon">${fileIcon(f.ext)}</span> ${escHtml(f.name)}</td>
      <td class="drive-list-size">${fmtSize(f.size)}</td>
      <td class="drive-list-date">${fmtDate(f.modified)}</td>
      <td><button class="drive-download-btn btn-icon-sm" data-id="${f.id}" title="Download">⬇</button></td>
    </tr>`;
  });

  container.innerHTML = `<table class="drive-list-table">
    <thead><tr>
      <th class="sort-col ${driveState.sortBy==='name'?'sort-active':''}" data-sort="name">Name</th>
      <th class="sort-col ${driveState.sortBy==='size'?'sort-active':''}" data-sort="size">Size</th>
      <th class="sort-col ${driveState.sortBy==='modified'?'sort-active':''}" data-sort="modified">Modified</th>
      <th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  container.querySelectorAll('.drive-folder-row').forEach(row => {
    row.addEventListener('click', () => navigateToFolder(row.dataset.folder));
  });
  container.querySelectorAll('[data-file-idx]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.drive-download-btn')) return;
      openPreview(files[parseInt(row.dataset.fileIdx)]);
    });
  });
  container.querySelectorAll('.drive-download-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); window.location.href = `/api/drive/download/${btn.dataset.id}`; });
  });
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

function renderFileCard(file, idx) {
  const isImage = IMAGE_EXTS.has(file.ext);
  const thumb = isImage && file.isPreviewable
    ? `<div class="file-card-thumb"><img src="/api/drive/preview/${file.id}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<span class=\\'file-card-icon\\'>${fileIcon(file.ext)}</span>'"></div>`
    : `<div class="file-card-thumb"><span class="file-card-icon">${fileIcon(file.ext)}</span></div>`;
  return `<div class="file-card" data-file-idx="${idx}" title="${escHtml(file.name)}">
    ${thumb}
    <div class="file-card-info">
      <div class="file-card-name">${escHtml(file.name)}</div>
      <div class="file-card-meta">${fmtSize(file.size)} · ${fmtDate(file.modified)}</div>
    </div>
    <button class="drive-download-btn" data-id="${file.id}" title="Download">⬇</button>
  </div>`;
}

// ── Preview overlay ──────────────────────────────────────────────────────────
function openPreview(file) {
  el('drive-preview-title').textContent = file.name;
  const body = el('drive-preview-body');

  if (IMAGE_EXTS.has(file.ext)) {
    body.innerHTML = `<div class="preview-img-wrap"><img src="/api/drive/preview/${file.id}" alt="${escHtml(file.name)}" style="max-width:100%;max-height:70vh;object-fit:contain;"></div>`;
  } else if (file.ext === 'pdf') {
    body.innerHTML = `<iframe src="/api/drive/preview/${file.id}" style="width:100%;height:70vh;border:none;"></iframe>`;
  } else if (['txt','csv','html','htm','md'].includes(file.ext)) {
    body.innerHTML = `<div class="preview-loading">Loading…</div>`;
    fetch(`/api/drive/preview/${file.id}`)
      .then(r => r.text())
      .then(text => { body.innerHTML = `<pre class="preview-text">${escHtml(text.slice(0, 50000))}</pre>`; })
      .catch(() => { body.innerHTML = previewFallback(file); });
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

// ── Setup ────────────────────────────────────────────────────────────────────
function setupDrive() {
  el('drive-grid-btn').addEventListener('click', () => {
    driveState.viewMode = 'grid';
    el('drive-grid-btn').classList.add('active');
    el('drive-list-btn').classList.remove('active');
    renderDriveContent(
      getDirectSubfolders(driveState.allFolders, driveState.activeFolder),
      driveState.allFiles
    );
  });
  el('drive-list-btn').addEventListener('click', () => {
    driveState.viewMode = 'list';
    el('drive-list-btn').classList.add('active');
    el('drive-grid-btn').classList.remove('active');
    renderDriveContent(
      getDirectSubfolders(driveState.allFolders, driveState.activeFolder),
      driveState.allFiles
    );
  });

  el('search-input').addEventListener('input', () => {
    if (state.activeTab !== 'drive') return;
    driveState.search = el('search-input').value.trim();
    driveState.page = 1;
    loadDrive();
  });

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
