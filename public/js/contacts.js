'use strict';

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function avatarInitial(name) {
  if (!name) return '?';
  return name.trim()[0].toUpperCase();
}

const AVATAR_COLORS = ['#4285f4','#ea4335','#34a853','#fbbc04','#9c27b0','#00bcd4','#ff5722','#607d8b','#3f51b5','#e91e63'];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name||'').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

let contactsState = { search: '' };

async function loadContacts() {
  const params = new URLSearchParams();
  if (contactsState.search) params.set('q', contactsState.search);
  let data;
  try {
    data = await api(`/api/contacts?${params}`);
  } catch (e) {
    el('contacts-grid').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }
  el('contacts-count-label').textContent = `${data.total.toLocaleString()} contact${data.total !== 1 ? 's' : ''}`;
  renderContactGrid(data.items || []);
}

function renderContactGrid(contacts) {
  const grid = el('contacts-grid');
  if (!contacts.length) {
    grid.innerHTML = `<div class="empty-state"><span class="empty-state-icon">👤</span><span>No contacts found</span></div>`;
    return;
  }
  grid.innerHTML = `<div class="contacts-grid-inner">${contacts.map((c, i) => renderContactCard(c, i)).join('')}</div>`;
  grid.querySelectorAll('.contact-card').forEach((card, i) => {
    card.addEventListener('click', () => openContactModal(contacts[i]));
  });
}

function renderContactCard(c, idx) {
  const name = c.name || '(no name)';
  const primaryEmail = Array.isArray(c.emails) ? (c.emails[0]?.address || c.emails[0] || '') : (c.emails || '');
  const primaryPhone = Array.isArray(c.phones) ? (c.phones[0]?.number || c.phones[0] || '') : '';

  return `<div class="contact-card" data-idx="${idx}">
    <div class="contact-avatar" style="background:${avatarColor(name)}">${avatarInitial(name)}</div>
    <div class="contact-card-info">
      <div class="contact-card-name">${escHtml(name)}</div>
      ${c.org ? `<div class="contact-card-org">${escHtml(c.org)}</div>` : ''}
      ${c.title ? `<div class="contact-card-title">${escHtml(c.title)}</div>` : ''}
      ${primaryEmail ? `<div class="contact-card-email">✉ ${escHtml(primaryEmail)}</div>` : ''}
      ${primaryPhone ? `<div class="contact-card-phone">📞 ${escHtml(primaryPhone)}</div>` : ''}
    </div>
  </div>`;
}

function openContactModal(c) {
  const name = c.name || '(no name)';
  const overlay = el('contact-modal-overlay');
  let html = `
    <div class="contact-modal-header">
      <div class="contact-modal-avatar" style="background:${avatarColor(name)}">${avatarInitial(name)}</div>
      <div>
        <div class="contact-modal-name">${escHtml(name)}</div>
        ${c.org ? `<div class="contact-modal-org">${escHtml(c.org)}</div>` : ''}
        ${c.title ? `<div class="contact-modal-role">${escHtml(c.title)}</div>` : ''}
      </div>
    </div>`;

  // Emails
  const emails = Array.isArray(c.emails) ? c.emails : (c.emails ? [{ address: c.emails }] : []);
  if (emails.length) {
    html += `<div class="contact-section"><div class="contact-section-label">Email</div>`;
    for (const e of emails) {
      const addr = e.address || e;
      const type = e.type ? `<span class="contact-type-badge">${escHtml(e.type)}</span>` : '';
      html += `<div class="contact-field"><a href="mailto:${escHtml(addr)}">${escHtml(addr)}</a>${type}</div>`;
    }
    html += `</div>`;
  }

  // Phones
  const phones = Array.isArray(c.phones) ? c.phones : (c.phones ? [{ number: c.phones }] : []);
  if (phones.length) {
    html += `<div class="contact-section"><div class="contact-section-label">Phone</div>`;
    for (const p of phones) {
      const num = p.number || p;
      const type = p.type ? `<span class="contact-type-badge">${escHtml(p.type)}</span>` : '';
      html += `<div class="contact-field">${escHtml(num)}${type}</div>`;
    }
    html += `</div>`;
  }

  // Addresses
  if (c.addresses && c.addresses.length) {
    html += `<div class="contact-section"><div class="contact-section-label">Address</div>`;
    for (const a of c.addresses) {
      const parts = [a.street, a.city, a.state, a.zip, a.country].filter(Boolean);
      if (parts.length) {
        const type = a.type ? `<span class="contact-type-badge">${escHtml(a.type)}</span>` : '';
        html += `<div class="contact-field">${escHtml(parts.join(', '))}${type}</div>`;
      }
    }
    html += `</div>`;
  }

  // URLs
  if (c.urls && c.urls.length) {
    html += `<div class="contact-section"><div class="contact-section-label">Website</div>`;
    for (const u of c.urls) {
      html += `<div class="contact-field"><a href="${escHtml(u)}" target="_blank" rel="noopener">${escHtml(u)}</a></div>`;
    }
    html += `</div>`;
  }

  // Birthday
  if (c.birthday) {
    html += `<div class="contact-section"><div class="contact-section-label">Birthday</div><div class="contact-field">🎂 ${escHtml(c.birthday)}</div></div>`;
  }

  // Notes
  if (c.note) {
    html += `<div class="contact-section"><div class="contact-section-label">Notes</div><div class="contact-field contact-note">${escHtml(c.note)}</div></div>`;
  }

  el('contact-modal-content').innerHTML = html;
  overlay.classList.remove('hidden');
  el('contact-modal-close').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
}

function setupContacts() {
  el('search-input').addEventListener('input', () => {
    if (state.activeTab !== 'contacts') return;
    contactsState.search = el('search-input').value.trim();
    loadContacts();
  });
}

window.loadContacts = loadContacts;
setupContacts();
