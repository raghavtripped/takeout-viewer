'use strict';

const fs = require('fs');
const readline = require('readline');

// RFC 2047 encoded-word decoder: =?UTF-8?B?...?= or =?UTF-8?Q?...?=
function decodeEncodedWords(str) {
  if (!str) return '';
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf8');
      } else {
        // Quoted-printable: replace _ with space, then decode =XX as UTF-8 bytes
        const qpText = text.replace(/_/g, ' ');
        const bytes = [];
        let i = 0;
        while (i < qpText.length) {
          if (qpText[i] === '=' && i + 2 < qpText.length) {
            bytes.push(parseInt(qpText.slice(i + 1, i + 3), 16));
            i += 3;
          } else {
            bytes.push(qpText.charCodeAt(i));
            i++;
          }
        }
        return Buffer.from(bytes).toString('utf8');
      }
    } catch {
      return text;
    }
  });
}

function parseDate(raw) {
  if (!raw) return null;
  // Strip named timezone abbreviations that confuse Date.parse
  const cleaned = raw.replace(/\s+\([A-Z]{2,5}\)\s*$/, '').trim();
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;
  // Fallback: try just parsing as-is
  const d2 = new Date(raw);
  if (!isNaN(d2.getTime())) return d2;
  return null;
}

function parseHeaderValue(lines) {
  // Join folded header lines (lines starting with whitespace are continuations)
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

// Decode MIME content to a Buffer (handles base64 and quoted-printable)
function decodePartToBuffer(content, encoding) {
  const enc = (encoding || '').toLowerCase().trim();
  if (enc === 'base64') {
    try {
      return Buffer.from(content.replace(/\s/g, ''), 'base64');
    } catch {
      return Buffer.from(content);
    }
  }
  if (enc === 'quoted-printable') {
    const stripped = content.replace(/=\r?\n/g, '');
    const bytes = [];
    let i = 0;
    while (i < stripped.length) {
      if (stripped[i] === '=' && i + 2 < stripped.length) {
        bytes.push(parseInt(stripped.slice(i + 1, i + 3), 16));
        i += 3;
      } else {
        bytes.push(stripped.charCodeAt(i));
        i++;
      }
    }
    return Buffer.from(bytes);
  }
  // identity / 7bit / 8bit — return as UTF-8 buffer
  return Buffer.from(content);
}

// Decode MIME base64/QP body parts to a string
function decodePart(content, encoding) {
  if (!encoding) return content;
  const enc = encoding.toLowerCase().trim();
  if (enc === 'base64') {
    try {
      return Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf8');
    } catch { return content; }
  }
  if (enc === 'quoted-printable') {
    return decodePartToBuffer(content, encoding).toString('utf8');
  }
  return content;
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

// Parse folded headers from a header block string
function parseFoldedHeaders(headerBlock) {
  const headers = {};
  let currentKey = null;
  let currentVal = [];

  for (const line of headerBlock.split('\n')) {
    if (/^[\t ]/.test(line) && currentKey) {
      currentVal.push(line.trim());
    } else {
      if (currentKey) {
        headers[currentKey] = parseHeaderValue(currentVal);
      }
      const m = line.match(/^([\w-]+):\s*(.*)/i);
      if (m) {
        currentKey = m[1].toLowerCase();
        currentVal = [m[2]];
      } else {
        currentKey = null;
        currentVal = [];
      }
    }
  }
  if (currentKey) {
    headers[currentKey] = parseHeaderValue(currentVal);
  }
  return headers;
}

// Recursive MIME part extractor — returns { textPlain, textHtml, attachments }
// outerCt: Content-Type of the whole message (for single-part emails)
// outerCe: Content-Transfer-Encoding of the whole message
function extractParts(rawBody, boundary, outerCt, outerCe) {
  let textPlain = '';
  let textHtml = '';
  const attachments = [];

  if (!boundary) {
    // Single part — decode and route based on outerCt
    const ct = (outerCt || 'text/plain').toLowerCase();
    const decoded = decodePart(rawBody, outerCe);
    if (ct.startsWith('text/html')) {
      textHtml = decoded;
    } else {
      textPlain = decoded;
    }
    return { textPlain, textHtml, attachments };
  }

  const delimRe = new RegExp('--' + boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = rawBody.split(delimRe);

  for (const part of parts) {
    if (part.startsWith('--') || part.trim() === '') continue;

    const sepIdx = part.indexOf('\n\n');
    if (sepIdx === -1) continue;

    const headerBlock = part.slice(0, sepIdx);
    const body = part.slice(sepIdx + 2);

    // Use folded header parser for part headers
    const headers = parseFoldedHeaders(headerBlock);

    const ct = headers['content-type'] || '';
    const ce = headers['content-transfer-encoding'] || '';
    const cd = headers['content-disposition'] || '';

    // Check for nested multipart
    const subBoundaryMatch = ct.match(/boundary="?([^";\s]+)"?/i);
    if (ct.startsWith('multipart/') && subBoundaryMatch) {
      const sub = extractParts(body, subBoundaryMatch[1]);
      if (!textPlain && sub.textPlain) textPlain = sub.textPlain;
      if (!textHtml && sub.textHtml) textHtml = sub.textHtml;
      attachments.push(...sub.attachments);
      continue;
    }

    // Determine if this is an attachment
    const isAttachmentDisposition = /^\s*attachment/i.test(cd);
    const filenameMatch =
      cd.match(/filename\*?=(?:"([^"]+)"|([^;\s]+))/i) ||
      ct.match(/name\*?=(?:"([^"]+)"|([^;\s]+))/i);
    const filename = filenameMatch ? (filenameMatch[1] || filenameMatch[2] || '').trim() : null;

    const isInlineText =
      (ct.startsWith('text/plain') || ct.startsWith('text/html')) &&
      !isAttachmentDisposition &&
      !filename;

    if (isAttachmentDisposition || (filename && !isInlineText)) {
      // This is an attachment
      const attName = filename || 'attachment';
      const attCt = ct.split(';')[0].trim() || 'application/octet-stream';
      const rawSize = body.length;
      if (rawSize > MAX_ATTACHMENT_BYTES) {
        attachments.push({ name: attName, contentType: attCt, size: rawSize, data: null, unavailable: true });
      } else {
        const data = decodePartToBuffer(body, ce);
        attachments.push({ name: attName, contentType: attCt, size: data.length, data });
      }
      continue;
    }

    const decoded = decodePart(body, ce);
    if (ct.startsWith('text/plain') && !textPlain) {
      textPlain = decoded;
    } else if (ct.startsWith('text/html') && !textHtml) {
      textHtml = decoded;
    }
  }

  return { textPlain, textHtml, attachments };
}

function stripHtmlTags(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelsToFolder(labels) {
  if (!labels) return 'All Mail';
  const lower = labels.toLowerCase();
  if (lower.includes('inbox')) return 'Inbox';
  if (lower.includes('sent')) return 'Sent';
  if (lower.includes('trash')) return 'Trash';
  if (lower.includes('spam')) return 'Spam';
  if (lower.includes('draft')) return 'Drafts';
  if (lower.includes('starred')) return 'Starred';
  return 'All Mail';
}

function extractAddressName(addr) {
  if (!addr) return '';
  // "Name <email>" → Name; otherwise email as-is
  const m = addr.match(/^"?([^"<]+?)"?\s*<[^>]+>/);
  if (m) return m[1].trim();
  return addr.trim();
}

/**
 * Stream-parse an mbox file, calling onEmail(metadata, fullEmail) for each message.
 * onEmail may be async — we await it before continuing.
 */
/**
 * Stream-parse an mbox file, calling onEmail(metadata, fullEmail) for each message.
 * Optional onProgress(bytesRead, totalBytes) is called as data chunks arrive.
 */
async function parseMbox(filePath, onEmail, onProgress) {
  return new Promise((resolve, reject) => {
    const totalBytes = fs.statSync(filePath).size;
    let bytesRead = 0;

    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    if (onProgress) {
      stream.on('data', (chunk) => {
        bytesRead += Buffer.byteLength(chunk, 'utf8');
        onProgress(bytesRead, totalBytes);
      });
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let buffer = [];
    let count = 0;
    let queue = Promise.resolve();

    function flush() {
      if (buffer.length === 0) return;
      const raw = buffer.join('\n');
      buffer = [];
      count++;

      queue = queue.then(async () => {
        try {
          await processMessage(raw, count, onEmail);
        } catch (e) {
          if (e.message === 'Import aborted by user') throw e; // propagate abort
          // Don't abort whole parse for one bad message
          console.error(`[mbox] Error processing message ${count}:`, e.message);
        }
      });
    }

    rl.on('line', (line) => {
      // mbox separator: line starting with "From " (note the space)
      if (line.startsWith('From ') && buffer.length > 0) {
        flush();
      }
      buffer.push(line);
    });

    rl.on('close', () => {
      flush();
      queue.then(() => resolve(count)).catch(reject);
    });

    rl.on('error', reject);
  });
}

async function processMessage(raw, index, onEmail) {
  // Split headers from body at first blank line
  const sepIdx = raw.indexOf('\n\n');
  if (sepIdx === -1) return;

  const headerBlock = raw.slice(0, sepIdx);
  const rawBody = raw.slice(sepIdx + 2);

  // Parse headers — handle folding (continuation lines start with whitespace)
  const headers = parseFoldedHeaders(headerBlock);

  const subject = decodeEncodedWords(headers['subject'] || '(no subject)');
  const from = decodeEncodedWords(headers['from'] || '');
  const to = decodeEncodedWords(headers['to'] || '');
  const dateRaw = headers['date'] || '';
  const labels = headers['x-gmail-labels'] || '';
  const messageId = headers['message-id'] || `msg-${index}`;
  const ct = headers['content-type'] || 'text/plain';
  const ce = headers['content-transfer-encoding'] || '';

  const dateObj = parseDate(dateRaw);
  const timestamp = dateObj ? dateObj.getTime() : 0;
  const dateIso = dateObj ? dateObj.toISOString() : null;

  // Extract boundary for multipart
  const boundaryMatch = ct.match(/boundary="?([^";\s]+)"?/i);
  const boundary = boundaryMatch ? boundaryMatch[1] : null;

  const { textPlain, textHtml, attachments: rawAttachments } = extractParts(rawBody, boundary, ct, ce);

  // Prefer plain text for snippet; fall back to stripping HTML
  const snippetSource = textPlain || stripHtmlTags(textHtml);
  const snippet = snippetSource.replace(/\s+/g, ' ').trim().slice(0, 200);

  // Detect attachments: look for Content-Disposition: attachment in raw, or from extracted parts
  const hasAttachment = /content-disposition:\s*attachment/i.test(raw) || rawAttachments.length > 0;

  // Parse label list
  const labelList = labels
    ? labels.split(',').map((l) => l.trim().replace(/^"|"$/g, '')).filter(Boolean)
    : [];

  const folder = labelsToFolder(labels);

  // Sanitize ID
  const safeId = `email-${index}-${Math.abs(messageId.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0))}`;

  const metadata = {
    id: safeId,
    subject,
    from,
    fromName: extractAddressName(from),
    to,
    date: dateIso,
    timestamp,
    snippet,
    labels: labelList,
    folder,
    hasAttachment,
  };

  const fullEmail = {
    ...metadata,
    bodyText: textPlain,
    bodyHtml: textHtml,
    rawAttachments,
  };

  await onEmail(metadata, fullEmail);
}

module.exports = { parseMbox };
