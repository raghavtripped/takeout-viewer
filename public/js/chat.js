'use strict';

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatChatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 86400000;
  if (diff < 1 && d.getDate() === now.getDate()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatMessageTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

let chatState = {
  conversations: [],
  activeConvId: null,
  myName: null,   // detected from most-frequent sender
  page: 1,
  pageSize: 20,
};

async function loadChat() {
  let data;
  try {
    data = await api('/api/chat');
  } catch (e) {
    el('chat-conv-items').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }
  chatState.conversations = data.items || data.conversations || [];

  // Detect "my name" = most frequent sender across all conversations
  const senderCount = {};
  for (const conv of chatState.conversations) {
    for (const msg of (conv.messages || [])) {
      if (msg.sender) senderCount[msg.sender] = (senderCount[msg.sender] || 0) + 1;
    }
  }
  if (Object.keys(senderCount).length) {
    chatState.myName = Object.entries(senderCount).sort((a,b) => b[1]-a[1])[0][0];
  }

  const total = chatState.conversations.length;
  el('chat-count-label').textContent = `${total} conversation${total !== 1 ? 's' : ''}`;
  renderConvList(chatState.conversations);

  // Populate sidebar conv list
  el('chat-conv-list').innerHTML = chatState.conversations.slice(0, 20).map(c => `
    <div class="sidebar-nav-row chat-sidebar-item ${chatState.activeConvId === c.id ? 'active' : ''}"
         data-id="${escHtml(c.id)}"
         title="${escHtml(c.name || c.id)}">
      ${escHtml((c.name || c.id).slice(0, 24))}
    </div>
  `).join('');
  el('chat-conv-list').querySelectorAll('.chat-sidebar-item').forEach(item => {
    item.addEventListener('click', () => openConversation(item.dataset.id));
  });

  // If a conversation was previously selected, reopen it
  if (chatState.activeConvId) {
    openConversation(chatState.activeConvId);
  }
}

function renderConvList(convs) {
  const container = el('chat-conv-items');
  if (!convs.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">💬</span><span>No conversations</span></div>`;
    return;
  }
  container.innerHTML = convs.map(conv => {
    const isActive = conv.id === chatState.activeConvId;
    const icon = conv.type === 'dm' ? '👤' : '👥';
    const participants = (conv.participants || []).filter(p => p !== chatState.myName).slice(0, 2).join(', ') || conv.name;
    const displayName = conv.name && conv.name.length < 40 ? conv.name : (participants || conv.id);
    return `<div class="chat-conv-item ${isActive ? 'active' : ''}" data-conv-id="${escHtml(conv.id)}">
      <div class="chat-conv-icon">${icon}</div>
      <div class="chat-conv-info">
        <div class="chat-conv-name">${escHtml(displayName)}</div>
        <div class="chat-conv-meta">${conv.messageCount} messages · ${escHtml(formatChatDate(conv.lastDate))}</div>
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('.chat-conv-item').forEach(item => {
    item.addEventListener('click', () => openConversation(item.dataset.convId));
  });
}

async function openConversation(convId) {
  chatState.activeConvId = convId;
  // Update sidebar highlights
  el('chat-conv-items').querySelectorAll('.chat-conv-item').forEach(item => {
    item.classList.toggle('active', item.dataset.convId === convId);
  });
  el('chat-conv-list').querySelectorAll('.chat-sidebar-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === convId);
  });
  el('chat-messages-pane').innerHTML = `<div class="chat-loading">Loading…</div>`;

  let data;
  try {
    data = await api(`/api/chat?conversation=${encodeURIComponent(convId)}`);
  } catch (e) {
    el('chat-messages-pane').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }

  const conv = chatState.conversations.find(c => c.id === convId);
  const messages = data.messages || [];
  renderMessages(conv, messages);
}

function renderMessages(conv, messages) {
  const pane = el('chat-messages-pane');
  if (!messages.length) {
    pane.innerHTML = `<div class="empty-state"><span>No messages</span></div>`;
    return;
  }

  const displayName = conv ? (conv.name || conv.id) : 'Conversation';
  const participants = conv ? (conv.participants || []).join(', ') : '';

  let html = `<div class="chat-messages-header">
    <div class="chat-messages-title">${escHtml(displayName)}</div>
    ${participants ? `<div class="chat-messages-participants">${escHtml(participants)}</div>` : ''}
  </div><div class="chat-messages-list">`;

  let lastDateStr = '';
  for (const msg of messages) {
    const isMe = msg.sender === chatState.myName;
    const dateStr = msg.date ? new Date(msg.date).toDateString() : '';
    if (dateStr && dateStr !== lastDateStr) {
      lastDateStr = dateStr;
      const label = new Date(dateStr).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      html += `<div class="chat-date-separator"><span>${escHtml(label)}</span></div>`;
    }
    html += `<div class="chat-msg-wrap ${isMe ? 'chat-msg-me' : 'chat-msg-other'}">
      ${!isMe ? `<div class="chat-msg-sender">${escHtml(msg.sender || '')}</div>` : ''}
      <div class="chat-bubble ${isMe ? 'bubble-me' : 'bubble-other'}">
        <div class="chat-bubble-text">${escHtml(msg.text || '')}</div>
        <div class="chat-bubble-time">${escHtml(formatMessageTime(msg.date))}</div>
      </div>
    </div>`;
  }
  html += `</div>`;
  pane.innerHTML = html;
  // Scroll to bottom
  const list = pane.querySelector('.chat-messages-list');
  if (list) list.scrollTop = list.scrollHeight;
}

function setupChat() {
  const convList = el('chat-conv-list');
  if (convList) {
    // Sidebar conv list is populated in loadChat
  }
  el('search-input').addEventListener('input', () => {
    if (state.activeTab !== 'chat') return;
    const q = el('search-input').value.trim().toLowerCase();
    const filtered = q
      ? chatState.conversations.filter(c => (c.name||'').toLowerCase().includes(q) || (c.participants||[]).some(p => p.toLowerCase().includes(q)))
      : chatState.conversations;
    renderConvList(filtered);
  });
}

window.loadChat = loadChat;
setupChat();
