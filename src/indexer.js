'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
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

function setProgressCallback(cb) {
  progressCallback = cb;
}

function emit(stage, message, percent) {
  if (progressCallback) progressCallback({ stage, message, percent });
}

/**
 * Extract a single zip to the extracted dir.
 */
function extractZip(zipPath, destDir) {
  emit('extracting', `Extracting ${path.basename(zipPath)}...`, 0);
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const total = entries.length;

  entries.forEach((entry, i) => {
    if (!entry.isDirectory) {
      const entryPath = path.join(destDir, entry.entryName);
      fs.mkdirSync(path.dirname(entryPath), { recursive: true });
      fs.writeFileSync(entryPath, entry.getData());
    }
    if (i % 50 === 0) {
      emit('extracting', `Extracting ${path.basename(zipPath)}: ${i}/${total} files`, Math.round((i / total) * 20));
    }
  });

  emit('extracting', `Done extracting ${path.basename(zipPath)}`, 20);
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

async function indexMboxFiles(mboxFiles) {
  const emails = [];
  let totalProcessed = 0;

  for (const mboxPath of mboxFiles) {
    emit('indexing_emails', `Parsing ${path.basename(mboxPath)}...`, 25);
    const count = await parseMbox(mboxPath, async (metadata, fullEmail) => {
      db.writeEmail(metadata.id, fullEmail);
      emails.push(metadata);
      totalProcessed++;
      if (totalProcessed % 100 === 0) {
        emit('indexing_emails', `Indexed ${totalProcessed} emails...`, 25 + Math.min(30, Math.round(totalProcessed / 50)));
      }
    });
    emit('indexing_emails', `Done with ${path.basename(mboxPath)}: ${count} messages`, 55);
  }

  return emails;
}

function indexDriveFiles(extractedDir) {
  emit('indexing_drive', 'Indexing Drive files...', 57);
  const driveDir = findDir(extractedDir, ['Google Drive', 'Drive']);
  if (!driveDir) {
    emit('indexing_drive', 'No Drive folder found, skipping.', 59);
    return [];
  }

  const driveFiles = [];
  for (const filePath of walkDir(driveDir)) {
    const rel = path.relative(driveDir, filePath);
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const folder = path.dirname(rel) === '.' ? '/' : '/' + path.dirname(rel);
    driveFiles.push({
      id: `drive-${driveFiles.length}`,
      name: path.basename(filePath),
      path: rel,
      fullPath: filePath,
      folder,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      ext: ext || '',
    });
  }

  emit('indexing_drive', `Indexed ${driveFiles.length} Drive files`, 60);
  return driveFiles;
}

function indexCalendar(extractedDir) {
  emit('indexing_calendar', 'Indexing calendar...', 61);
  // Only VEVENT ics files — exclude Tasks dir
  const tasksDir = findDir(extractedDir, ['Tasks']) || '';
  const icsFiles = walkDir(extractedDir).filter(f =>
    f.endsWith('.ics') && !f.startsWith(tasksDir)
  );

  if (icsFiles.length === 0) {
    emit('indexing_calendar', 'No calendar files found, skipping.', 63);
    return [];
  }

  let events = [];
  for (const icsFile of icsFiles) {
    try { events.push(...parseIcsFile(icsFile)); }
    catch (e) { console.error(`[indexer] Failed to parse ICS ${icsFile}:`, e.message); }
  }
  events.sort((a, b) => a.startTimestamp - b.startTimestamp);
  emit('indexing_calendar', `Indexed ${events.length} calendar events`, 64);
  return events;
}

function indexContacts(extractedDir) {
  emit('indexing_contacts', 'Indexing contacts...', 65);
  const vcfFiles = walkDir(extractedDir).filter(f => f.endsWith('.vcf'));

  if (vcfFiles.length === 0) {
    emit('indexing_contacts', 'No contact files found, skipping.', 67);
    return [];
  }

  let contacts = [];
  for (const vcfFile of vcfFiles) {
    try { contacts.push(...parseVcfFile(vcfFile)); }
    catch (e) { console.error(`[indexer] Failed to parse VCF ${vcfFile}:`, e.message); }
  }
  contacts = contacts.map((c, i) => ({ ...c, id: `contact-${i}` }));
  emit('indexing_contacts', `Indexed ${contacts.length} contacts`, 68);
  return contacts;
}

function indexKeep(extractedDir) {
  emit('indexing_keep', 'Indexing Keep notes...', 70);
  const keepDir = findDir(extractedDir, ['Keep']);
  if (!keepDir) {
    emit('indexing_keep', 'No Keep folder found, skipping.', 72);
    return [];
  }
  const notes = parseKeepDir(keepDir);
  emit('indexing_keep', `Indexed ${notes.length} Keep notes`, 73);
  return notes;
}

function indexTasks(extractedDir) {
  emit('indexing_tasks', 'Indexing Tasks...', 74);
  const tasksDir = findDir(extractedDir, ['Tasks']);
  if (!tasksDir) {
    emit('indexing_tasks', 'No Tasks folder found, skipping.', 76);
    return [];
  }
  const icsFiles = walkDir(tasksDir).filter(f => f.endsWith('.ics'));
  if (icsFiles.length === 0) {
    emit('indexing_tasks', 'No task files found, skipping.', 76);
    return [];
  }
  const { parseTaskFiles } = require('./tasksParser');
  const tasks = parseTaskFiles(icsFiles);
  emit('indexing_tasks', `Indexed ${tasks.length} tasks`, 77);
  return tasks;
}

function indexChrome(extractedDir) {
  emit('indexing_chrome', 'Indexing Chrome data...', 78);
  const chromeDir = findDir(extractedDir, ['Chrome']);
  if (!chromeDir) {
    emit('indexing_chrome', 'No Chrome folder found, skipping.', 80);
    return { bookmarks: [], history: [] };
  }

  const bookmarksPath = findFile(chromeDir, 'Bookmarks.html')
    || findFile(chromeDir, 'bookmarks.html');
  const historyPath = findFile(chromeDir, 'BrowserHistory.json')
    || findFile(chromeDir, 'browserhistory.json');

  const result = parseChromeFiles(bookmarksPath, historyPath);
  emit('indexing_chrome', `Indexed ${result.bookmarks.length} bookmarks, ${result.history.length} history entries`, 82);
  return result;
}

function indexChat(extractedDir) {
  emit('indexing_chat', 'Indexing Google Chat...', 83);
  const chatDir = findDir(extractedDir, ['Google Chat', 'Hangouts']);
  if (!chatDir) {
    emit('indexing_chat', 'No Chat folder found, skipping.', 85);
    return [];
  }
  const conversations = parseChatDir(chatDir);
  emit('indexing_chat', `Indexed ${conversations.length} conversations`, 86);
  return conversations;
}

function indexSaved(extractedDir) {
  emit('indexing_saved', 'Indexing Saved links...', 87);
  const savedDir = findDir(extractedDir, ['Saved']);
  if (!savedDir) {
    emit('indexing_saved', 'No Saved folder found, skipping.', 89);
    return [];
  }
  const links = parseSavedFiles(savedDir);
  emit('indexing_saved', `Indexed ${links.length} saved links`, 90);
  return links;
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function processFiles(filePaths) {
  db.ensureDirs();
  const extractedDir = db.getExtractedDir();

  // Separate zips from standalone mbox files
  const zipPaths = filePaths.filter(p => p.toLowerCase().endsWith('.zip'));
  const standaloneMbox = filePaths.filter(p => p.toLowerCase().endsWith('.mbox'));

  // 1. Extract all zips
  for (const zipPath of zipPaths) {
    extractZip(zipPath, extractedDir);
  }

  // 2. Find mbox files: from extracted zips + any directly uploaded .mbox files
  emit('indexing_emails', 'Finding mbox files...', 22);
  const allFiles = walkDir(extractedDir);
  const mboxFiles = [...allFiles.filter(f => f.toLowerCase().endsWith('.mbox')), ...standaloneMbox];

  // 3. Index all sections
  const emails = mboxFiles.length > 0
    ? await indexMboxFiles(mboxFiles)
    : [];

  const driveFiles = indexDriveFiles(extractedDir);
  const events = indexCalendar(extractedDir);
  const contacts = indexContacts(extractedDir);
  const keepNotes = indexKeep(extractedDir);
  const tasks = indexTasks(extractedDir);
  const { bookmarks: chromeBookmarks, history: chromeHistory } = indexChrome(extractedDir);
  const chatConversations = indexChat(extractedDir);
  const savedLinks = indexSaved(extractedDir);

  // 4. Write index
  emit('done', 'Writing index...', 95);
  const index = {
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
  };

  db.writeIndex(index);
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

module.exports = { processFiles, processZips: processFiles, setProgressCallback };
