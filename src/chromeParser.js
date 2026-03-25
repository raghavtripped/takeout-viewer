'use strict';

const fs = require('fs');

/**
 * Parse Netscape bookmark HTML format.
 * Handles both Chrome Bookmarks.html and Saved Links.html.
 * Returns array of { title, url, addDate (ISO), folder }.
 */
function parseBookmarkHtml(content) {
  const bookmarks = [];
  // Track current folder via H3 headings
  let currentFolder = '/';
  const folderStack = ['/'];

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Folder start: <DT><H3 ...>Folder Name</H3>
    const h3Match = trimmed.match(/<H3[^>]*>([^<]*)<\/H3>/i);
    if (h3Match) {
      currentFolder = h3Match[1].trim() || '/';
      folderStack.push(currentFolder);
      continue;
    }

    // Bookmark: <DT><A HREF="..." ADD_DATE="...">Title</A>
    const linkMatch = trimmed.match(/<A\s+HREF="([^"]*)"(?:[^>]*?ADD_DATE="(\d+)")?[^>]*>([^<]*)<\/A>/i);
    if (linkMatch) {
      const url = linkMatch[1] || '';
      const addDateSec = linkMatch[2] ? parseInt(linkMatch[2], 10) : 0;
      const title = linkMatch[3] || url;
      const addDate = addDateSec ? new Date(addDateSec * 1000).toISOString() : null;

      if (url && !url.startsWith('javascript:')) {
        bookmarks.push({
          title: title.trim(),
          url,
          addDate,
          addTimestamp: addDateSec * 1000,
          folder: currentFolder,
          domain: extractDomain(url),
        });
      }
    }

    // Folder end (</DL>) — pop the stack
    if (trimmed.startsWith('</DL>') && folderStack.length > 1) {
      folderStack.pop();
      currentFolder = folderStack[folderStack.length - 1];
    }
  }

  return bookmarks;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return (url.split('/')[2] || '').replace(/^www\./, '');
  }
}

/**
 * Parse Chrome BrowserHistory.json.
 * Returns array of { title, url, visitTime (ISO), transition }.
 */
function parseChromeHistory(content) {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }

  const entries = data['Browser History'] || [];
  return entries.map((entry, i) => {
    // time_usec: microseconds since Jan 1, 1601 (Windows FILETIME).
    // Convert: divide by 1000 for ms, then subtract ms between 1601 and 1970.
    const timeUsec = entry.time_usec || 0;
    const WINDOWS_TO_UNIX_MS = 11644473600000; // ms between 1601-01-01 and 1970-01-01
    let unixMs = Math.round(timeUsec / 1000) - WINDOWS_TO_UNIX_MS;

    // Sanity check: if result is before year 2000 or after year 2100,
    // fall back to treating time_usec as plain Unix microseconds.
    const year2000 = 946684800000;
    const year2100 = 4102444800000;
    if (unixMs < year2000 || unixMs > year2100) {
      unixMs = Math.round(timeUsec / 1000);
    }

    const visitDate = unixMs > 0 ? new Date(unixMs) : null;

    return {
      id: `chrome-history-${i}`,
      title: entry.title || '',
      url: entry.url || '',
      visitTime: visitDate ? visitDate.toISOString() : null,
      visitTimestamp: unixMs,
      domain: extractDomain(entry.url || ''),
      transition: entry.page_transition || '',
    };
  }).filter(e => e.url);
}

function parseChromeFiles(bookmarksHtmlPath, historyJsonPath) {
  let bookmarks = [];
  let history = [];

  if (bookmarksHtmlPath && fs.existsSync(bookmarksHtmlPath)) {
    try {
      const content = fs.readFileSync(bookmarksHtmlPath, 'utf8');
      bookmarks = parseBookmarkHtml(content);
      bookmarks = bookmarks.map((b, i) => ({ ...b, id: `bookmark-${i}` }));
    } catch (e) {
      console.error('[chromeParser] Failed to parse Bookmarks.html:', e.message);
    }
  }

  if (historyJsonPath && fs.existsSync(historyJsonPath)) {
    try {
      const content = fs.readFileSync(historyJsonPath, 'utf8');
      history = parseChromeHistory(content);
    } catch (e) {
      console.error('[chromeParser] Failed to parse BrowserHistory.json:', e.message);
    }
  }

  return { bookmarks, history };
}

module.exports = { parseChromeFiles, parseBookmarkHtml };
