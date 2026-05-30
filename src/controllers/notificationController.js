import Notification from '../models/Notification.js';
import asyncHandler from '../middleware/asyncHandler.js';

// @desc    Create a notification (helper used by other controllers, not a route handler)
// @access  Internal
// Returns the created Notification document. Kept tolerant: a failure here should
// never break the parent action (e.g. assigning a task), so callers may ignore errors.
const createNotification = async ({
  userId,
  title,
  message,
  type = 'general',
  relatedTask = null,
}) => {
  return Notification.create({ userId, title, message, type, relatedTask });
};

// @desc    Get all notifications for the logged-in user (newest first)
// @route   GET /api/notifications
// @access  Private
const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id })
    .populate('relatedTask', 'title status')
    .sort({ createdAt: -1 });

  res.json(notifications);
});

// @desc    Get only unread notifications for the logged-in user
// @route   GET /api/notifications/unread
// @access  Private
const getUnreadNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({
    userId: req.user._id,
    isRead: false,
  })
    .populate('relatedTask', 'title status')
    .sort({ createdAt: -1 });

  res.json(notifications);
});

// @desc    Mark a single notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!notification) {
    return res.status(404).json({ message: 'Notification not found' });
  }

  notification.isRead = true;
  await notification.save();

  res.json(notification);
});

// @desc    Mark all of the logged-in user's notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { isRead: true }
  );

  res.json({
    message: 'All notifications marked as read',
    modifiedCount: result.modifiedCount,
  });
});

export {
  createNotification,
  getNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
};
