const express = require('express');
const router = express.Router();
const {
  createTask,
  getTasks,
  getTaskById,
  assignTask,
  updateTaskStatus,
  deleteTask,
} = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Create task (admin only)
router.post('/', protect, authorize('admin'), createTask);

// Get all tasks (admin sees all, technician sees own)
router.get('/', protect, getTasks);

// Get task by ID
router.get('/:id', protect, getTaskById);

// Assign task to technician (admin only)
router.put('/:id/assign', protect, authorize('admin'), assignTask);

// Update task status (technician or admin)
router.put('/:id/status', protect, updateTaskStatus);

// Delete task (admin only)
router.delete('/:id', protect, authorize('admin'), deleteTask);

module.exports = router;
