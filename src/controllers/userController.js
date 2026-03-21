const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Get all technicians (with their current locations)
// @route   GET /api/users/technicians
// @access  Private/Admin
const getTechnicians = asyncHandler(async (req, res) => {
  const technicians = await User.find({ role: 'technician' }).select(
    'name email location createdAt'
  );
  res.json(technicians);
});

// @desc    Update technician location
// @route   PUT /api/users/location
// @access  Private/Technician
const updateLocation = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res
      .status(400)
      .json({ message: 'latitude and longitude are required' });
  }

  if (latitude < -90 || latitude > 90) {
    return res.status(400).json({ message: 'latitude must be between -90 and 90' });
  }

  if (longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: 'longitude must be between -180 and 180' });
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { location: { latitude, longitude, updatedAt: new Date() } },
    { new: true }
  ).select('name email location');

  res.json(user);
});

module.exports = { getTechnicians, updateLocation };
