const Task = require('../models/Task');
const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private/Admin
const createTask = asyncHandler(async (req, res) => {
  const { title, description, assignedTo } = req.body;

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
  });

  await task.populate('assignedTo', 'name email');
  await task.populate('createdBy', 'name email');

  res.status(201).json(task);
});

// @desc    Get all tasks (admin sees all; technician sees only theirs)
// @route   GET /api/tasks
// @access  Private
const getTasks = asyncHandler(async (req, res) => {
  const filter =
    req.user.role === 'admin' ? {} : { assignedTo: req.user._id };

  const tasks = await Task.find(filter)
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  res.json(tasks);
});

// @desc    Get a single task by ID
// @route   GET /api/tasks/:id
// @access  Private
const getTaskById = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id)
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name email');

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
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name email');

  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  res.json(task);
});

// @desc    Update task status
// @route   PUT /api/tasks/:id/status
// @access  Private (technician updates their own; admin can update any)
const updateTaskStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ['pending', 'in_progress', 'completed'];

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

  task.status = status;
  await task.save();

  await task.populate('assignedTo', 'name email');
  await task.populate('createdBy', 'name email');

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

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  assignTask,
  updateTaskStatus,
  deleteTask,
};
