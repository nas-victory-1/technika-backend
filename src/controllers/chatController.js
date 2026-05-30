import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';

// @desc    Get all chats for the logged-in user
// @route   GET /api/chats
// @access  Private
const getChats = asyncHandler(async (req, res) => {
  const chats = await Chat.find({ participants: req.user._id })
    .populate('participants', 'firstName lastName profilePicture')
    .populate('lastMessage')
    .sort({ updatedAt: -1 });

  res.json(chats);
});

// @desc    Create a new chat with another user, or return the existing one
// @route   POST /api/chats
// @access  Private
const createOrGetChat = asyncHandler(async (req, res) => {
  const { participantId } = req.body;

  if (!participantId) {
    return res.status(400).json({ message: 'participantId is required' });
  }

  if (participantId === req.user._id.toString()) {
    return res.status(400).json({ message: 'Cannot start a chat with yourself' });
  }

  const otherUser = await User.findById(participantId);
  if (!otherUser) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Look for an existing 1-to-1 chat containing exactly these two participants
  let chat = await Chat.findOne({
    participants: { $all: [req.user._id, participantId], $size: 2 },
  });

  if (!chat) {
    chat = await Chat.create({
      participants: [req.user._id, participantId],
    });
  }

  await chat.populate('participants', 'firstName lastName profilePicture');
  await chat.populate('lastMessage');

  res.status(201).json(chat);
});

// @desc    Get all messages in a chat (participants only)
// @route   GET /api/chats/:chatId/messages
// @access  Private
const getMessages = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  const isParticipant = chat.participants.some(
    (p) => p.toString() === req.user._id.toString()
  );
  if (!isParticipant) {
    return res
      .status(403)
      .json({ message: 'Not authorized to view this chat' });
  }

  const messages = await Message.find({ chatId: chat._id })
    .populate('sender', 'firstName lastName profilePicture')
    .sort({ createdAt: 1 });

  res.json(messages);
});

// @desc    Send a message in a chat (participants only)
// @route   POST /api/chats/:chatId/messages
// @access  Private
const sendMessage = asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ message: 'content is required' });
  }

  const chat = await Chat.findById(req.params.chatId);
  if (!chat) {
    return res.status(404).json({ message: 'Chat not found' });
  }

  const isParticipant = chat.participants.some(
    (p) => p.toString() === req.user._id.toString()
  );
  if (!isParticipant) {
    return res
      .status(403)
      .json({ message: 'Not authorized to post in this chat' });
  }

  const message = await Message.create({
    chatId: chat._id,
    sender: req.user._id,
    content: content.trim(),
  });

  // Keep the chat's preview/ordering fields in sync
  chat.lastMessage = message._id;
  chat.updatedAt = new Date();
  await chat.save();

  await message.populate('sender', 'firstName lastName profilePicture');

  res.status(201).json(message);
});

export { getChats, createOrGetChat, getMessages, sendMessage };
