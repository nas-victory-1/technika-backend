import express from 'express';
import {
  getTechnicians,
  updateLocation,
  getProfile,
  updateProfile,
  changePassword,
  toggleTwoStep,
  toggleOnlineStatus,
  getConnectedDevices,
  removeDevice,
  deleteAccount,
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Admin: list all technicians with their locations
router.get('/technicians', protect, authorize('admin'), getTechnicians);

// Technician: update own location
router.put('/location', protect, authorize('technician'), updateLocation);

// Profile (any authenticated user)
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);

// Security & account settings
router.put('/password', protect, changePassword);
router.put('/two-step', protect, toggleTwoStep);
router.put('/online-status', protect, toggleOnlineStatus);

// Connected devices
router.get('/devices', protect, getConnectedDevices);
router.delete('/devices/:token', protect, removeDevice);

// Delete account
router.delete('/account', protect, deleteAccount);

export default router;
