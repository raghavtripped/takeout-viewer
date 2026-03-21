'use strict';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatEventTime(isoStr, allDay) {
  if (!isoStr || allDay) return 'All day';
  const d = new Date(isoStr);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

  el('cal-title').textContent = `${MONTHS[state.calMonth - 1]} ${state.calYear}`;
  el('cal-count-label').textContent = `${data.total} event${data.total !== 1 ? 's' : ''}`;

  if (state.calView === 'list') {
    renderCalList(data.items);
  } else {
    renderCalGrid(data.items);
  }
}

function renderCalList(events) {
  if (events.length === 0) {
    el('calendar-content').innerHTML = `<div class="empty-state"><span class="empty-state-icon">📅</span><span>No events this month</span></div>`;
    return;
  }

  // Group by day
  const groups = {};
  for (const ev of events) {
    if (!ev.start) continue;
    const d = new Date(ev.start);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(ev);
  }

  const sortedKeys = Object.keys(groups).sort();
  el('calendar-content').innerHTML = sortedKeys.map(key => {
    const d = new Date(key + 'T00:00:00');
    const monthLabel = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const eventsHtml = groups[key].map(ev => renderEventRow(ev)).join('');
    return `
      <div class="cal-month-group">
        <div class="cal-month-heading">${escHtml(d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }))}</div>
        ${eventsHtml}
      </div>
    `;
  }).join('');
}

function renderEventRow(ev) {
  const d = ev.start ? new Date(ev.start) : null;
  const day = d ? d.getDate() : '?';
  const dow = d ? DAYS[d.getDay()] : '';
  const timeStr = formatEventTime(ev.start, ev.allDay);
  const endTimeStr = ev.end && !ev.allDay ? ` – ${formatEventTime(ev.end, false)}` : '';
  const recurringBadge = ev.rrule ? `<span class="event-recurring">↻ Recurring</span>` : '';
  const locationStr = ev.location ? `<div class="event-location">📍 ${escHtml(ev.location)}</div>` : '';

  return `
    <div class="event-row">
      <div class="event-date-col">
        <div class="event-day">${day}</div>
        <div class="event-dow">${dow}</div>
      </div>
      <div class="event-info">
        <div class="event-title">${escHtml(ev.title)}${recurringBadge}</div>
        <div class="event-time">${escHtml(timeStr)}${escHtml(endTimeStr)}</div>
        ${locationStr}
      </div>
    </div>
  `;
}

function renderCalGrid(events) {
  const year = state.calYear;
  const month = state.calMonth - 1; // 0-indexed
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Map events to day numbers
  const dayEvents = {};
  for (const ev of events) {
    if (!ev.start) continue;
    const d = new Date(ev.start);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!dayEvents[day]) dayEvents[day] = [];
      dayEvents[day].push(ev);
    }
  }

  const cells = [];
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) cells.push(`<div class="cal-day other-month"></div>`);

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
    const dayEvs = dayEvents[day] || [];
    const chips = dayEvs.slice(0, 3).map(ev => `<div class="cal-event-chip" title="${escHtml(ev.title)}">${escHtml(ev.title)}</div>`).join('');
    const more = dayEvs.length > 3 ? `<div style="font-size:11px;color:#5f6368;">+${dayEvs.length - 3} more</div>` : '';
    cells.push(`
      <div class="cal-day ${isToday ? 'today' : ''}">
        <div class="cal-day-num">${day}</div>
        ${chips}${more}
      </div>
    `);
  }

  el('calendar-content').innerHTML = `
    <div class="cal-grid">
      ${DAYS.map(d => `<div class="cal-grid-header">${d}</div>`).join('')}
      ${cells.join('')}
    </div>
  `;
}

// Toolbar nav
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

// Sidebar view toggles
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
