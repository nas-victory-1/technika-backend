import express from 'express';
import {
  register,
  login,
  getMe,
  forgotPassword,
  registerDeviceToken,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.get('/me', protect, getMe);
router.post('/device-token', protect, registerDeviceToken);

export default router;
