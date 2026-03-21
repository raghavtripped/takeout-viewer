'use strict';

const fs = require('fs');

function parseIcsDate(raw) {
  if (!raw) return null;
  // All-day: 20240315
  if (/^\d{8}$/.test(raw)) {
    return new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T00:00:00Z`);
  }
  // DateTime
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || ''}`);
  return null;
}

/**
 * Parse VTODO blocks from one or more .ics files.
 */
function parseTasksFromIcs(content) {
  const tasks = [];
  const taskRe = /BEGIN:VTODO([\s\S]*?)END:VTODO/g;
  let match;

  while ((match = taskRe.exec(content)) !== null) {
    const block = match[1];
    const unfolded = block.replace(/\r?\n[ \t]/g, '');
    const props = {};

    for (const line of unfolded.split(/\r?\n/)) {
      const sep = line.indexOf(':');
      if (sep === -1) continue;
      const key = line.slice(0, sep).split(';')[0].trim().toUpperCase();
      const value = line.slice(sep + 1).trim();
      if (key) props[key] = value;
    }

    const dueRaw = props['DUE'] || '';
    const completedRaw = props['COMPLETED'] || '';

    // Strip TZID prefix if present (e.g. "TZID=America/NY:20240315T120000")
    const stripTzid = (s) => s.includes(':') ? s.split(':').slice(1).join(':') : s;

    const due = parseIcsDate(stripTzid(dueRaw));
    const completedDate = parseIcsDate(stripTzid(completedRaw));

    const status = (props['STATUS'] || '').toUpperCase();

    tasks.push({
      id: `task-${tasks.length}`,
      title: (props['SUMMARY'] || '(no title)').replace(/\\,/g, ',').replace(/\\;/g, ';'),
      description: (props['DESCRIPTION'] || '').replace(/\\n/g, '\n').replace(/\\,/g, ','),
      status: status === 'COMPLETED' ? 'completed' : 'pending',
      due: due ? due.toISOString() : null,
      dueTimestamp: due ? due.getTime() : 0,
      completed: completedDate ? completedDate.toISOString() : null,
      completedTimestamp: completedDate ? completedDate.getTime() : 0,
      uid: props['UID'] || '',
    });
  }

  return tasks;
}

function parseTaskFiles(icsFiles) {
  const tasks = [];
  for (const filePath of icsFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = parseTasksFromIcs(content);
      tasks.push(...parsed);
    } catch (e) {
      console.error(`[tasksParser] Failed to parse ${filePath}:`, e.message);
    }
  }
  // Re-assign IDs
  return tasks.map((t, i) => ({ ...t, id: `task-${i}` }));
}

module.exports = { parseTaskFiles };
