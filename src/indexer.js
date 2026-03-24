'use strict';

const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const db = require('./db');
const { parseMbox } = require('./mboxParser');
const { parseIcsFile } = require('./icsParser');
const { parseVcfFile } = require('./vcfParser');
const { parseKeepDir } = require('./keepParser');
const { parseTaskFiles } = require('./tasksParser');
const { parseChromeFiles } = require('./chromeParser');
const { parseChatDir } = require('./chatParser');
const { parseSavedFiles } = require('./savedParser');

// Global progress emitter — set by server.js
let progressCallback = null;
let abortFlag = false;

function setProgressCallback(cb) { progressCallback = cb; }
function setAbortFlag(val) { abortFlag = val; }

function emit(stage, message, percent) {
  if (progressCallback) progressCallback({ stage, message, percent });
}

function checkAbort() {
  if (abortFlag) throw new Error('Import aborted by user');
}

/**
 * Extract a single zip using unzipper.Extract (properly awaits all writes).
 * Tracks bytes read from the input stream for ETA.
 */
async function extractZip(zipPath, destDir) {
  const name = path.basename(zipPath);
  const totalBytes = fs.statSync(zipPath).size;
  let bytesRead = 0;
  let lastEmit = 0;
  const start = Date.now();

  emit('extracting', `Extracting ${name} (${fmtBytes(totalBytes)})…`, 57);

  await new Promise((resolve, reject) => {
    const src = fs.createReadStream(zipPath);
    src.on('data', (chunk) => {
      bytesRead += chunk.length;
      const now = Date.now();
      if (now - lastEmit < 1000) return;
      lastEmit = now;
      const elapsed = (now - start) / 1000;
      const rate = bytesRead / elapsed;
      const remaining = rate > 0 ? (totalBytes - bytesRead) / rate : 0;
      const pct = totalBytes > 0 ? bytesRead / totalBytes : 0;
      const msg = `Extracting ${name} · ${fmtBytes(bytesRead)} / ${fmtBytes(totalBytes)} (${(pct * 100).toFixed(1)}%) · ${fmtDuration(remaining)} left`;
      emit('extracting', msg, 57 + Math.round(pct * 10));
    });
    src.pipe(unzipper.Extract({ path: destDir }))
      .on('finish', resolve)
      .on('error', reject);
    src.on('error', reject);
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  emit('extracting', `Done extracting ${name} in ${elapsed}s`, 67);
}

/**
 * Walk a directory tree recursively, returning all file paths.
 */
function walkDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/**
 * Find a directory whose name matches any of the given name fragments.
 * Searches 2 levels deep to handle the Takeout/ prefix.
 */
function findDir(base, names) {
  if (!fs.existsSync(base)) return null;
  const entries = fs.readdirSync(base, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      for (const name of names) {
        if (entry.name.toLowerCase().includes(name.toLowerCase())) {
          return path.join(base, entry.name);
        }
      }
    }
  }
  // One level deeper (Takeout/ prefix)
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const sub = findDir(path.join(base, entry.name), names);
      if (sub) return sub;
    }
  }
  return null;
}

/**
 * Find a specific file by name anywhere in the extracted tree.
 */
function findFile(base, filename) {
  if (!fs.existsSync(base)) return null;
  const all = walkDir(base);
  return all.find(f => path.basename(f).toLowerCase() === filename.toLowerCase()) || null;
}

// ── Section indexers ──────────────────────────────────────────────────────────

function fmtDuration(seconds) {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtBytes(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(0) + ' MB';
  return (b / 1e3).toFixed(0) + ' KB';
}

async function indexMboxFiles(mboxFiles) {
  const emails = [];
  let totalProcessed = 0;

  for (const mboxPath of mboxFiles) {
    checkAbort();
    emit('indexing_emails', `Parsing ${path.basename(mboxPath)}...`, 25);

    const startTime = Date.now();
    let lastProgressEmit = 0;

    const count = await parseMbox(mboxPath, async (metadata, fullEmail) => {
      checkAbort();
      db.writeEmail(metadata.id, fullEmail);
      emails.push(metadata);
      totalProcessed++;
    }, (bytesRead, totalBytes) => {
      // Throttle progress emits to once per second
      const now = Date.now();
      if (now - lastProgressEmit < 1000) return;
      lastProgressEmit = now;

      const elapsed = (now - startTime) / 1000;           // seconds elapsed
      const rate = bytesRead / elapsed;                     // bytes/sec
      const remaining = rate > 0 ? (totalBytes - bytesRead) / rate : 0;
      const pct = totalBytes > 0 ? bytesRead / totalBytes : 0;

      const emailRate = elapsed > 0 ? (totalProcessed / elapsed).toFixed(0) : 0;
      const msg = [
        `Indexed ${totalProcessed.toLocaleString()} emails`,
        `${fmtBytes(bytesRead)} / ${fmtBytes(totalBytes)} (${(pct * 100).toFixed(1)}%)`,
        `${emailRate} emails/sec`,
        remaining > 5 ? `~${fmtDuration(remaining)} left` : 'almost done…',
      ].join(' · ');

      const barPct = 25 + Math.round(pct * 30); // 25–55% range for email phase
      emit('indexing_emails', msg, barPct);
    });

    emit('indexing_emails', `Done — ${count.toLocaleString()} emails indexed`, 55);
  }

  return emails;
}

function indexDriveFiles(extractedDir) {
  const start = Date.now();
  emit('indexing_drive', 'Scanning Drive folder…', 68);
  const driveDir = findDir(extractedDir, ['Google Drive', 'Drive']);
  if (!driveDir) { emit('indexing_drive', 'No Drive folder found, skipping.', 70); return []; }

  const allPaths = walkDir(driveDir);
  const total = allPaths.length;
  const driveFiles = [];
  let lastEmit = 0;

  for (const filePath of allPaths) {
    const rel = path.relative(driveDir, filePath);
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const folder = path.dirname(rel) === '.' ? '/' : '/' + path.dirname(rel);
    driveFiles.push({ id: `drive-${driveFiles.length}`, name: path.basename(filePath),
      path: rel, fullPath: filePath, folder, size: stat.size,
      modified: stat.mtime.toISOString(), ext: ext || '' });

    const now = Date.now();
    if (now - lastEmit > 1000) {
      lastEmit = now;
      const elapsed = (now - start) / 1000;
      const rate = driveFiles.length / elapsed;
      const remaining = rate > 0 ? (total - driveFiles.length) / rate : 0;
      emit('indexing_drive',
        `Drive: ${driveFiles.length.toLocaleString()} / ${total.toLocaleString()} files · ~${fmtDuration(remaining)} left`,
        68 + Math.round((driveFiles.length / total) * 4));
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  emit('indexing_drive', `Indexed ${driveFiles.length.toLocaleString()} Drive files in ${elapsed}s`, 72);
  return driveFiles;
}

function indexCalendar(extractedDir) {
  const start = Date.now();
  emit('indexing_calendar', 'Scanning calendar files…', 73);
  const tasksDir = findDir(extractedDir, ['Tasks']) || '';
  const icsFiles = walkDir(extractedDir).filter(f => f.endsWith('.ics') && !f.startsWith(tasksDir));
  if (icsFiles.length === 0) { emit('indexing_calendar', 'No calendar files found, skipping.', 74); return []; }

  let events = [];
  for (let i = 0; i < icsFiles.length; i++) {
    try { events.push(...parseIcsFile(icsFiles[i])); }
    catch (e) { console.error(`[indexer] Failed to parse ICS ${icsFiles[i]}:`, e.message); }
    if ((i + 1) % 5 === 0 || i === icsFiles.length - 1) {
      emit('indexing_calendar', `Calendar: ${i + 1} / ${icsFiles.length} files · ${events.length} events so far`, 73);
    }
  }
  events.sort((a, b) => a.startTimestamp - b.startTimestamp);
  emit('indexing_calendar', `Indexed ${events.length.toLocaleString()} calendar events in ${((Date.now()-start)/1000).toFixed(1)}s`, 75);
  return events;
}

function indexContacts(extractedDir) {
  const start = Date.now();
  emit('indexing_contacts', 'Scanning contacts…', 76);
  const vcfFiles = walkDir(extractedDir).filter(f => f.endsWith('.vcf'));
  if (vcfFiles.length === 0) { emit('indexing_contacts', 'No contact files found, skipping.', 77); return []; }

  let contacts = [];
  for (let i = 0; i < vcfFiles.length; i++) {
    try { contacts.push(...parseVcfFile(vcfFiles[i])); }
    catch (e) { console.error(`[indexer] Failed to parse VCF ${vcfFiles[i]}:`, e.message); }
    if ((i + 1) % 5 === 0 || i === vcfFiles.length - 1) {
      emit('indexing_contacts', `Contacts: ${i + 1} / ${vcfFiles.length} files · ${contacts.length} contacts so far`, 76);
    }
  }
  contacts = contacts.map((c, i) => ({ ...c, id: `contact-${i}` }));
  emit('indexing_contacts', `Indexed ${contacts.length.toLocaleString()} contacts in ${((Date.now()-start)/1000).toFixed(1)}s`, 78);
  return contacts;
}

function indexKeep(extractedDir) {
  const start = Date.now();
  emit('indexing_keep', 'Scanning Keep notes…', 79);
  const keepDir = findDir(extractedDir, ['Keep']);
  if (!keepDir) { emit('indexing_keep', 'No Keep folder found, skipping.', 80); return []; }
  const notes = parseKeepDir(keepDir);
  emit('indexing_keep', `Indexed ${notes.length.toLocaleString()} Keep notes in ${((Date.now()-start)/1000).toFixed(1)}s`, 81);
  return notes;
}

function indexTasks(extractedDir) {
  const start = Date.now();
  emit('indexing_tasks', 'Scanning Tasks…', 82);
  const tasksDir = findDir(extractedDir, ['Tasks']);
  if (!tasksDir) { emit('indexing_tasks', 'No Tasks folder found, skipping.', 83); return []; }
  const icsFiles = walkDir(tasksDir).filter(f => f.endsWith('.ics'));
  if (icsFiles.length === 0) { emit('indexing_tasks', 'No task files found, skipping.', 83); return []; }
  const { parseTaskFiles } = require('./tasksParser');
  const tasks = parseTaskFiles(icsFiles);
  emit('indexing_tasks', `Indexed ${tasks.length.toLocaleString()} tasks in ${((Date.now()-start)/1000).toFixed(1)}s`, 84);
  return tasks;
}

function indexChrome(extractedDir) {
  const start = Date.now();
  emit('indexing_chrome', 'Scanning Chrome data…', 85);
  const chromeDir = findDir(extractedDir, ['Chrome']);
  if (!chromeDir) { emit('indexing_chrome', 'No Chrome folder found, skipping.', 86); return { bookmarks: [], history: [] }; }
  const bookmarksPath = findFile(chromeDir, 'Bookmarks.html') || findFile(chromeDir, 'bookmarks.html');
  const historyPath = findFile(chromeDir, 'BrowserHistory.json') || findFile(chromeDir, 'browserhistory.json');
  const result = parseChromeFiles(bookmarksPath, historyPath);
  emit('indexing_chrome',
    `Indexed ${result.bookmarks.length.toLocaleString()} bookmarks + ${result.history.length.toLocaleString()} history in ${((Date.now()-start)/1000).toFixed(1)}s`,
    87);
  return result;
}

function indexChat(extractedDir) {
  const start = Date.now();
  emit('indexing_chat', 'Scanning Google Chat…', 88);
  const chatDir = findDir(extractedDir, ['Google Chat', 'Hangouts']);
  if (!chatDir) { emit('indexing_chat', 'No Chat folder found, skipping.', 89); return []; }
  const conversations = parseChatDir(chatDir);
  emit('indexing_chat', `Indexed ${conversations.length.toLocaleString()} conversations in ${((Date.now()-start)/1000).toFixed(1)}s`, 90);
  return conversations;
}

function indexSaved(extractedDir) {
  const start = Date.now();
  emit('indexing_saved', 'Scanning Saved links…', 91);
  const savedDir = findDir(extractedDir, ['Saved']);
  if (!savedDir) { emit('indexing_saved', 'No Saved folder found, skipping.', 92); return []; }
  const links = parseSavedFiles(savedDir);
  emit('indexing_saved', `Indexed ${links.length.toLocaleString()} saved links in ${((Date.now()-start)/1000).toFixed(1)}s`, 92);
  return links;
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function processFiles(filePaths) {
  db.ensureDirs();
  const extractedDir = db.getExtractedDir();

  // Separate zips from standalone mbox files
  const zipPaths = filePaths.filter(p => p.toLowerCase().endsWith('.zip'));
  const standaloneMbox = filePaths.filter(p => p.toLowerCase().endsWith('.mbox'));

  // 1. Index standalone mbox files FIRST — before zip extraction uses disk space.
  //    This way emails are saved even if zip extraction later fails.
  emit('indexing_emails', 'Finding mbox files...', 5);
  const emails = standaloneMbox.length > 0
    ? await indexMboxFiles(standaloneMbox)
    : [];

  // Write a partial index with emails so they're accessible even if later steps fail
  emit('extracting', `Emails done — saving partial index (${emails.length.toLocaleString()} emails)…`, 56);
  db.writeIndex({ indexed: false, indexedAt: new Date().toISOString(), emails,
    driveFiles: [], events: [], contacts: [], keepNotes: [], tasks: [],
    chromeBookmarks: [], chromeHistory: [], chatConversations: [], savedLinks: [] });

  // 2. Extract all zips (streaming — no full-file RAM load)
  const totalZipBytes = zipPaths.reduce((s, p) => s + (fs.existsSync(p) ? fs.statSync(p).size : 0), 0);
  emit('extracting', `Extracting ${zipPaths.length} zip file(s) — ${fmtBytes(totalZipBytes)} total…`, 57);
  for (const zipPath of zipPaths) {
    checkAbort();
    await extractZip(zipPath, extractedDir);
  }

  // 3. Also pick up any mbox files that were inside the zips
  const extractedMbox = walkDir(extractedDir).filter(f => f.toLowerCase().endsWith('.mbox'));
  if (extractedMbox.length > 0) {
    emit('indexing_emails', `Found ${extractedMbox.length} more mbox file(s) in zips...`, 57);
    const moreEmails = await indexMboxFiles(extractedMbox);
    emails.push(...moreEmails);
  }

  // 4. Index everything else from the extracted zips
  const driveFiles = indexDriveFiles(extractedDir);
  const events = indexCalendar(extractedDir);
  const contacts = indexContacts(extractedDir);
  const keepNotes = indexKeep(extractedDir);
  const tasks = indexTasks(extractedDir);
  const { bookmarks: chromeBookmarks, history: chromeHistory } = indexChrome(extractedDir);
  const chatConversations = indexChat(extractedDir);
  const savedLinks = indexSaved(extractedDir);

  // 5. Write final index
  emit('done', 'Writing index...', 95);
  db.writeIndex({
    indexed: true,
    indexedAt: new Date().toISOString(),
    emails,
    driveFiles,
    events,
    contacts,
    keepNotes,
    tasks,
    chromeBookmarks,
    chromeHistory,
    chatConversations,
    savedLinks,
  });
  emit('done', 'Import complete!', 100);

  return {
    emails: emails.length,
    driveFiles: driveFiles.length,
    events: events.length,
    contacts: contacts.length,
    keepNotes: keepNotes.length,
    tasks: tasks.length,
    chromeBookmarks: chromeBookmarks.length,
    chromeHistory: chromeHistory.length,
    chatConversations: chatConversations.length,
    savedLinks: savedLinks.length,
  };
}

// ── Local-path import (no upload, no extraction needed) ───────────────────────

async function processLocalPaths(inputPaths) {
  db.ensureDirs();

  // Classify each path
  const localMbox = [], localDirs = [], localZips = [];
  for (const p of inputPaths) {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      localDirs.push(p);
    } else if (p.toLowerCase().endsWith('.mbox')) {
      localMbox.push(p);
    } else if (p.toLowerCase().endsWith('.zip')) {
      localZips.push(p);
    }
  }

  emit('indexing_emails', `Found: ${localDirs.length} folder(s), ${localMbox.length} mbox file(s), ${localZips.length} zip(s)`, 2);

  // Aggregate results across all sources
  const agg = {
    emails: [], driveFiles: [], events: [], contacts: [],
    keepNotes: [], tasks: [], chromeBookmarks: [], chromeHistory: [],
    chatConversations: [], savedLinks: [],
  };

  // 1. Standalone mbox files — index emails first
  if (localMbox.length > 0) {
    const emails = await indexMboxFiles(localMbox);
    agg.emails.push(...emails);
    emit('extracting', `Emails saved (${agg.emails.length.toLocaleString()}) — moving on to folders…`, 56);
    db.writeIndex({ indexed: false, indexedAt: new Date().toISOString(), ...agg });
  }

  // 2. Any zip files passed directly — extract them first
  if (localZips.length > 0) {
    const extractedDir = db.getExtractedDir();
    const totalZipBytes = localZips.reduce((s, p) => s + fs.statSync(p).size, 0);
    emit('extracting', `Extracting ${localZips.length} zip(s) — ${fmtBytes(totalZipBytes)} total…`, 57);
    for (const zip of localZips) {
      checkAbort();
      await extractZip(zip, extractedDir);
    }
    localDirs.push(extractedDir);
  }

  // 3. Index every local directory (already-extracted Takeout folders)
  const totalDirs = localDirs.length;
  for (let i = 0; i < localDirs.length; i++) {
    const dir = localDirs[i];
    checkAbort();
    emit('indexing_drive', `Processing folder ${i + 1} / ${totalDirs}: ${path.basename(dir)}…`, 68);

    // Check for mbox files inside this dir too
    const mboxInDir = walkDir(dir).filter(f => f.toLowerCase().endsWith('.mbox'));
    if (mboxInDir.length > 0) {
      const more = await indexMboxFiles(mboxInDir);
      agg.emails.push(...more);
    }

    agg.driveFiles.push(...indexDriveFiles(dir));
    agg.events.push(...indexCalendar(dir));
    agg.contacts.push(...indexContacts(dir));
    agg.keepNotes.push(...indexKeep(dir));
    agg.tasks.push(...indexTasks(dir));
    const chrome = indexChrome(dir);
    agg.chromeBookmarks.push(...chrome.bookmarks);
    agg.chromeHistory.push(...chrome.history);
    agg.chatConversations.push(...indexChat(dir));
    agg.savedLinks.push(...indexSaved(dir));
  }

  // Deduplicate contacts by id
  agg.contacts = agg.contacts.map((c, i) => ({ ...c, id: `contact-${i}` }));

  emit('done', 'Writing index…', 95);
  db.writeIndex({ indexed: true, indexedAt: new Date().toISOString(), ...agg });
  emit('done', 'Import complete!', 100);

  return {
    emails: agg.emails.length, driveFiles: agg.driveFiles.length,
    events: agg.events.length, contacts: agg.contacts.length,
    keepNotes: agg.keepNotes.length, tasks: agg.tasks.length,
    chromeBookmarks: agg.chromeBookmarks.length, chromeHistory: agg.chromeHistory.length,
    chatConversations: agg.chatConversations.length, savedLinks: agg.savedLinks.length,
  };
}

module.exports = { processFiles, processLocalPaths, processZips: processFiles, setProgressCallback, setAbortFlag };
