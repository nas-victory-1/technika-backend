const express = require('express');
const router = express.Router();
const { getTechnicians, updateLocation } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Admin: list all technicians with their locations
router.get('/technicians', protect, authorize('admin'), getTechnicians);

// Technician: update own location
router.put('/location', protect, authorize('technician'), updateLocation);

module.exports = router;
