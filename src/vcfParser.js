'use strict';

const fs = require('fs');

function decodeBase64Value(val) {
  try {
    return Buffer.from(val, 'base64').toString('utf8');
  } catch { return val; }
}

function parseVcfContent(content) {
  const contacts = [];
  const cardRe = /BEGIN:VCARD([\s\S]*?)END:VCARD/g;
  let match;

  while ((match = cardRe.exec(content)) !== null) {
    const block = match[1];

    // Unfold lines
    const unfolded = block.replace(/\r?\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/).filter(Boolean);

    const contact = {
      id: `contact-${contacts.length}`,
      name: '',
      emails: [],
      phones: [],
      org: '',
      title: '',
      note: '',
    };

    for (const line of lines) {
      const sep = line.indexOf(':');
      if (sep === -1) continue;
      const keyPart = line.slice(0, sep).toUpperCase();
      const value = line.slice(sep + 1).trim();

      // Parse key and params
      const keyParts = keyPart.split(';');
      const key = keyParts[0];
      const params = keyParts.slice(1).join(';');

      // Skip photo (too heavy)
      if (key === 'PHOTO') continue;

      if (key === 'FN') {
        // Check for base64 encoding
        if (params.includes('ENCODING=B') || params.includes('ENCODING=BASE64')) {
          contact.name = decodeBase64Value(value);
        } else {
          contact.name = value.replace(/\\,/g, ',').replace(/\\;/g, ';');
        }
      } else if (key === 'N' && !contact.name) {
        // N:Last;First;Middle;Prefix;Suffix
        const parts = value.split(';');
        const last = parts[0] || '';
        const first = parts[1] || '';
        contact.name = [first, last].filter(Boolean).join(' ') || value;
      } else if (key === 'EMAIL') {
        if (value && !contact.emails.includes(value)) {
          contact.emails.push(value);
        }
      } else if (key === 'TEL') {
        if (value && !contact.phones.includes(value)) {
          contact.phones.push(value);
        }
      } else if (key === 'ORG') {
        contact.org = value.replace(/;/g, ' ').trim();
      } else if (key === 'TITLE') {
        contact.title = value;
      } else if (key === 'NOTE') {
        contact.note = value.replace(/\\n/g, '\n').replace(/\\,/g, ',');
      } else if (key === 'UID') {
        contact.id = `contact-${value}`;
      }
    }

    if (contact.name || contact.emails.length > 0) {
      contacts.push(contact);
    }
  }

  return contacts;
}

function parseVcfFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseVcfContent(content);
}

module.exports = { parseVcfFile };
