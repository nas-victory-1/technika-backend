import express from 'express';
import {
  createTask,
  getTasks,
  getTaskStats,
  getMonthlyStats,
  getCurrentTask,
  getTaskById,
  assignTask,
  updateTaskStatus,
  addCompletionNote,
  deleteTask,
} from '../controllers/taskController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Create task (admin only)
router.post('/', protect, authorize('admin'), createTask);

// Get all tasks (admin sees all, technician sees own)
router.get('/', protect, getTasks);

// Stats & current task — MUST come before "/:id" so they aren't captured as an id
router.get('/stats/monthly', protect, getMonthlyStats);
router.get('/stats', protect, getTaskStats);
router.get('/current', protect, getCurrentTask);

// Get task by ID
router.get('/:id', protect, getTaskById);

// Assign task to technician (admin only)
router.put('/:id/assign', protect, authorize('admin'), assignTask);

// Update task status (technician or admin)
router.put('/:id/status', protect, updateTaskStatus);

// Add a completion note (technician or admin)
router.put('/:id/note', protect, addCompletionNote);

// Delete task (admin only)
router.delete('/:id', protect, authorize('admin'), deleteTask);

export default router;
