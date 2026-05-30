import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema(
  {
    // The two (or more) users taking part in the conversation
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Chat', chatSchema);
