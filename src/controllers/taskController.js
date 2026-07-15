import Task from '../models/Task.js';
import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { createNotification } from './notificationController.js';

// Fields populated for user references on tasks (never expose `name` — model uses firstName/lastName)
const USER_FIELDS = 'firstName lastName email';

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private/Admin
const createTask = asyncHandler(async (req, res) => {
  const { title, description, assignedTo, location, priority } = req.body;

  if (!title) {
    return res.status(400).json({ message: 'title is required' });
  }

  if (assignedTo) {
    const technician = await User.findOne({ _id: assignedTo, role: 'technician' });
    if (!technician) {
      return res.status(404).json({ message: 'Technician not found' });
    }
  }

  const task = await Task.create({
    title,
    description,
    assignedTo: assignedTo || null,
    createdBy: req.user._id,
    location: location || null,
    priority: priority || 'medium',
  });

  // Notify the technician if the task was assigned at creation time
  if (task.assignedTo) {
    await createNotification({
      userId: task.assignedTo,
      title: 'New task assigned',
      message: `You have been assigned the task "${task.title}".`,
      type: 'task_assigned',
      relatedTask: task._id,
    });
  }

  await task.populate('assignedTo', USER_FIELDS);
  await task.populate('createdBy', USER_FIELDS);

  res.status(201).json(task);
});

// @desc    Get all tasks (admin sees all; technician sees only theirs)
// @route   GET /api/tasks
// @access  Private
const getTasks = asyncHandler(async (req, res) => {
  const filter =
    req.user.role === 'admin' ? {} : { assignedTo: req.user._id };

  const tasks = await Task.find(filter)
    .populate('assignedTo', USER_FIELDS)
    .populate('createdBy', USER_FIELDS)
    .sort({ createdAt: -1 });

  res.json(tasks);
});

// @desc    Get task statistics for the requesting user (counts + avg completion time)
// @route   GET /api/tasks/stats
// @access  Private
const getTaskStats = asyncHandler(async (req, res) => {
  // Admins see stats across all tasks; technicians see only their own
  const scope = req.user.role === 'admin' ? {} : { assignedTo: req.user._id };

  const [available, completed, pending] = await Promise.all([
    Task.countDocuments({ ...scope, status: 'available' }),
    Task.countDocuments({ ...scope, status: 'completed' }),
    Task.countDocuments({ ...scope, status: 'pending' }),
  ]);

  // Average completion time (minutes) from acknowledgedAt -> completedAt
  const completedTasks = await Task.find({
    ...scope,
    status: 'completed',
    acknowledgedAt: { $ne: null },
    completedAt: { $ne: null },
  }).select('acknowledgedAt completedAt');

  let averageCompletionMinutes = 0;
  if (completedTasks.length > 0) {
    const totalMs = completedTasks.reduce(
      (sum, t) => sum + (t.completedAt - t.acknowledgedAt),
      0
    );
    averageCompletionMinutes = Math.round(
      totalMs / completedTasks.length / 60000
    );
  }

  res.json({
    available,
    completed,
    pending,
    averageCompletionMinutes,
  });
});

// @desc    Get task completion counts grouped by month for the last 6 months
// @route   GET /api/tasks/stats/monthly
// @access  Private
const getMonthlyStats = asyncHandler(async (req, res) => {
  const scope = req.user.role === 'admin' ? {} : { assignedTo: req.user._id };

  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const now = new Date();
  // Start of the month 5 months ago (gives us a 6-month window incl. current month)
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const completed = await Task.find({
    ...scope,
    status: 'completed',
    completedAt: { $gte: start },
  }).select('completedAt');

  // Pre-seed the 6 month buckets in order so months with 0 completions still appear
  const buckets = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      month: MONTHS[d.getMonth()],
      completed: 0,
    });
  }

  const indexByKey = new Map(buckets.map((b, i) => [b.key, i]));
  completed.forEach((t) => {
    const d = new Date(t.completedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (indexByKey.has(key)) {
      buckets[indexByKey.get(key)].completed += 1;
    }
  });

  res.json(buckets.map(({ month, completed }) => ({ month, completed })));
});

// @desc    Get the technician's current (in-progress) task — status "pending"
// @route   GET /api/tasks/current
// @access  Private
const getCurrentTask = asyncHandler(async (req, res) => {
  const task = await Task.findOne({
    assignedTo: req.user._id,
    status: 'pending',
  })
    .populate('assignedTo', USER_FIELDS)
    .populate('createdBy', USER_FIELDS)
    .sort({ acknowledgedAt: -1 });

  // No active task is a valid state for the home screen, not an error
  res.json(task || null);
});

// @desc    Get a single task by ID
// @route   GET /api/tasks/:id
// @access  Private
const getTaskById = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id)
    .populate('assignedTo', USER_FIELDS)
    .populate('createdBy', USER_FIELDS);

  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  // Technicians can only view their own tasks
  if (
    req.user.role === 'technician' &&
    (!task.assignedTo || task.assignedTo._id.toString() !== req.user._id.toString())
  ) {
    return res.status(403).json({ message: 'Not authorized to view this task' });
  }

  res.json(task);
});

// @desc    Assign a task to a technician (admin only)
// @route   PUT /api/tasks/:id/assign
// @access  Private/Admin
const assignTask = asyncHandler(async (req, res) => {
  const { assignedTo } = req.body;

  if (!assignedTo) {
    return res.status(400).json({ message: 'assignedTo is required' });
  }

  const technician = await User.findOne({ _id: assignedTo, role: 'technician' });
  if (!technician) {
    return res.status(404).json({ message: 'Technician not found' });
  }

  const task = await Task.findByIdAndUpdate(
    req.params.id,
    { assignedTo },
    { new: true }
  )
    .populate('assignedTo', USER_FIELDS)
    .populate('createdBy', USER_FIELDS);

  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  // Notify the technician that they've been assigned this task
  await createNotification({
    userId: assignedTo,
    title: 'New task assigned',
    message: `You have been assigned the task "${task.title}".`,
    type: 'task_assigned',
    relatedTask: task._id,
  });

  res.json(task);
});

// @desc    Update task status
// @route   PUT /api/tasks/:id/status
// @access  Private (technician updates their own; admin can update any)
const updateTaskStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ['pending', 'available', 'completed'];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      message: `Status must be one of: ${allowedStatuses.join(', ')}`,
    });
  }

  const task = await Task.findById(req.params.id);
  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  // Technicians can only update their own tasks
  if (
    req.user.role === 'technician' &&
    (!task.assignedTo || task.assignedTo.toString() !== req.user._id.toString())
  ) {
    return res.status(403).json({ message: 'Not authorized to update this task' });
  }

  // Stamp lifecycle timestamps as the task progresses.
  // pending == technician has accepted/acknowledged the task (it's now in progress).
  if (status === 'pending' && !task.acknowledgedAt) {
    task.acknowledgedAt = new Date();
  }
  if (status === 'completed' && !task.completedAt) {
    task.completedAt = new Date();
  }

  task.status = status;
  await task.save();

  await task.populate('assignedTo', USER_FIELDS);
  await task.populate('createdBy', USER_FIELDS);

  res.json(task);
});

// @desc    Add/update the completion note on a task (technician's own task)
// @route   PUT /api/tasks/:id/note
// @access  Private
const addCompletionNote = asyncHandler(async (req, res) => {
  const { completionNote } = req.body;

  if (!completionNote || !completionNote.trim()) {
    return res.status(400).json({ message: 'completionNote is required' });
  }

  const task = await Task.findById(req.params.id);
  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  // Technicians can only annotate their own tasks
  if (
    req.user.role === 'technician' &&
    (!task.assignedTo || task.assignedTo.toString() !== req.user._id.toString())
  ) {
    return res.status(403).json({ message: 'Not authorized to update this task' });
  }

  task.completionNote = completionNote.trim();
  await task.save();

  await task.populate('assignedTo', USER_FIELDS);
  await task.populate('createdBy', USER_FIELDS);

  res.json(task);
});

// @desc    Update a task's core details (admin only)
// @route   PUT /api/tasks/:id
// @access  Private/Admin
const updateTask = asyncHandler(async (req, res) => {
  const { title, description, priority, location } = req.body;

  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (priority !== undefined) updates.priority = priority;
  if (location !== undefined) updates.location = location;

  const task = await Task.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  })
    .populate('assignedTo', USER_FIELDS)
    .populate('createdBy', USER_FIELDS);

  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  res.json(task);
});

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private/Admin
const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }
  res.json({ message: 'Task removed' });
});

export {
  createTask,
  getTasks,
  getTaskStats,
  getMonthlyStats,
  getCurrentTask,
  getTaskById,
  assignTask,
  updateTaskStatus,
  addCompletionNote,
  updateTask,
  deleteTask,
};
