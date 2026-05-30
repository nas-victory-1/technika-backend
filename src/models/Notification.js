import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    // Recipient of the notification
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      enum: ['task_assigned', 'task_updated', 'general'],
      default: 'general',
    },
    relatedTask: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Notification', notificationSchema);
