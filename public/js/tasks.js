'use strict';

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Sidebar filter buttons
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
    el('tasks-pending-list').innerHTML = `<div class="empty-state"><span>Error: ${e.message}</span></div>`;
    return;
  }

  el('tasks-count-label').textContent = `${data.total.toLocaleString()} task${data.total !== 1 ? 's' : ''}`;

  // Show/hide columns based on filter
  const showPending = state.tasksFilter !== 'completed';
  const showCompleted = state.tasksFilter !== 'pending';
  const colEls = document.querySelectorAll('.tasks-col');
  if (colEls[0]) colEls[0].style.display = showPending ? '' : 'none';
  if (colEls[1]) colEls[1].style.display = showCompleted ? '' : 'none';

  renderTaskList('tasks-pending-list', data.pending || [], false);
  renderTaskList('tasks-completed-list', data.completed || [], true);
}

function renderTaskList(containerId, tasks, isCompleted) {
  const container = el(containerId);
  if (tasks.length === 0) {
    container.innerHTML = `<div class="task-empty">No ${isCompleted ? 'completed' : 'pending'} tasks</div>`;
    return;
  }

  container.innerHTML = tasks.map(task => {
    const dueStr = task.due ? formatDate(task.due, true) : '';
    const doneStr = task.completed ? formatDate(task.completed, true) : '';
    const isOverdue = !isCompleted && task.dueTimestamp && task.dueTimestamp < Date.now();

    return `
      <div class="task-item ${isCompleted ? 'task-done' : ''}">
        <div class="task-check">${isCompleted ? '✅' : '⬜'}</div>
        <div class="task-body">
          <div class="task-title">${escHtml(task.title)}</div>
          ${task.description ? `<div class="task-desc">${escHtml(task.description.slice(0, 120))}${task.description.length > 120 ? '…' : ''}</div>` : ''}
          <div class="task-meta">
            ${dueStr ? `<span class="task-due ${isOverdue ? 'overdue' : ''}">📅 ${escHtml(dueStr)}</span>` : ''}
            ${doneStr ? `<span class="task-completed-date">✓ ${escHtml(doneStr)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.loadTasks = loadTasks;
