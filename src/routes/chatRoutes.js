import express from 'express';
import {
  getChats,
  createOrGetChat,
  getMessages,
  sendMessage,
} from '../controllers/chatController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Chats for the logged-in user
router.get('/', protect, getChats);
router.post('/', protect, createOrGetChat);

// Messages within a chat (participants only — enforced in the controller)
router.get('/:chatId/messages', protect, getMessages);
router.post('/:chatId/messages', protect, sendMessage);

export default router;
