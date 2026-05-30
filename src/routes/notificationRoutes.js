import express from 'express';
import {
  getNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All notification routes are for the logged-in user
router.get('/', protect, getNotifications);
router.get('/unread', protect, getUnreadNotifications);

// read-all must be declared before "/:id/read" patterns to avoid ambiguity
router.put('/read-all', protect, markAllAsRead);
router.put('/:id/read', protect, markAsRead);

export default router;
