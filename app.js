const socket = io();
let currentUserId = null;
let activeProjectId = null;
let openTaskId = null;
let cachedUsersList = [];

// WebSocket Listener for Real-Time Synchronization & Global Notifications
socket.on('project_updated', (data) => {
  // Trigger a subtle banner notification alert dynamically
  showToastNotification(data.message);
  
  // If the active user is currently viewing the updated project board, refresh data automatically
  if (parseInt(data.projectId) === parseInt(activeProjectId)) {
    loadProjectBoard(activeProjectId, document.getElementById('active-project-title').dataset.name);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  await loadGlobalUsers();
  onUserSessionChange();
});

// Configure Headers for the Simulated Authentication System
function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-user-id': currentUserId
  };
}

async function loadGlobalUsers() {
  const res = await fetch('/api/users');
  cachedUsersList = await res.json();
  
  const authSelect = document.getElementById('auth-user');
  const checkboxContainer = document.getElementById('members-checkboxes');
  
  authSelect.innerHTML = '';
  checkboxContainer.innerHTML = '';

  cachedUsersList.forEach(user => {
    // Fill top-bar simulation dropdown menu
    authSelect.innerHTML += `<option value="${user.id}">${user.username}</option>`;
    // Fill checklist component within workspace creation module
    checkboxContainer.innerHTML += `
      <label style="display:block; font-size:0.85rem;">
        <input type="checkbox" class="member-invite-check" value="${user.id}"> ${user.username}
      </label>
    `;
  });
  currentUserId = authSelect.value;
}

function onUserSessionChange() {
  currentUserId = document.getElementById('auth-user').value;
  loadProjectsSidebar();
  resetBoardView();
}

async function loadProjectsSidebar() {
  const res = await fetch('/api/projects', { headers: getAuthHeaders() });
  const projects = await res.json();
  const list = document.getElementById('project-list');
  list.innerHTML = '';

  projects.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name;
    li.onclick = () => {
      document.querySelectorAll('#project-list li').forEach(el => el.classList.remove('active'));
      li.classList.add('active');
      loadProjectBoard(p.id, p.name);
    };
    list.appendChild(li);
  });
}

function resetBoardView() {
  activeProjectId = null;
  document.getElementById('active-project-title').innerText = "Select a Project from the Sidebar";
  document.getElementById('task-creator-bar').classList.add('hidden');
  document.getElementById('col-Todo').innerHTML = '';
  document.getElementById('col-InProgress').innerHTML = '';
  document.getElementById('col-Done').innerHTML = '';
}

async function loadProjectBoard(projectId, projectName) {
  activeProjectId = projectId;
  const headerTitle = document.getElementById('active-project-title');
  headerTitle.innerText = projectName;
  headerTitle.dataset.name = projectName;
  
  document.getElementById('task-creator-bar').classList.remove('hidden');

  // Load contextual task assignees specific to project members
  const membersRes = await fetch(`/api/projects/${projectId}/members', { headers: getAuthHeaders() });
  const members = await membersRes.json();
  const taskAssigneeSelect = document.getElementById('new-task-assignee');
  taskAssigneeSelect.innerHTML = '<option value="">Assign To...</option>';
  members.forEach(m => {
    taskAssigneeSelect.innerHTML += `<option value="${m.id}">${m.username}</option>`;
  });

  // Fetch and display tasks arranged by column status
  const tasksRes = await fetch(`/api/projects/${projectId}/tasks', { headers: getAuthHeaders() });
  const tasks = await tasksRes.json();

  const cols = { Todo: '', InProgress: '', Done: '' };
  tasks.forEach(t => {
    cols[t.status] += `
      <div class="task-card">
        <h4>${t.title}</h4>
        <span class="task-badge">👤 ${t.assignee || 'Unassigned'}</span>
        <div class="task-actions">
          <select onchange="moveTaskStatus(${t.id}, this.value)">
            <option value="Todo" ${t.status === 'Todo' ? 'selected' : ''}>Todo</option>
            <option value="InProgress" ${t.status === 'InProgress' ? 'selected' : ''}>In Progress</option>
            <option value="Done" ${t.status === 'Done' ? 'selected' : ''}>Done</option>
          </select>
          <button onclick="openCommentsModal(${t.id}, '${t.title.replace(/'/g, "\\'")}')">💬 Feedback</button>
        </div>
      </div>
    `;
  });

  document.getElementById('col-Todo').innerHTML = cols.Todo;
  document.getElementById('col-InProgress').innerHTML = cols.InProgress;
  document.getElementById('col-Done').innerHTML = cols.Done;
}

async function createNewProject() {
  const nameInput = document.getElementById('new-project-name');
  const name = nameInput.value.trim();
  if (!name) return;

  const checkboxes = document.querySelectorAll('.member-invite-check:checked');
  const memberIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

  await fetch('/api/projects', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, memberIds })
  });

  nameInput.value = '';
  document.querySelectorAll('.member-invite-check').forEach(cb => cb.checked = false);
  loadProjectsSidebar();
}

async function addTask() {
  const titleInput = document.getElementById('new-task-title');
  const assigneeInput = document.getElementById('new-task-assignee');
  const title = titleInput.value.trim();
  if (!title) return;

  await fetch(`/api/projects/${activeProjectId}/tasks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ title, assigned_to: assigneeInput.value || null })
  });

  titleInput.value = '';
  assigneeInput.value = '';
}

async function moveTaskStatus(taskId, newStatus) {
  await fetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status: newStatus })
  });
}

// --- COMMENTS ENGINE WINDOW MODAL LOGIC ---
async function openCommentsModal(taskId, taskTitle) {
  openTaskId = taskId;
  document.getElementById('modal-task-title').innerText = `Discussion on: "${taskTitle}"`;
  document.getElementById('comment-modal').classList.remove('hidden');
  
  const res = await fetch(`/api/tasks/${taskId}/comments`, { headers: getAuthHeaders() });
  const comments = await res.json();
  const box = document.getElementById('comments-box');
  box.innerHTML = comments.length ? '' : '<p style="color:#6b778c; font-size:0.85rem;">No updates logged yet.</p>';
  
  comments.forEach(c => {
    box.innerHTML += `<div class="comment-node"><strong>@${c.username}:</strong> ${c.content}</div>`;
  });
}

function closeComments() {
  document.getElementById('comment-modal').classList.add('hidden');
  openTaskId = null;
}

async function submitComment() {
  const input = document.getElementById('new-comment-input');
  const content = input.value.trim();
  if (!content || !openTaskId) return;

  await fetch(`/api/tasks/${openTaskId}/comments`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ content })
  });

  const activeTitleNodeText = document.getElementById('modal-task-title').innerText.replace('Discussion on: "', '').slice(0, -1);
  input.value = '';
  openCommentsModal(openTaskId, activeTitleNodeText);
}

// WebSocket UI Banner System Alert
function showToastNotification(msg) {
  const toast = document.getElementById('notification-toast');
  toast.innerText = msg;
  toast.classList.remove('hidden');
  setTimeout(() => { toast.classList.add('hidden'); }, 4000);
}
