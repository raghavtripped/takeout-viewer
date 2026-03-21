'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Parse all Keep JSON files from a directory.
 * Each file is one note.
 */
function parseKeepDir(keepDir) {
  if (!fs.existsSync(keepDir)) return [];

  const notes = [];
  const files = fs.readdirSync(keepDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(keepDir, file), 'utf8'));

      // createdTimestampUsec / userEditedTimestampUsec are microseconds since epoch
      const createdMs = raw.createdTimestampUsec ? Math.round(raw.createdTimestampUsec / 1000) : 0;
      const editedMs = raw.userEditedTimestampUsec ? Math.round(raw.userEditedTimestampUsec / 1000) : 0;

      // listContent: [{text, isChecked}]
      const listContent = Array.isArray(raw.listContent)
        ? raw.listContent.map(item => ({ text: item.text || '', isChecked: !!item.isChecked }))
        : [];

      // labels: [{name}]
      const labels = Array.isArray(raw.labels)
        ? raw.labels.map(l => l.name).filter(Boolean)
        : [];

      notes.push({
        id: `keep-${notes.length}`,
        title: raw.title || '',
        textContent: raw.textContent || '',
        listContent,
        color: (raw.color || 'DEFAULT').toLowerCase(),
        isPinned: !!raw.isPinned,
        isTrashed: !!raw.isTrashed,
        isArchived: !!raw.isArchived,
        labels,
        created: createdMs ? new Date(createdMs).toISOString() : null,
        edited: editedMs ? new Date(editedMs).toISOString() : null,
        createdTimestamp: createdMs,
        editedTimestamp: editedMs,
      });
    } catch (e) {
      console.error(`[keepParser] Failed to parse ${file}:`, e.message);
    }
  }

  // Pinned first, then by edited time descending
  notes.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.editedTimestamp - a.editedTimestamp;
  });

  return notes;
}

module.exports = { parseKeepDir };
