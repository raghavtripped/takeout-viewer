'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { processFiles, processLocalPaths, setProgressCallback, setAbortFlag } = require('./indexer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

db.ensureDirs();

// Clean up any orphaned upload files left over from a previous crashed/killed session
(function cleanStaleUploads() {
  const uploadsDir = db.getUploadsDir();
  try {
    for (const f of fs.readdirSync(uploadsDir)) {
      try { fs.unlinkSync(path.join(uploadsDir, f)); } catch {}
    }
  } catch {}
})();

// ── Upload ────────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, db.getUploadsDir()),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// ── SSE Progress ──────────────────────────────────────────────────────────────

const sseClients = new Set();

function broadcastProgress(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) res.write(data);
}

app.get('/api/import/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ── Import ────────────────────────────────────────────────────────────────────

let importRunning = false;

app.post('/api/import', (req, res, next) => upload.array('files')(req, res, next), async (req, res) => {
  if (importRunning) return res.status(409).json({ error: 'Import already in progress' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const filePaths = req.files.map(f => f.path);
  res.json({ ok: true, files: filePaths.map(p => path.basename(p)) });

  importRunning = true;
  setProgressCallback(broadcastProgress);

  try {
    const counts = await processFiles(filePaths);
    const summary = [
      counts.emails && `${counts.emails} emails`,
      counts.driveFiles && `${counts.driveFiles} Drive files`,
      counts.events && `${counts.events} events`,
      counts.contacts && `${counts.contacts} contacts`,
      counts.keepNotes && `${counts.keepNotes} Keep notes`,
      counts.tasks && `${counts.tasks} tasks`,
      counts.chromeBookmarks && `${counts.chromeBookmarks} bookmarks`,
      counts.chromeHistory && `${counts.chromeHistory} history entries`,
      counts.chatConversations && `${counts.chatConversations} chat conversations`,
      counts.savedLinks && `${counts.savedLinks} saved links`,
    ].filter(Boolean).join(', ');
    broadcastProgress({ stage: 'done', message: `Import complete! ${summary}.`, percent: 100, counts });
  } catch (err) {
    console.error('[import] Error:', err);
    broadcastProgress({ stage: 'error', message: err.message, percent: 0 });
  } finally {
    importRunning = false;
    for (const p of filePaths) { try { fs.unlinkSync(p); } catch {} }
  }
});

// ── Status ────────────────────────────────────────────────────────────────────

app.get('/api/status', (req, res) => {
  const index = db.readIndex();
  res.json({
    indexed: index.indexed || false,
    importing: importRunning,
    counts: {
      emails: (index.emails || []).length,
      driveFiles: (index.driveFiles || []).length,
      events: (index.events || []).length,
      contacts: (index.contacts || []).length,
      keepNotes: (index.keepNotes || []).length,
      tasks: (index.tasks || []).length,
      chromeBookmarks: (index.chromeBookmarks || []).length,
      chromeHistory: (index.chromeHistory || []).length,
      chatConversations: (index.chatConversations || []).length,
      savedLinks: (index.savedLinks || []).length,
    },
  });
});

// ── Emails ────────────────────────────────────────────────────────────────────

app.get('/api/emails', (req, res) => {
  const index = db.readIndex();
  const { q, folder, page = '1', limit = '50' } = req.query;
  let emails = index.emails || [];

  const folderCounts = {};
  for (const e of emails) {
    const f = e.folder || 'All Mail';
    folderCounts[f] = (folderCounts[f] || 0) + 1;
  }

  if (folder && folder !== 'All Mail') {
    emails = emails.filter(e => e.folder === folder);
  }
  if (q) {
    const lower = q.toLowerCase();
    emails = emails.filter(e =>
      (e.subject || '').toLowerCase().includes(lower) ||
      (e.from || '').toLowerCase().includes(lower) ||
      (e.snippet || '').toLowerCase().includes(lower)
    );
  }

  emails = [...emails].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const pageNum = Math.max(1, parseInt(page, 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const total = emails.length;
  const items = emails.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  const readIds = Array.from(db.getReadIds());
  res.json({ items, total, page: pageNum, pageSize, folderCounts, readIds });
});

app.get('/api/emails/:id', (req, res) => {
  const email = db.readEmail(req.params.id);
  if (!email) return res.status(404).json({ error: 'Not found' });
  res.json(email);
});

app.patch('/api/emails/:id/read', (req, res) => {
  db.markRead(req.params.id);
  res.json({ ok: true });
});

// ── Drive ─────────────────────────────────────────────────────────────────────

app.get('/api/drive', (req, res) => {
  const index = db.readIndex();
  const { q, folder, page = '1', limit = '50' } = req.query;
  let files = index.driveFiles || [];

  const folderSet = new Set(files.map(f => f.folder));
  const folders = Array.from(folderSet).sort();

  if (folder) files = files.filter(f => f.folder === folder || f.folder.startsWith(folder + '/'));
  if (q) {
    const lower = q.toLowerCase();
    files = files.filter(f => (f.name || '').toLowerCase().includes(lower));
  }

  files = [...files].sort((a, b) => new Date(b.modified) - new Date(a.modified));
  const pageNum = Math.max(1, parseInt(page, 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const total = files.length;
  const items = files.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  res.json({ items, total, page: pageNum, pageSize, folders });
});

app.get('/api/drive/download/:id', (req, res) => {
  const index = db.readIndex();
  const file = (index.driveFiles || []).find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  if (!fs.existsSync(file.fullPath)) return res.status(404).json({ error: 'File not found on disk' });
  res.download(file.fullPath, file.name);
});

app.get('/api/drive/preview/:id', (req, res) => {
  const index = db.readIndex();
  const file = (index.driveFiles || []).find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  if (!fs.existsSync(file.fullPath)) return res.status(404).json({ error: 'File not found on disk' });
  // Serve inline so browser renders images/PDFs directly
  res.sendFile(file.fullPath);
});

// ── Calendar ──────────────────────────────────────────────────────────────────

app.get('/api/calendar', (req, res) => {
  const index = db.readIndex();
  const { q, month, year } = req.query;
  let events = index.events || [];

  if (year) {
    const y = parseInt(year, 10);
    events = events.filter(e => e.start && new Date(e.start).getFullYear() === y);
  }
  if (month) {
    const m = parseInt(month, 10) - 1;
    events = events.filter(e => e.start && new Date(e.start).getMonth() === m);
  }
  if (q) {
    const lower = q.toLowerCase();
    events = events.filter(e =>
      (e.title || '').toLowerCase().includes(lower) ||
      (e.description || '').toLowerCase().includes(lower) ||
      (e.location || '').toLowerCase().includes(lower)
    );
  }

  res.json({ items: events, total: events.length });
});

// ── Contacts ──────────────────────────────────────────────────────────────────

app.get('/api/contacts', (req, res) => {
  const index = db.readIndex();
  const { q } = req.query;
  let contacts = index.contacts || [];

  if (q) {
    const lower = q.toLowerCase();
    contacts = contacts.filter(c =>
      (c.name || '').toLowerCase().includes(lower) ||
      (c.emails || []).some(e => e.toLowerCase().includes(lower)) ||
      (c.org || '').toLowerCase().includes(lower)
    );
  }

  contacts = [...contacts].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  res.json({ items: contacts, total: contacts.length });
});

// ── Keep ──────────────────────────────────────────────────────────────────────

app.get('/api/keep', (req, res) => {
  const index = db.readIndex();
  const { q, label, page = '1', limit = '50' } = req.query;
  let notes = index.keepNotes || [];

  // Build label list
  const labelSet = new Set();
  for (const n of notes) (n.labels || []).forEach(l => labelSet.add(l));
  const labels = Array.from(labelSet).sort();

  // Filter
  notes = notes.filter(n => !n.isTrashed);
  if (label) notes = notes.filter(n => (n.labels || []).includes(label));
  if (q) {
    const lower = q.toLowerCase();
    notes = notes.filter(n =>
      (n.title || '').toLowerCase().includes(lower) ||
      (n.textContent || '').toLowerCase().includes(lower) ||
      (n.listContent || []).some(item => (item.text || '').toLowerCase().includes(lower)) ||
      (n.labels || []).some(l => l.toLowerCase().includes(lower))
    );
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const total = notes.length;
  const items = notes.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  res.json({ items, total, page: pageNum, pageSize, labels });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

app.get('/api/tasks', (req, res) => {
  const index = db.readIndex();
  const { q, status } = req.query;
  let tasks = index.tasks || [];

  if (q) {
    const lower = q.toLowerCase();
    tasks = tasks.filter(t =>
      (t.title || '').toLowerCase().includes(lower) ||
      (t.description || '').toLowerCase().includes(lower)
    );
  }
  if (status === 'completed') tasks = tasks.filter(t => t.status === 'completed');
  else if (status === 'pending') tasks = tasks.filter(t => t.status === 'pending');

  const pending = tasks.filter(t => t.status === 'pending').sort((a, b) => (a.dueTimestamp || Infinity) - (b.dueTimestamp || Infinity));
  const completed = tasks.filter(t => t.status === 'completed').sort((a, b) => b.completedTimestamp - a.completedTimestamp);

  res.json({ pending, completed, total: tasks.length });
});

// ── Chrome ────────────────────────────────────────────────────────────────────

app.get('/api/chrome', (req, res) => {
  const index = db.readIndex();
  const { q, type = 'bookmarks', page = '1', limit = '50' } = req.query;

  if (type === 'bookmarks') {
    let bookmarks = index.chromeBookmarks || [];
    const folderSet = new Set(bookmarks.map(b => b.folder));
    const folders = Array.from(folderSet).sort();

    if (q) {
      const lower = q.toLowerCase();
      bookmarks = bookmarks.filter(b =>
        (b.title || '').toLowerCase().includes(lower) ||
        (b.url || '').toLowerCase().includes(lower) ||
        (b.domain || '').toLowerCase().includes(lower)
      );
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const total = bookmarks.length;
    const items = bookmarks.slice((pageNum - 1) * pageSize, pageNum * pageSize);
    return res.json({ items, total, page: pageNum, pageSize, folders, type: 'bookmarks' });
  }

  if (type === 'history') {
    let history = index.chromeHistory || [];

    if (q) {
      const lower = q.toLowerCase();
      history = history.filter(h =>
        (h.title || '').toLowerCase().includes(lower) ||
        (h.url || '').toLowerCase().includes(lower) ||
        (h.domain || '').toLowerCase().includes(lower)
      );
    }

    history = [...history].sort((a, b) => b.visitTimestamp - a.visitTimestamp);
    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const total = history.length;
    const items = history.slice((pageNum - 1) * pageSize, pageNum * pageSize);
    return res.json({ items, total, page: pageNum, pageSize, type: 'history' });
  }

  res.status(400).json({ error: 'Invalid type' });
});

// ── Chat ──────────────────────────────────────────────────────────────────────

app.get('/api/chat', (req, res) => {
  const index = db.readIndex();
  const { q, conversation, page = '1', limit = '50' } = req.query;
  const conversations = index.chatConversations || [];

  if (conversation) {
    const conv = conversations.find(c => c.id === conversation);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    let messages = conv.messages || [];
    if (q) {
      const lower = q.toLowerCase();
      messages = messages.filter(m => (m.text || '').toLowerCase().includes(lower));
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const total = messages.length;
    const items = messages.slice((pageNum - 1) * pageSize, pageNum * pageSize);
    return res.json({ conversation: { ...conv, messages: undefined }, messages: items, total, page: pageNum, pageSize });
  }

  // Return conversation list
  let convList = conversations.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    participants: c.participants,
    messageCount: c.messageCount,
    lastDate: c.lastDate,
  }));

  if (q) {
    const lower = q.toLowerCase();
    convList = convList.filter(c =>
      (c.name || '').toLowerCase().includes(lower) ||
      (c.participants || []).some(p => p.toLowerCase().includes(lower))
    );
  }

  res.json({ conversations: convList, total: convList.length });
});

// ── Saved ─────────────────────────────────────────────────────────────────────

app.get('/api/saved', (req, res) => {
  const index = db.readIndex();
  const { q, page = '1', limit = '50' } = req.query;
  let links = index.savedLinks || [];

  if (q) {
    const lower = q.toLowerCase();
    links = links.filter(l =>
      (l.title || '').toLowerCase().includes(lower) ||
      (l.url || '').toLowerCase().includes(lower) ||
      (l.domain || '').toLowerCase().includes(lower)
    );
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const total = links.length;
  const items = links.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  res.json({ items, total, page: pageNum, pageSize });
});

// ── Local path import ─────────────────────────────────────────────────────────

app.post('/api/import/local', async (req, res) => {
  if (importRunning) return res.status(409).json({ error: 'Import already in progress' });

  const { paths } = req.body;
  if (!Array.isArray(paths) || paths.length === 0)
    return res.status(400).json({ error: 'No paths provided' });

  // Validate all paths exist before starting
  for (const p of paths) {
    if (!fs.existsSync(p))
      return res.status(400).json({ error: `Path not found: ${p}` });
  }

  res.json({ ok: true, paths });

  importRunning = true;
  setAbortFlag(false);
  setProgressCallback(broadcastProgress);

  try {
    const counts = await processLocalPaths(paths);
    const summary = [
      counts.emails      && `${counts.emails} emails`,
      counts.driveFiles  && `${counts.driveFiles} Drive files`,
      counts.events      && `${counts.events} events`,
      counts.contacts    && `${counts.contacts} contacts`,
      counts.keepNotes   && `${counts.keepNotes} Keep notes`,
      counts.tasks       && `${counts.tasks} tasks`,
      counts.chromeBookmarks && `${counts.chromeBookmarks} bookmarks`,
      counts.chromeHistory   && `${counts.chromeHistory} history entries`,
      counts.chatConversations && `${counts.chatConversations} chat conversations`,
      counts.savedLinks  && `${counts.savedLinks} saved links`,
    ].filter(Boolean).join(', ');
    broadcastProgress({ stage: 'done', message: `Import complete! ${summary}.`, percent: 100, counts });
  } catch (err) {
    console.error('[import/local] Error:', err);
    broadcastProgress({ stage: 'error', message: err.message, percent: 0 });
  } finally {
    importRunning = false;
  }
});

// ── Abort ─────────────────────────────────────────────────────────────────────

app.post('/api/abort', (req, res) => {
  setAbortFlag(true);                      // signal the indexer to stop
  importRunning = false;                   // unblock future imports immediately
  broadcastProgress({ stage: 'aborted', message: 'Import cancelled.', percent: 0 });
  db.reset();                              // wipe all data dirs
  db.ensureDirs();                         // recreate clean empty dirs
  setAbortFlag(false);                     // ready for next import
  res.json({ ok: true });
});

// ── Reset ─────────────────────────────────────────────────────────────────────

app.post('/api/reset', (req, res) => {
  if (importRunning) return res.status(409).json({ error: 'Import in progress' });
  db.reset();
  db.ensureDirs();
  res.json({ ok: true });
});

// ── Global error handler (must be after all routes) ───────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start (with port fallback) ────────────────────────────────────────────────

function tryListen(port, attemptsLeft) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`\n  Takeout Viewer running at http://localhost:${port}\n`);
      resolve(port);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
        console.warn(`  Port ${port} in use, trying ${port + 1}...`);
        tryListen(port + 1, attemptsLeft - 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

// When run directly (`npm start`), start immediately.
// When required by Electron, export startServer() instead.
if (require.main === module) {
  tryListen(PORT, 3).catch((err) => {
    console.error('  Failed to start server:', err.message);
    process.exit(1);
  });
}

module.exports = { startServer: () => tryListen(PORT, 3) };
