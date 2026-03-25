'use strict';

const fs = require('fs');

function parseIcsDate(raw) {
  if (!raw) return null;

  // Strip any leading param section (e.g. "TZID=America/New_York:" prefix that
  // might still be attached if the caller passes the full value string).
  // The property value starts after the final ':' in the key=value;... list,
  // but by the time we call this helper the caller should pass only the value
  // part.  We strip a trailing 'Z' flag separately.

  const s = raw.trim();

  // All-day: 20240315
  if (/^\d{8}$/.test(s)) {
    const y = s.slice(0, 4), mo = s.slice(4, 6), d = s.slice(6, 8);
    return { date: new Date(`${y}-${mo}-${d}T00:00:00Z`), allDay: true };
  }

  // DateTime variants: 20240315T120000Z  |  20240315T120000
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) {
    // If 'Z' suffix → UTC; otherwise treat as local (no offset)
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || ''}`;
    return { date: new Date(iso), allDay: false };
  }

  return null;
}

// Extract the bare date-value from a raw ICS property value string.
// The property value for DTSTART may arrive as:
//   "20240115T140000Z"              (plain value after ':')
//   "TZID=America/New_York:20240115T140000"  (when params are baked in)
// In our parser we already strip params before the ':', so this handles
// residual cases.
function extractDateValue(raw) {
  if (!raw) return '';
  // If there is still a colon in the raw value (shouldn't happen after our
  // property parser, but defensive), take the part after the last ':'.
  const colonIdx = raw.lastIndexOf(':');
  return colonIdx >= 0 ? raw.slice(colonIdx + 1).trim() : raw.trim();
}

function unescapeIcs(val) {
  if (!val) return '';
  return val
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// Parse ATTENDEE property.
// Example: ATTENDEE;CN="Jane Doe";ROLE=REQ-PARTICIPANT:mailto:jane@example.com
// The keyPart is everything before the first standalone ':', value is the rest.
function parseAttendee(keyPart, value) {
  const attendee = {};
  // Extract CN= from params
  const cnMatch = keyPart.match(/[;,]?CN=(?:"([^"]+)"|([^;:]+))/i);
  if (cnMatch) attendee.name = (cnMatch[1] || cnMatch[2] || '').trim();
  // value is e.g. "mailto:jane@example.com"
  const emailMatch = value.match(/^mailto:(.+)$/i);
  if (emailMatch) attendee.email = emailMatch[1].trim();
  return attendee;
}

function parseIcsContent(content) {
  const events = [];
  const eventRe = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;

  while ((match = eventRe.exec(content)) !== null) {
    const block = match[1];

    // Unfold continuation lines (RFC 5545: CRLF followed by whitespace)
    const unfolded = block.replace(/\r?\n[ \t]/g, '');

    // We need multi-value support for ATTENDEE, so collect all lines.
    const lines = unfolded.split(/\r?\n/);

    // props stores the LAST value for single-valued props.
    const props = {};
    // attendeeLines collects raw ATTENDEE entries.
    const attendeeLines = [];

    for (const line of lines) {
      const sep = line.indexOf(':');
      if (sep === -1) continue;
      const keyPart = line.slice(0, sep);   // e.g. "DTSTART;TZID=America/New_York"
      const value = line.slice(sep + 1);    // raw value (not trimmed — trailing spaces are significant in some cases)
      const key = keyPart.split(';')[0].trim().toUpperCase();
      if (!key) continue;

      if (key === 'ATTENDEE') {
        attendeeLines.push({ keyPart, value: value.trim() });
      } else {
        props[key] = { keyPart, value: value.trim() };
      }
    }

    // ── Date parsing ──────────────────────────────────────────────────────────
    function parseProp(propName) {
      const entry = props[propName];
      if (!entry) return null;
      // The value portion after the colon; strip a VALUE=DATE param marker if present.
      const dateStr = extractDateValue(entry.value) || entry.value;
      return parseIcsDate(dateStr);
    }

    const startResult = parseProp('DTSTART');
    const endResult   = parseProp('DTEND');

    const start   = startResult ? startResult.date : null;
    const end     = endResult   ? endResult.date   : null;
    const isAllDay = startResult ? startResult.allDay : false;

    // ── Attendees ─────────────────────────────────────────────────────────────
    const attendees = attendeeLines.map(({ keyPart, value }) =>
      parseAttendee(keyPart, value)
    ).filter(a => a.name || a.email);

    // ── Categories ────────────────────────────────────────────────────────────
    let categories = [];
    if (props['CATEGORIES']) {
      categories = props['CATEGORIES'].value
        .split(',')
        .map(c => unescapeIcs(c.trim()))
        .filter(Boolean);
    }

    // ── URL ───────────────────────────────────────────────────────────────────
    const url = props['URL'] ? unescapeIcs(props['URL'].value) : '';

    events.push({
      id:             props['UID']        ? props['UID'].value          : `event-${events.length}`,
      title:          unescapeIcs(props['SUMMARY']     ? props['SUMMARY'].value     : '(no title)'),
      description:    unescapeIcs(props['DESCRIPTION'] ? props['DESCRIPTION'].value : ''),
      location:       unescapeIcs(props['LOCATION']    ? props['LOCATION'].value    : ''),
      start:          start ? start.toISOString() : null,
      end:            end   ? end.toISOString()   : null,
      startTimestamp: start ? start.getTime()     : 0,
      allDay:         isAllDay,
      rrule:          props['RRULE']      ? props['RRULE'].value        : null,
      organizer:      props['ORGANIZER']  ? props['ORGANIZER'].value    : '',
      status:         props['STATUS']     ? props['STATUS'].value       : '',
      attendees:      attendees.length    ? attendees                   : undefined,
      url:            url                 || undefined,
      categories:     categories.length   ? categories                  : undefined,
    });
  }

  return events;
}

function parseIcsFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseIcsContent(content);
}

module.exports = { parseIcsFile };
