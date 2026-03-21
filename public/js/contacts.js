'use strict';

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadContacts() {
  const params = new URLSearchParams();
  if (state.searchQuery) params.set('q', state.searchQuery);

  let data;
  try {
    data = await api(`/api/contacts?${params}`);
  } catch (e) {
    el('contacts-grid').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }

  el('contacts-count-label').textContent = `${data.total.toLocaleString()} contact${data.total !== 1 ? 's' : ''}`;

  if (data.items.length === 0) {
    el('contacts-grid').innerHTML = `<div class="empty-state"><span class="empty-state-icon">👤</span><span>No contacts found</span></div>`;
    return;
  }

  el('contacts-grid').innerHTML = data.items.map(renderContactCard).join('');
  el('contacts-grid').querySelectorAll('.contact-card').forEach((card, i) => {
    card.addEventListener('click', () => openContactModal(data.items[i]));
  });
}

function renderContactCard(contact) {
  const color = avatarColor(contact.name);
  const initial = avatarInitial(contact.name);
  const primaryEmail = contact.emails && contact.emails[0] ? contact.emails[0] : '';
  const org = contact.org || contact.title || '';

  return `
    <div class="contact-card">
      <div class="contact-avatar" style="background:${escHtml(color)}">${escHtml(initial)}</div>
      <div class="contact-name">${escHtml(contact.name || '(no name)')}</div>
      ${primaryEmail ? `<div class="contact-email">${escHtml(primaryEmail)}</div>` : ''}
      ${org ? `<div class="contact-org">${escHtml(org)}</div>` : ''}
    </div>
  `;
}

function openContactModal(contact) {
  const color = avatarColor(contact.name);
  const initial = avatarInitial(contact.name);

  const emailsHtml = contact.emails && contact.emails.length > 0
    ? contact.emails.map(e => `<div class="modal-row">${escHtml(e)}</div>`).join('')
    : '<div class="modal-row" style="color:#5f6368;">None</div>';

  const phonesHtml = contact.phones && contact.phones.length > 0
    ? contact.phones.map(p => `<div class="modal-row">${escHtml(p)}</div>`).join('')
    : '';

  const noteHtml = contact.note
    ? `<div class="modal-section">
        <div class="modal-section-title">Note</div>
        <div class="modal-row" style="white-space:pre-wrap;">${escHtml(contact.note)}</div>
       </div>`
    : '';

  el('contact-modal-content').innerHTML = `
    <div class="modal-avatar" style="background:${escHtml(color)}">${escHtml(initial)}</div>
    <div class="modal-name">${escHtml(contact.name || '(no name)')}</div>
    ${contact.org ? `<div class="modal-org">${escHtml(contact.org)}${contact.title ? ' · ' + escHtml(contact.title) : ''}</div>` : ''}
    <div class="modal-section">
      <div class="modal-section-title">Email</div>
      ${emailsHtml}
    </div>
    ${phonesHtml ? `<div class="modal-section"><div class="modal-section-title">Phone</div>${phonesHtml}</div>` : ''}
    ${noteHtml}
  `;

  el('contact-modal-overlay').classList.remove('hidden');
}

el('contact-modal-close').addEventListener('click', () => {
  el('contact-modal-overlay').classList.add('hidden');
});
el('contact-modal-overlay').addEventListener('click', (e) => {
  if (e.target === el('contact-modal-overlay')) {
    el('contact-modal-overlay').classList.add('hidden');
  }
});

window.loadContacts = loadContacts;
