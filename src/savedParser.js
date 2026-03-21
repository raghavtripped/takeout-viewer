'use strict';

const fs = require('fs');
const { parseBookmarkHtml } = require('./chromeParser');

/**
 * Parse Saved Links from Google Takeout.
 * Google exports this as either:
 *   - Takeout/Saved/Saved Links.html  (Netscape bookmark format)
 *   - Takeout/Saved/Links.json        (JSON array)
 * Returns array of { id, title, url, addDate, domain }.
 */
function parseSavedFiles(savedDir) {
  if (!fs.existsSync(savedDir)) return [];

  const links = [];

  // Try HTML format first
  const htmlCandidates = ['Saved Links.html', 'Saved links.html', 'Links.html'];
  for (const name of htmlCandidates) {
    const p = require('path').join(savedDir, name);
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        const parsed = parseBookmarkHtml(content);
        links.push(...parsed);
        break;
      } catch (e) {
        console.error('[savedParser] Failed to parse HTML:', e.message);
      }
    }
  }

  // Try JSON format
  const jsonCandidates = ['Saved Links.json', 'Links.json', 'saved.json'];
  for (const name of jsonCandidates) {
    const p = require('path').join(savedDir, name);
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        const arr = Array.isArray(data) ? data : (data.links || data.items || []);
        for (const item of arr) {
          if (item.url || item.link) {
            links.push({
              title: item.title || item.url || '',
              url: item.url || item.link || '',
              addDate: item.creation_time || item.date || null,
              addTimestamp: 0,
              folder: '/',
              domain: extractDomain(item.url || item.link || ''),
            });
          }
        }
        break;
      } catch (e) {
        console.error('[savedParser] Failed to parse JSON:', e.message);
      }
    }
  }

  return links
    .filter(l => l.url)
    .map((l, i) => ({ ...l, id: `saved-${i}` }))
    .sort((a, b) => b.addTimestamp - a.addTimestamp);
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.split('/')[2] || '';
  }
}

module.exports = { parseSavedFiles };
