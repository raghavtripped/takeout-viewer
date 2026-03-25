'use strict';

function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatEventTime(event) {
  if (event.allDay) return 'All day';
  if (!event.start) return '';
  const d = new Date(event.start);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (event.end) {
    const e = new Date(event.end);
    if (e.toDateString() === d.toDateString()) {
      return time + ' \u2013 ' + e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
  }
  return time;
}

function formatFullDate(event) {
  if (!event.start) return '';
  const d = new Date(event.start);
  if (event.allDay) {
    let s = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (event.end) {
      const e = new Date(event.end);
      s += ' \u2013 ' + e.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    }
    return s;
  }
  let s = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  s += ', ' + formatEventTime(event);
  return s;
}

async function loadCalendar() {
  const params = new URLSearchParams({ year: state.calYear, month: state.calMonth });
  if (state.searchQuery) params.set('q', state.searchQuery);
  let data;
  try {
    data = await api(`/api/calendar?${params}`);
  } catch (e) {
    el('calendar-content').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }
  const events = data.items || [];
  el('cal-count-label').textContent = `${data.total} event${data.total !== 1 ? 's' : ''}`;
  el('cal-title').textContent = new Date(state.calYear, state.calMonth - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (state.calView === 'list') renderCalList(events);
  else renderCalGrid(events);
}

function renderCalList(events) {
  const content = el('calendar-content');
  if (!events.length) {
    content.innerHTML = `<div class="empty-state"><span class="empty-state-icon">\uD83D\uDCC5</span><span>No events this month</span></div>`;
    return;
  }
  // Group by date string key (YYYY-MM-DD) so ordering is stable
  const byDay = {};
  const keyOrder = [];
  for (const ev of events) {
    if (!ev.start) continue;
    const d = new Date(ev.start);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!byDay[key]) { byDay[key] = []; keyOrder.push(key); }
    byDay[key].push(ev);
  }
  keyOrder.sort();
  let html = '';
  for (const key of keyOrder) {
    const dayEvents = byDay[key];
    const d = new Date(key + 'T00:00:00');
    const dayLabel = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    html += `<div class="cal-day-group">
      <div class="cal-day-header">${escHtml(dayLabel)}</div>`;
    for (const ev of dayEvents) {
      html += `<div class="cal-event-row" data-ev-id="${escHtml(ev.id)}">
        <div class="cal-event-time">${escHtml(formatEventTime(ev))}</div>
        <div class="cal-event-main">
          <div class="cal-event-title">${escHtml(ev.title || '(no title)')}${ev.rrule ? ' <span class="recur-badge" title="Recurring">\u21BB</span>' : ''}</div>
          ${ev.location ? `<div class="cal-event-location">\uD83D\uDCCD ${escHtml(ev.location)}</div>` : ''}
          ${ev.description ? `<div class="cal-event-desc">${escHtml(ev.description.slice(0,120))}${ev.description.length > 120 ? '\u2026' : ''}</div>` : ''}
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  content.innerHTML = html;
  content.querySelectorAll('.cal-event-row').forEach(row => {
    row.addEventListener('click', () => {
      const ev = events.find(e => e.id === row.dataset.evId);
      if (ev) openEventModal(ev);
    });
  });
}

function renderCalGrid(events) {
  const content = el('calendar-content');
  const year = state.calYear;
  const month = state.calMonth - 1; // 0-indexed
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Index events by day number
  const byDay = {};
  for (const ev of events) {
    if (!ev.start) continue;
    const d = new Date(ev.start);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(ev);
    }
  }

  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = `<div class="cal-grid-wrap"><table class="cal-grid-table">
    <thead><tr>${weekdays.map(d => `<th class="cal-grid-th">${d}</th>`).join('')}</tr></thead>
    <tbody>`;

  let day = 1;
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let cell = 0; cell < totalCells; cell++) {
    if (cell % 7 === 0) html += '<tr>';
    if (cell < firstDay || day > daysInMonth) {
      html += '<td class="cal-cell cal-cell-empty"></td>';
    } else {
      const today = new Date();
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      const dayEvents = byDay[day] || [];
      const visible = dayEvents.slice(0, 3);
      const extra = dayEvents.length - visible.length;
      html += `<td class="cal-cell${isToday ? ' cal-today' : ''}">
        <div class="cal-cell-day">${day}</div>
        <div class="cal-cell-events">
          ${visible.map(ev => `<div class="cal-chip" data-ev-id="${escHtml(ev.id)}" title="${escHtml(ev.title)}">${escHtml((ev.title || '').slice(0, 22))}</div>`).join('')}
          ${extra > 0 ? `<div class="cal-chip-more" data-day="${day}">+${extra} more</div>` : ''}
        </div>
      </td>`;
      day++;
    }
    if (cell % 7 === 6) html += '</tr>';
  }
  html += '</tbody></table></div>';
  content.innerHTML = html;

  content.querySelectorAll('.cal-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const ev = events.find(e => e.id === chip.dataset.evId);
      if (ev) openEventModal(ev);
    });
  });
  content.querySelectorAll('.cal-chip-more').forEach(more => {
    more.addEventListener('click', () => {
      const d = parseInt(more.dataset.day);
      const dayEvs = byDay[d] || [];
      openDayModal(new Date(year, month, d), dayEvs, events);
    });
  });
}

function openEventModal(ev) {
  let html = `<div class="event-modal-title">${escHtml(ev.title || '(no title)')}</div>`;
  html += `<div class="event-modal-date">\uD83D\uDCC5 ${escHtml(formatFullDate(ev))}</div>`;
  if (ev.location) html += `<div class="event-modal-row">\uD83D\uDCCD <span>${escHtml(ev.location)}</span></div>`;
  if (ev.description) html += `<div class="event-modal-desc">${escHtml(ev.description)}</div>`;
  if (ev.attendees && ev.attendees.length) {
    html += `<div class="event-modal-row">\uD83D\uDC65 ${ev.attendees.map(a => `<span class="attendee-chip">${escHtml(a.name || a.email || '')}</span>`).join('')}</div>`;
  }
  if (ev.url) html += `<div class="event-modal-row">\uD83D\uDD17 <a href="${escHtml(ev.url)}" target="_blank" rel="noopener">${escHtml(ev.url)}</a></div>`;
  if (ev.rrule) html += `<div class="event-modal-row">\u21BB <span class="recur-badge">Recurring</span></div>`;
  showCalModal(html);
}

function openDayModal(date, dayEvents, allEvents) {
  const label = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  let html = `<div class="event-modal-title">\uD83D\uDCC5 ${escHtml(label)}</div>`;
  for (const ev of dayEvents) {
    html += `<div class="cal-event-row day-modal-event" style="cursor:pointer" data-ev-id="${escHtml(ev.id)}">
      <div class="cal-event-time">${escHtml(formatEventTime(ev))}</div>
      <div class="cal-event-main"><div class="cal-event-title">${escHtml(ev.title || '(no title)')}</div></div>
    </div>`;
  }
  showCalModal(html, (body) => {
    body.querySelectorAll('.day-modal-event').forEach(row => {
      row.addEventListener('click', () => {
        const ev = allEvents.find(e => e.id === row.dataset.evId);
        if (ev) { hideCalModal(); openEventModal(ev); }
      });
    });
  });
}

let _calModalEl = null;
function showCalModal(html, afterInsert) {
  if (!_calModalEl) {
    _calModalEl = document.createElement('div');
    _calModalEl.className = 'event-modal-overlay hidden';
    _calModalEl.innerHTML = `<div class="event-modal"><button class="modal-close event-modal-close">\u2715</button><div class="event-modal-body"></div></div>`;
    document.body.appendChild(_calModalEl);
    _calModalEl.addEventListener('click', e => { if (e.target === _calModalEl) hideCalModal(); });
    _calModalEl.querySelector('.event-modal-close').addEventListener('click', hideCalModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideCalModal(); });
  }
  _calModalEl.querySelector('.event-modal-body').innerHTML = html;
  _calModalEl.classList.remove('hidden');
  if (afterInsert) afterInsert(_calModalEl.querySelector('.event-modal-body'));
}
function hideCalModal() { if (_calModalEl) _calModalEl.classList.add('hidden'); }

// ── Toolbar nav ────────────────────────────────────────────────────────────────
el('cal-prev').addEventListener('click', () => {
  state.calMonth--;
  if (state.calMonth < 1) { state.calMonth = 12; state.calYear--; }
  loadCalendar();
});
el('cal-next').addEventListener('click', () => {
  state.calMonth++;
  if (state.calMonth > 12) { state.calMonth = 1; state.calYear++; }
  loadCalendar();
});

// ── Sidebar view toggles ───────────────────────────────────────────────────────
el('cal-list-btn').addEventListener('click', () => {
  state.calView = 'list';
  el('cal-list-btn').classList.add('active');
  el('cal-grid-btn').classList.remove('active');
  loadCalendar();
});
el('cal-grid-btn').addEventListener('click', () => {
  state.calView = 'grid';
  el('cal-grid-btn').classList.add('active');
  el('cal-list-btn').classList.remove('active');
  loadCalendar();
});

window.loadCalendar = loadCalendar;
