import mongoose from 'mongoose';

const taskLocationSchema = new mongoose.Schema(
  {
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String, trim: true },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'available', 'completed'],
      default: 'available',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    location: {
      type: taskLocationSchema,
      default: null,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    // Technician's note left when completing the task
    completionNote: {
      type: String,
      trim: true,
      default: '',
    },
    // Lifecycle timestamps used for average-completion-time calculations
    acknowledgedAt: { type: Date }, // set when technician accepts the task (status -> pending)
    startedAt: { type: Date },
    completedAt: { type: Date }, // set when task is completed (status -> completed)
  },
  { timestamps: true }
);

export default mongoose.model('Task', taskSchema);
