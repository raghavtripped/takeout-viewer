'use strict';

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let allConversations = [];

async function loadChat() {
  const params = new URLSearchParams();
  if (state.searchQuery) params.set('q', state.searchQuery);

  let data;
  try {
    data = await api(`/api/chat?${params}`);
  } catch (e) {
    el('chat-conv-items').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }

  allConversations = data.conversations || [];
  el('chat-count-label').textContent = `${data.total} conversation${data.total !== 1 ? 's' : ''}`;
  renderConversationList(allConversations);

  // Re-render sidebar mirror
  el('chat-conv-list').innerHTML = allConversations.slice(0, 20).map(c => `
    <div class="sidebar-nav-row chat-sidebar-item ${state.activeChatId === c.id ? 'active' : ''}"
         data-id="${escHtml(c.id)}"
         title="${escHtml(c.name)}">
      ${escHtml(c.name.slice(0, 24))}
    </div>
  `).join('');
  el('chat-conv-list').querySelectorAll('.chat-sidebar-item').forEach(item => {
    item.addEventListener('click', () => openConversation(item.dataset.id));
  });

  // If a conversation was selected, reload it
  if (state.activeChatId) {
    openConversation(state.activeChatId);
  }
}

function renderConversationList(conversations) {
  if (conversations.length === 0) {
    el('chat-conv-items').innerHTML = `<div class="empty-state"><span class="empty-state-icon">💬</span><span>No conversations found</span></div>`;
    return;
  }

  el('chat-conv-items').innerHTML = conversations.map(c => {
    const icon = c.type === 'dm' ? '👤' : '👥';
    const participantStr = c.participants.slice(0, 3).join(', ') + (c.participants.length > 3 ? ` +${c.participants.length - 3}` : '');
    return `
      <div class="chat-conv-item ${state.activeChatId === c.id ? 'active' : ''}" data-id="${escHtml(c.id)}">
        <div class="chat-conv-icon">${icon}</div>
        <div class="chat-conv-info">
          <div class="chat-conv-name">${escHtml(c.name)}</div>
          <div class="chat-conv-participants">${escHtml(participantStr)}</div>
          <div class="chat-conv-meta">${c.messageCount} messages${c.lastDate ? ' · ' + formatDate(c.lastDate, true) : ''}</div>
        </div>
      </div>
    `;
  }).join('');

  el('chat-conv-items').querySelectorAll('.chat-conv-item').forEach(item => {
    item.addEventListener('click', () => openConversation(item.dataset.id));
  });
}

async function openConversation(convId) {
  state.activeChatId = convId;
  state.chatMsgPage = 1;

  // Update selection highlight
  el('chat-conv-items').querySelectorAll('.chat-conv-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === convId);
  });
  el('chat-conv-list').querySelectorAll('.chat-sidebar-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === convId);
  });

  el('chat-messages-pane').innerHTML = '<div style="padding:24px;color:#5f6368;">Loading...</div>';

  try {
    const data = await api(`/api/chat?conversation=${encodeURIComponent(convId)}&page=${state.chatMsgPage}&limit=100`);
    renderMessages(data.conversation, data.messages, data.total, data.page, data.pageSize);
  } catch (e) {
    el('chat-messages-pane').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
  }
}

function renderMessages(conv, messages, total, page, pageSize) {
  const conv_name = conv ? conv.name : 'Conversation';

  // Simple sender detection — first participant is likely "you"
  const participants = conv ? (conv.participants || []) : [];

  const msgsHtml = messages.map(msg => {
    const isMe = participants.length > 0 && msg.sender === participants[0];
    const color = avatarColor(msg.sender);
    const initial = avatarInitial(msg.sender);
    const time = msg.date ? new Date(msg.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    const dateStr = msg.date ? formatDate(msg.date, true) : '';

    return `
      <div class="chat-msg ${isMe ? 'chat-msg-me' : 'chat-msg-them'}">
        ${!isMe ? `<div class="chat-avatar" style="background:${color}">${escHtml(initial)}</div>` : ''}
        <div class="chat-bubble-wrap">
          ${!isMe ? `<div class="chat-sender-name">${escHtml(msg.sender)}</div>` : ''}
          <div class="chat-bubble">${escHtml(msg.text)}</div>
          <div class="chat-time">${escHtml(time)}</div>
        </div>
      </div>
    `;
  }).join('');

  const totalPages = Math.ceil(total / pageSize);
  const paginationHtml = totalPages > 1 ? `
    <div class="chat-pagination">
      <button class="btn-page" id="chat-msg-prev" ${page <= 1 ? 'disabled' : ''}>← Older</button>
      <span class="page-info">${page}/${totalPages}</span>
      <button class="btn-page" id="chat-msg-next" ${page >= totalPages ? 'disabled' : ''}>Newer →</button>
    </div>
  ` : '';

  el('chat-messages-pane').innerHTML = `
    <div class="chat-messages-header">
      <strong>${escHtml(conv_name)}</strong>
      <span class="chat-msg-count">${total} messages</span>
    </div>
    <div class="chat-messages-body" id="chat-messages-body">
      ${msgsHtml || '<div class="task-empty">No messages</div>'}
    </div>
    ${paginationHtml}
  `;

  // Scroll to bottom
  const body = el('chat-messages-body');
  if (body) body.scrollTop = body.scrollHeight;

  // Pagination
  const prevBtn = el('chat-msg-prev');
  const nextBtn = el('chat-msg-next');
  if (prevBtn) prevBtn.addEventListener('click', () => { state.chatMsgPage--; openConversation(state.activeChatId); });
  if (nextBtn) nextBtn.addEventListener('click', () => { state.chatMsgPage++; openConversation(state.activeChatId); });
}

window.loadChat = loadChat;
