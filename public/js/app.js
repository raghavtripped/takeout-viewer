'use strict';

// ── Global State ──────────────────────────────────────────────────────────────
const state = {
  activeTab: 'mail',
  activeFolder: 'Inbox',
  searchQuery: '',
  mailPage: 1,
  drivePage: 1,
  driveView: 'grid',
  driveFolder: null,
  calView: 'list',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  selectedEmailId: null,
  readEmails: new Set(),
  // Keep
  keepPage: 1,
  keepLabel: null,
  // Tasks
  tasksFilter: 'all',      // 'all' | 'pending' | 'completed'
  // Chrome
  chromeType: 'bookmarks', // 'bookmarks' | 'history'
  chromePage: 1,
  // Chat
  activeChatId: null,
  chatMsgPage: 1,
  // Saved
  savedPage: 1,
};

// All tabs and their count keys (for hide-if-empty)
const ALL_TABS = [
  { tab: 'mail',      countKey: 'emails' },
  { tab: 'drive',     countKey: 'driveFiles' },
  { tab: 'calendar',  countKey: 'events' },
  { tab: 'contacts',  countKey: 'contacts' },
  { tab: 'keep',      countKey: 'keepNotes' },
  { tab: 'tasks',     countKey: 'tasks' },
  { tab: 'chrome',    countKey: 'chromeBookmarks', altKey: 'chromeHistory' },
  { tab: 'chat',      countKey: 'chatConversations' },
  { tab: 'saved',     countKey: 'savedLinks' },
];

// ── API ────────────────────────────────────────────────────────────────────────
async function api(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ── Utilities ──────────────────────────────────────────────────────────────────
function formatDate(isoStr, compact = false) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d)) return '';
  const now = new Date();
  const isThisYear = d.getFullYear() === now.getFullYear();
  if (compact) {
    if (isThisYear) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
  }
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function el(id) { return document.getElementById(id); }

function avatarColor(name) {
  const colors = ['#1a73e8','#0f9d58','#f4b400','#db4437','#ab47bc','#00897b','#f57c00','#546e7a'];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

function avatarInitial(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

// ── Tab Switching ──────────────────────────────────────────────────────────────
const ALL_TAB_IDS = ALL_TABS.map(t => t.tab);

function switchTab(tab) {
  state.activeTab = tab;
  state.searchQuery = '';
  el('search-input').value = '';
  el('search-clear').classList.add('hidden');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });

  ALL_TAB_IDS.forEach(t => {
    const viewEl = el(`view-${t}`);
    if (viewEl) viewEl.classList.toggle('hidden', t !== tab);
    const sidebarEl = el(`${t}-sidebar`);
    if (sidebarEl) sidebarEl.classList.toggle('hidden', t !== tab);
  });

  // Load the active view
  const loaders = {
    mail:      () => { state.mailPage = 1; window.loadMail(); },
    drive:     () => { state.drivePage = 1; state.driveFolder = null; window.loadDrive(); },
    calendar:  () => window.loadCalendar(),
    contacts:  () => window.loadContacts(),
    keep:      () => { state.keepPage = 1; state.keepLabel = null; window.loadKeep(); },
    tasks:     () => window.loadTasks(),
    chrome:    () => { state.chromePage = 1; window.loadChrome(); },
    chat:      () => window.loadChat(),
    saved:     () => { state.savedPage = 1; window.loadSaved(); },
  };
  if (loaders[tab]) loaders[tab]();
}

// ── Search ─────────────────────────────────────────────────────────────────────
let searchTimer = null;

function triggerSearch() {
  const loaders = {
    mail:     () => { state.mailPage = 1; window.loadMail(); },
    drive:    () => { state.drivePage = 1; window.loadDrive(); },
    calendar: () => window.loadCalendar(),
    contacts: () => window.loadContacts(),
    keep:     () => { state.keepPage = 1; window.loadKeep(); },
    tasks:    () => window.loadTasks(),
    chrome:   () => { state.chromePage = 1; window.loadChrome(); },
    chat:     () => window.loadChat(),
    saved:    () => { state.savedPage = 1; window.loadSaved(); },
  };
  if (loaders[state.activeTab]) loaders[state.activeTab]();
}

el('search-input').addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  el('search-clear').classList.toggle('hidden', !state.searchQuery);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(triggerSearch, 300);
});

el('search-clear').addEventListener('click', () => {
  el('search-input').value = '';
  state.searchQuery = '';
  el('search-clear').classList.add('hidden');
  triggerSearch();
});

// ── Nav Tab Clicks ─────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => switchTab(item.dataset.tab));
});

// ── Sidebar Toggle ─────────────────────────────────────────────────────────────
el('sidebar-toggle').addEventListener('click', () => {
  el('sidebar').classList.toggle('collapsed');
});

// ── Reset / Re-import ──────────────────────────────────────────────────────────
el('reset-btn').addEventListener('click', async () => {
  if (!confirm('Reset all indexed data? This cannot be undone.')) return;
  await fetch('/api/reset', { method: 'POST' });
  showOnboarding();
});

el('reimport-btn').addEventListener('click', () => {
  if (!confirm('Start a fresh import? This will reset existing data.')) return;
  fetch('/api/reset', { method: 'POST' }).then(() => showOnboarding());
});

// ── Onboarding ─────────────────────────────────────────────────────────────────
function showOnboarding() {
  el('app').classList.add('hidden');
  el('onboarding').classList.remove('hidden');
  el('progress-area').classList.add('hidden');
  el('selected-files').classList.add('hidden');
  el('import-btn').classList.add('hidden');
  el('progress-bar').style.width = '0%';
  setupOnboarding();
}

function showApp(counts) {
  el('onboarding').classList.add('hidden');
  el('app').classList.remove('hidden');
  applyTabVisibility(counts || {});
  // Switch to first visible tab
  const firstVisible = ALL_TABS.find(t => {
    const navItem = document.querySelector(`.nav-item[data-tab="${t.tab}"]`);
    return navItem && !navItem.classList.contains('nav-item-hidden');
  });
  switchTab(firstVisible ? firstVisible.tab : 'mail');
}

function applyTabVisibility(counts) {
  for (const { tab, countKey, altKey } of ALL_TABS) {
    const count = (counts[countKey] || 0) + (altKey ? (counts[altKey] || 0) : 0);
    const navItem = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    if (navItem) {
      navItem.classList.toggle('nav-item-hidden', count === 0);
    }
  }
}

function setupOnboarding() {
  const dropZone = el('drop-zone');
  const fileInput = el('file-input');
  const selectedFiles = el('selected-files');
  const importBtn = el('import-btn');
  let selectedFilesList = [];

  function updateFileList(files) {
    selectedFilesList = Array.from(files);
    if (selectedFilesList.length === 0) {
      selectedFiles.classList.add('hidden');
      importBtn.classList.add('hidden');
      return;
    }
    selectedFiles.classList.remove('hidden');
    importBtn.classList.remove('hidden');
    selectedFiles.textContent = selectedFilesList.map(f =>
      `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`
    ).join('\n');
  }

  // Remove old listeners by replacing element (prevent duplicate handlers on re-show)
  const newDrop = dropZone.cloneNode(true);
  dropZone.parentNode.replaceChild(newDrop, dropZone);
  const newInput = el('file-input');
  const newImportBtn = el('import-btn');

  newDrop.addEventListener('dragover', (e) => { e.preventDefault(); newDrop.classList.add('drag-over'); });
  newDrop.addEventListener('dragleave', () => newDrop.classList.remove('drag-over'));
  newDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    newDrop.classList.remove('drag-over');
    updateFileList(e.dataTransfer.files);
  });
  newInput.addEventListener('change', () => updateFileList(newInput.files));
  newDrop.addEventListener('click', (e) => {
    if (e.target.tagName !== 'LABEL') newInput.click();
  });
  newImportBtn.addEventListener('click', () => {
    if (selectedFilesList.length === 0) return;
    startImport(selectedFilesList);
  });
}

function formatBytes(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' MB';
  return (bytes / 1e3).toFixed(0) + ' KB';
}

function startImport(files) {
  const formData = new FormData();
  let totalBytes = 0;
  for (const f of files) { formData.append('files', f); totalBytes += f.size; }

  el('import-btn').disabled = true;
  el('progress-area').classList.remove('hidden');
  el('progress-stage').textContent = 'Uploading...';
  el('progress-message').textContent = `Sending ${formatBytes(totalBytes)} to local server…`;

  const xhr = new XMLHttpRequest();
  let uploadStart = Date.now();

  xhr.upload.addEventListener('progress', (e) => {
    if (!e.lengthComputable) return;
    const pct = Math.round((e.loaded / e.total) * 100);
    el('progress-bar').style.width = pct + '%';
    const elapsed = (Date.now() - uploadStart) / 1000;
    const rate = e.loaded / elapsed; // bytes/sec
    const remaining = rate > 0 ? (e.total - e.loaded) / rate : 0;
    const eta = remaining > 60
      ? Math.ceil(remaining / 60) + ' min remaining'
      : Math.ceil(remaining) + ' sec remaining';
    el('progress-message').textContent =
      `Uploading: ${formatBytes(e.loaded)} / ${formatBytes(e.total)} (${pct}%) — ${eta}`;
  });

  xhr.addEventListener('load', () => {
    let data;
    try { data = JSON.parse(xhr.responseText); } catch { data = { error: 'Invalid server response' }; }
    if (data.error) { el('progress-stage').textContent = 'Error: ' + data.error; return; }
    el('progress-bar').style.width = '0%';
    listenToProgress();
  });

  xhr.addEventListener('error', () => {
    el('progress-stage').textContent = 'Upload failed — check that the server is still running';
  });

  xhr.open('POST', '/api/import');
  xhr.send(formData);
}

function listenToProgress() {
  const es = new EventSource('/api/import/progress');
  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    el('progress-bar').style.width = event.percent + '%';
    el('progress-message').textContent = event.message;

    const stageNames = {
      extracting: 'Extracting zip...',
      indexing_emails: 'Indexing emails...',
      indexing_drive: 'Indexing Drive...',
      indexing_calendar: 'Indexing Calendar...',
      indexing_contacts: 'Indexing Contacts...',
      indexing_keep: 'Indexing Keep...',
      indexing_tasks: 'Indexing Tasks...',
      indexing_chrome: 'Indexing Chrome...',
      indexing_chat: 'Indexing Chat...',
      indexing_saved: 'Indexing Saved links...',
      done: 'Done!',
      error: 'Error',
    };
    el('progress-stage').textContent = stageNames[event.stage] || event.stage;

    if (event.stage === 'done') {
      es.close();
      setTimeout(() => showApp(event.counts), 800);
    }
    if (event.stage === 'error') {
      es.close();
      el('import-btn').disabled = false;
    }
  };
  es.onerror = () => { es.close(); };
}

// Shared pagination renderer (used by mail.js, drive.js, keep.js, chrome.js, saved.js)
function renderPagination(containerId, page, total, pageSize, onPage) {
  const container = el(containerId);
  if (!container) return;
  if (total <= pageSize) { container.innerHTML = ''; return; }
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  container.innerHTML = `
    <button class="btn-page" id="${containerId}-prev" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
    <span class="page-info">${start}–${end} of ${total.toLocaleString()}</span>
    <button class="btn-page" id="${containerId}-next" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
  `;
  container.querySelector(`#${containerId}-prev`).addEventListener('click', () => onPage(page - 1));
  container.querySelector(`#${containerId}-next`).addEventListener('click', () => onPage(page + 1));
}

// ── Boot ───────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    const status = await api('/api/status');
    if (status.indexed) {
      showApp(status.counts);
    } else if (status.importing) {
      el('onboarding').classList.remove('hidden');
      el('progress-area').classList.remove('hidden');
      setupOnboarding();
      listenToProgress();
    } else {
      showOnboarding();
    }
  } catch {
    showOnboarding();
  }
}

boot();
