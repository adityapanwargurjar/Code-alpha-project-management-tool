const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- SIMULATED MIDDLEWARE FOR AUTH SYSTEM ---
// Expects an 'x-user-id' header representing the authenticated user
app.use((req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId && req.path.startsWith('/api/')) {
    // Exclude basic seed/user fetches from strict blocking if necessary
    if (req.path === '/api/users') return next();
    return res.status(401).json({ error: 'Authentication Required. Provide x-user-id header.' });
  }
  req.authenticatedUserId = parseInt(userId);
  next();
});

// Get users list
app.get('/api/users', async (req, res) => {
  const users = await db('users').select('*');
  res.json(users);
});

// --- PROJECTS ARCHITECTURE ---
// Create a collaborative group project
app.post('/api/projects', async (req, res) => {
  const { name, memberIds } = req.body; // Array of user IDs assigned to this project
  try {
    const [projectId] = await db('projects').insert({ name });
    
    // Auto-include the creator as a member if not specified
    const uniqueMembers = new Set(memberIds || []);
    uniqueMembers.add(req.authenticatedUserId);

    const membersPayload = Array.from(uniqueMembers).map(uid => ({
      project_id: projectId,
      user_id: uid
    }));
    
    await db('project_members').insert(membersPayload);
    res.status(201).json({ id: projectId, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all collaborative projects the logged-in user belongs to
app.get('/api/projects', async (req, res) => {
  try {
    const userProjects = await db('projects')
      .join('project_members', 'projects.id', '=', 'project_members.project_id')
      .where('project_members.user_id', req.authenticatedUserId)
      .select('projects.*');
    res.json(userProjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch detailed members of a specific project
app.get('/api/projects/:id/members', async (req, res) => {
  const members = await db('project_members')
    .join('users', 'project_members.user_id', '=', 'users.id')
    .where('project_members.project_id', req.params.id)
    .select('users.id', 'users.username');
  res.json(members);
});

// --- TASKS CORE ---
// Create and assign a task within a project
app.post('/api/projects/:id/tasks', async (req, res) => {
  const { title, assigned_to } = req.body;
  const project_id = req.params.id;
  try {
    const [taskId] = await db('tasks').insert({
      project_id,
      title,
      status: 'Todo',
      assigned_to: assigned_to || null
    });

    // Real-time Update Broadcasting
    io.emit('project_updated', { projectId: project_id, message: `New task "${title}" added.` });
    res.status(201).json({ id: taskId, title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all task boards/cards for a project
app.get('/api/projects/:id/tasks', async (req, res) => {
  try {
    const tasks = await db('tasks')
      .leftJoin('users', 'tasks.assigned_to', '=', 'users.id')
      .where({ project_id: req.params.id })
      .select('tasks.*', 'users.username as assignee');
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update task assignment or board column status (Drag & Drop emulation)
app.patch('/api/tasks/:id', async (req, res) => {
  const { status, assigned_to } = req.body;
  try {
    const originalTask = await db('tasks').where({ id: req.params.id }).first();
    if (!originalTask) return res.status(404).json({ error: 'Task not found' });

    await db('tasks').where({ id: req.params.id }).update({ status, assigned_to });
    
    io.emit('project_updated', { 
      projectId: originalTask.project_id, 
      message: `Task updated status to ${status}` 
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TASK COMMUNICATION (COMMENTS) ---
app.post('/api/tasks/:id/comments', async (req, res) => {
  const { content } = req.body;
  try {
    await db('comments').insert({
      task_id: req.params.id,
      user_id: req.authenticatedUserId,
      content
    });

    const task = await db('tasks').where({ id: req.params.id }).first();
    io.emit('project_updated', { projectId: task.project_id, message: `New feedback left on task #${req.params.id}` });
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/:id/comments', async (req, res) => {
  const comments = await db('comments')
    .join('users', 'comments.user_id', '=', 'users.id')
    .where({ task_id: req.params.id })
    .select('comments.*', 'users.username')
    .orderBy('created_at', 'asc');
  res.json(comments);
});

// --- WEBSOCKET REAL-TIME CONNECTION ---
io.on('connection', (socket) => {
  console.log(`User connected via WebSocket: ${socket.id}`);
  socket.on('disconnect', () => console.log('User disconnected'));
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Collaboration portal active at http://localhost:${PORT}`));
