import express from 'express';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../controllers/customerController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

// All customer routes are admin only
router.get('/', protect, authorize('admin'), getCustomers);
router.post('/', protect, authorize('admin'), createCustomer);
router.get('/:id', protect, authorize('admin'), getCustomerById);
router.put('/:id', protect, authorize('admin'), updateCustomer);
router.delete('/:id', protect, authorize('admin'), deleteCustomer);

export default router;
