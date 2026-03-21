'use strict';

const fs = require('fs');
const path = require('path');

// When running inside Electron, the main process sets this env var to the
// OS-appropriate writable location (e.g. ~/Library/Application Support/…).
// When running as plain `npm start` it falls back to data/ beside the project.
const DATA_DIR = process.env.TAKEOUT_DATA_DIR || path.join(__dirname, '..', 'data');
const INDEX_PATH = path.join(DATA_DIR, 'index.json');
const EMAILS_DIR = path.join(DATA_DIR, 'emails');

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(EMAILS_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'extracted'), { recursive: true });
}

function readIndex() {
  if (!fs.existsSync(INDEX_PATH)) {
    return { indexed: false, emails: [], driveFiles: [], events: [], contacts: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch {
    return { indexed: false, emails: [], driveFiles: [], events: [], contacts: [] };
  }
}

function writeIndex(data) {
  ensureDirs();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(data, null, 2));
}

function writeEmail(id, data) {
  ensureDirs();
  fs.writeFileSync(path.join(EMAILS_DIR, `${id}.json`), JSON.stringify(data));
}

function readEmail(id) {
  const p = path.join(EMAILS_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function markRead(id) {
  const index = readIndex();
  if (!Array.isArray(index.readEmailIds)) index.readEmailIds = [];
  if (!index.readEmailIds.includes(id)) {
    index.readEmailIds.push(id);
    writeIndex(index);
  }
}

function isRead(id) {
  const index = readIndex();
  return Array.isArray(index.readEmailIds) && index.readEmailIds.includes(id);
}

function getReadIds() {
  const index = readIndex();
  return new Set(Array.isArray(index.readEmailIds) ? index.readEmailIds : []);
}

function reset() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

function getExtractedDir() {
  return path.join(DATA_DIR, 'extracted');
}

function getUploadsDir() {
  return path.join(DATA_DIR, 'uploads');
}

module.exports = {
  ensureDirs,
  readIndex,
  writeIndex,
  writeEmail,
  readEmail,
  markRead,
  isRead,
  getReadIds,
  reset,
  getExtractedDir,
  getUploadsDir,
  DATA_DIR,
  INDEX_PATH,
};
