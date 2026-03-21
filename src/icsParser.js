'use strict';

const fs = require('fs');

function parseIcsDate(raw) {
  if (!raw) return null;
  // All-day: 20240315
  if (/^\d{8}$/.test(raw)) {
    const y = raw.slice(0, 4), m = raw.slice(4, 6), d = raw.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00Z`);
  }
  // DateTime: 20240315T120000Z or 20240315T120000
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || ''}`;
    return new Date(iso);
  }
  return null;
}

function unescapeIcs(val) {
  if (!val) return '';
  return val
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcsContent(content) {
  const events = [];
  // Split VEVENT blocks
  const eventRe = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;

  while ((match = eventRe.exec(content)) !== null) {
    const block = match[1];
    const props = {};

    // Parse property lines (handle folded lines — continuation lines start with space/tab)
    const unfolded = block.replace(/\r?\n[ \t]/g, '');
    for (const line of unfolded.split(/\r?\n/)) {
      // Property name may have params: DTSTART;TZID=America/New_York:20240315T120000
      const sep = line.indexOf(':');
      if (sep === -1) continue;
      const keyPart = line.slice(0, sep);
      const value = line.slice(sep + 1).trim();
      // Strip params from key
      const key = keyPart.split(';')[0].trim().toUpperCase();
      if (key) props[key] = value;
    }

    const dtstart = parseIcsDate(props['DTSTART'] ? props['DTSTART'].split('T')[0] + (props['DTSTART'].includes('T') ? 'T' + props['DTSTART'].split('T')[1] : '') : props['DTSTART']);
    const dtend = parseIcsDate(props['DTEND'] ? props['DTEND'].split('T')[0] + (props['DTEND'].includes('T') ? 'T' + props['DTEND'].split('T')[1] : '') : props['DTEND']);

    // Redo date parsing cleanly
    const startRaw = props['DTSTART'] || '';
    const endRaw = props['DTEND'] || '';

    const start = parseIcsDate(startRaw.includes(':') ? startRaw.split(':').slice(1).join(':') : startRaw);
    const end = parseIcsDate(endRaw.includes(':') ? endRaw.split(':').slice(1).join(':') : endRaw);

    const isAllDay = /^\d{8}$/.test(startRaw.replace(/^[^:]+:/, ''));

    events.push({
      id: props['UID'] || `event-${events.length}`,
      title: unescapeIcs(props['SUMMARY'] || '(no title)'),
      description: unescapeIcs(props['DESCRIPTION'] || ''),
      location: unescapeIcs(props['LOCATION'] || ''),
      start: start ? start.toISOString() : null,
      end: end ? end.toISOString() : null,
      startTimestamp: start ? start.getTime() : 0,
      allDay: isAllDay,
      rrule: props['RRULE'] || null,
      organizer: props['ORGANIZER'] || '',
      status: props['STATUS'] || '',
    });
  }

  return events;
}

function parseIcsFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseIcsContent(content);
}

module.exports = { parseIcsFile };
