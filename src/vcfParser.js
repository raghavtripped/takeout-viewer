'use strict';

const fs = require('fs');

function decodeBase64Value(val) {
  try {
    return Buffer.from(val, 'base64').toString('utf8');
  } catch { return val; }
}

function extractType(params) {
  // params is something like "TYPE=HOME" or "TYPE=WORK,CELL" or "HOME" (vCard 2.1 style)
  const typeMatch = params.match(/TYPE=([^;]+)/i);
  if (typeMatch) {
    return typeMatch[1].replace(/,/g, '/').toUpperCase();
  }
  // vCard 2.1 bare type params
  const bare = params.split(';').map(p => p.trim().toUpperCase()).filter(p =>
    ['HOME','WORK','CELL','MOBILE','FAX','PAGER','VOICE','OTHER','INTERNET','X400'].includes(p)
  );
  if (bare.length) return bare.join('/');
  return '';
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
      nickname: '',
      birthday: '',
      addresses: [],
      urls: [],
      hasPhoto: false,
    };

    for (const line of lines) {
      const sep = line.indexOf(':');
      if (sep === -1) continue;
      const keyPart = line.slice(0, sep);
      const value = line.slice(sep + 1).trim();

      // Parse key and params (preserve original case for value, uppercase key for matching)
      const keyParts = keyPart.split(';');
      const key = keyParts[0].toUpperCase();
      const params = keyParts.slice(1).join(';');

      if (key === 'PHOTO') {
        contact.hasPhoto = true;
        continue;
      }

      if (key === 'FN') {
        if (params.toUpperCase().includes('ENCODING=B') || params.toUpperCase().includes('ENCODING=BASE64')) {
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
        if (value) {
          const type = extractType(params);
          const address = value.trim();
          if (!contact.emails.some(e => e.address === address)) {
            contact.emails.push({ address, type });
          }
        }
      } else if (key === 'TEL') {
        if (value) {
          const type = extractType(params);
          const number = value.trim();
          if (!contact.phones.some(p => p.number === number)) {
            contact.phones.push({ number, type });
          }
        }
      } else if (key === 'ORG') {
        contact.org = value.replace(/;/g, ' ').trim();
      } else if (key === 'TITLE') {
        contact.title = value;
      } else if (key === 'NOTE') {
        contact.note = value.replace(/\\n/g, '\n').replace(/\\,/g, ',');
      } else if (key === 'NICKNAME') {
        contact.nickname = value.replace(/\\,/g, ',').trim();
      } else if (key === 'BDAY') {
        // Normalize birthday: could be YYYYMMDD or YYYY-MM-DD or --MMDD (no year)
        let bday = value.trim();
        if (/^\d{8}$/.test(bday)) {
          // YYYYMMDD → YYYY-MM-DD
          bday = `${bday.slice(0,4)}-${bday.slice(4,6)}-${bday.slice(6,8)}`;
        }
        contact.birthday = bday;
      } else if (key === 'ADR') {
        // ADR;TYPE=HOME:PO Box;Extended;Street;City;State;ZIP;Country
        const adrType = extractType(params);
        const parts = value.split(';');
        const street = [parts[0], parts[1], parts[2]].filter(Boolean).join(' ').replace(/\\,/g, ',').trim();
        const city = (parts[3] || '').replace(/\\,/g, ',').trim();
        const state = (parts[4] || '').replace(/\\,/g, ',').trim();
        const zip = (parts[5] || '').trim();
        const country = (parts[6] || '').replace(/\\,/g, ',').trim();
        if (street || city || state || zip || country) {
          contact.addresses.push({ type: adrType, street, city, state, zip, country });
        }
      } else if (key === 'URL') {
        const url = value.trim();
        if (url && !contact.urls.includes(url)) {
          contact.urls.push(url);
        }
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
