'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Walk the Google Chat export structure:
 *   Google Chat/Groups/<conv-id>/messages.json
 *   Google Chat/DMs/<conv-id>/messages.json
 * Returns array of conversation objects, each with messages array.
 */
function parseChatDir(chatDir) {
  if (!fs.existsSync(chatDir)) return [];

  const conversations = [];

  // Google Chat exports to Groups/ and DMs/ subdirectories
  for (const subDir of ['Groups', 'DMs', 'Spaces']) {
    const groupsDir = path.join(chatDir, subDir);
    if (!fs.existsSync(groupsDir)) continue;

    const convDirs = fs.readdirSync(groupsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => path.join(groupsDir, e.name));

    for (const convDir of convDirs) {
      const messagesPath = path.join(convDir, 'messages.json');
      if (!fs.existsSync(messagesPath)) continue;

      try {
        const raw = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
        const messages = (raw.messages || []).map(msg => {
          const creator = msg.creator || {};
          // created_date format: "Wednesday, January 15, 2025 at 10:00:00 AM UTC"
          const dateStr = msg.created_date || '';
          const date = parseChatDate(dateStr);

          return {
            sender: creator.name || creator.email || 'Unknown',
            senderEmail: creator.email || '',
            text: msg.text || '',
            date: date ? date.toISOString() : null,
            timestamp: date ? date.getTime() : 0,
            topicId: msg.topic_id || '',
          };
        }).filter(m => m.text || m.date);

        // Sort oldest first for display
        messages.sort((a, b) => a.timestamp - b.timestamp);

        // Derive conversation name from the raw JSON or directory name
        const convName = raw.name || path.basename(convDir);

        // Get unique participants
        const participantSet = new Set(messages.map(m => m.sender).filter(Boolean));
        const participants = Array.from(participantSet);

        const lastMsg = messages[messages.length - 1];

        conversations.push({
          id: `chat-${conversations.length}`,
          name: convName,
          type: subDir === 'DMs' ? 'dm' : 'group',
          participants,
          messageCount: messages.length,
          lastDate: lastMsg ? lastMsg.date : null,
          lastTimestamp: lastMsg ? lastMsg.timestamp : 0,
          messages,
        });
      } catch (e) {
        console.error(`[chatParser] Failed to parse ${messagesPath}:`, e.message);
      }
    }
  }

  // Sort by most recent message
  conversations.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  return conversations.map((c, i) => ({ ...c, id: `chat-${i}` }));
}

function parseChatDate(str) {
  if (!str) return null;
  // "Wednesday, January 15, 2025 at 10:00:00 AM UTC"
  // Strip "at" and try parsing
  const cleaned = str
    .replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, '')
    .replace(' at ', ' ')
    .replace(' UTC', ' GMT+0000');
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;
  // Try as-is
  const d2 = new Date(str);
  if (!isNaN(d2.getTime())) return d2;
  return null;
}

module.exports = { parseChatDir };
