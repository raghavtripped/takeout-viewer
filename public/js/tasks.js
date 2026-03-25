'use strict';

function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatTaskDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d < now && d.toDateString() !== now.toDateString();
}

// ── Sidebar filter buttons ─────────────────────────────────────────────────────
el('tasks-all-btn').addEventListener('click', () => {
  state.tasksFilter = 'all';
  updateTasksSidebarActive();
  loadTasks();
});
el('tasks-pending-btn').addEventListener('click', () => {
  state.tasksFilter = 'pending';
  updateTasksSidebarActive();
  loadTasks();
});
el('tasks-done-btn').addEventListener('click', () => {
  state.tasksFilter = 'completed';
  updateTasksSidebarActive();
  loadTasks();
});

function updateTasksSidebarActive() {
  el('tasks-all-btn').classList.toggle('active', state.tasksFilter === 'all');
  el('tasks-pending-btn').classList.toggle('active', state.tasksFilter === 'pending');
  el('tasks-done-btn').classList.toggle('active', state.tasksFilter === 'completed');
}

async function loadTasks() {
  const params = new URLSearchParams();
  if (state.searchQuery) params.set('q', state.searchQuery);
  if (state.tasksFilter !== 'all') params.set('status', state.tasksFilter);
  let data;
  try {
    data = await api(`/api/tasks?${params}`);
  } catch (e) {
    el('tasks-columns').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }
  const pending   = data.pending   || [];
  const completed = data.completed || [];
  const total = pending.length + completed.length;
  el('tasks-count-label').textContent = `${data.total !== undefined ? data.total.toLocaleString() : total} task${(data.total !== undefined ? data.total : total) !== 1 ? 's' : ''}`;

  const showPending  = state.tasksFilter !== 'completed';
  const showDone     = state.tasksFilter !== 'pending';

  el('tasks-columns').innerHTML = `
    <div class="tasks-col${!showPending ? ' hidden' : ''}">
      <div class="tasks-col-header">\u23F3 Pending <span class="tasks-col-count">${pending.length}</span></div>
      <div id="tasks-pending-list">${pending.map(renderTask).join('') || '<div class="task-empty">No pending tasks</div>'}</div>
    </div>
    <div class="tasks-col${!showDone ? ' hidden' : ''}">
      <div class="tasks-col-header">\u2705 Completed <span class="tasks-col-count">${completed.length}</span></div>
      <div id="tasks-completed-list">${completed.map(renderTask).join('') || '<div class="task-empty">No completed tasks</div>'}</div>
    </div>`;
}

function renderTask(task) {
  const isDone   = task.status === 'completed';
  const overdue  = !isDone && isOverdue(task.due);
  const dueStr   = formatTaskDate(task.due);
  const doneStr  = formatTaskDate(task.completed);

  return `<div class="task-item${isDone ? ' task-done' : ''}${overdue ? ' task-overdue' : ''}">
    <div class="task-check-icon">${isDone ? '\u2705' : '\u2B1C'}</div>
    <div class="task-content">
      <div class="task-title">${escHtml(task.title || '(no title)')}</div>
      ${task.description ? `<div class="task-desc">${escHtml(task.description.slice(0, 150))}${task.description.length > 150 ? '\u2026' : ''}</div>` : ''}
      <div class="task-meta">
        ${dueStr  ? `<span class="task-due${overdue ? ' task-due-overdue' : ''}">\uD83D\uDCC5 Due ${escHtml(dueStr)}</span>` : ''}
        ${doneStr ? `<span class="task-completed-date">\u2713 Completed ${escHtml(doneStr)}</span>` : ''}
      </div>
    </div>
  </div>`;
}

window.loadTasks = loadTasks;
