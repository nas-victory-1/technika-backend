import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';

// @desc    Get all technicians (with their current locations)
// @route   GET /api/users/technicians
// @access  Private/Admin
const getTechnicians = asyncHandler(async (req, res) => {
  const technicians = await User.find({ role: 'technician' }).select(
    'firstName lastName email location isOnline createdAt'
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
  ).select('firstName lastName email location');

  res.json(user);
});

// @desc    Get the logged-in user's full profile
// @route   GET /api/users/profile
// @access  Private
const getProfile = asyncHandler(async (req, res) => {
  // req.user is already loaded without the password by the protect middleware
  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json(user);
});

// @desc    Update the logged-in user's profile
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, birthDate, phoneNumber, profilePicture } =
    req.body;

  const updates = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (birthDate !== undefined) updates.birthDate = birthDate;
  if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
  if (profilePicture !== undefined) updates.profilePicture = profilePicture;

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  res.json(user);
});

// @desc    Change the logged-in user's password
// @route   PUT /api/users/password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ message: 'currentPassword and newPassword are required' });
  }

  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ message: 'New password must be at least 6 characters' });
  }

  // Password is select:false, so explicitly include it
  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.comparePassword(currentPassword))) {
    return res.status(401).json({ message: 'Current password is incorrect' });
  }

  // Assigning triggers the pre-save hash hook
  user.password = newPassword;
  await user.save();

  res.json({ message: 'Password updated successfully' });
});

// @desc    Toggle two-step verification on/off
// @route   PUT /api/users/two-step
// @access  Private
const toggleTwoStep = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  user.twoStepVerification = !user.twoStepVerification;
  await user.save();

  res.json({
    message: `Two-step verification ${
      user.twoStepVerification ? 'enabled' : 'disabled'
    }`,
    twoStepVerification: user.twoStepVerification,
  });
});

// @desc    Update the technician's online status
// @route   PUT /api/users/online-status
// @access  Private
const toggleOnlineStatus = asyncHandler(async (req, res) => {
  const { isOnline } = req.body;

  if (typeof isOnline !== 'boolean') {
    return res
      .status(400)
      .json({ message: 'isOnline (boolean) is required' });
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { isOnline },
    { new: true }
  ).select('firstName lastName email isOnline');

  res.json(user);
});

// @desc    Get the logged-in user's connected device tokens
// @route   GET /api/users/devices
// @access  Private
const getConnectedDevices = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('deviceTokens');
  res.json({ deviceTokens: user.deviceTokens });
});

// @desc    Remove a specific device token from the logged-in user
// @route   DELETE /api/users/devices/:token
// @access  Private
const removeDevice = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { deviceTokens: req.params.token } },
    { new: true }
  ).select('deviceTokens');

  res.json({
    message: 'Device removed',
    deviceTokens: user.deviceTokens,
  });
});

// @desc    Delete the logged-in user's account
// @route   DELETE /api/users/account
// @access  Private
const deleteAccount = asyncHandler(async (req, res) => {
  await User.findByIdAndDelete(req.user._id);
  res.json({ message: 'Account deleted successfully' });
});

export {
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
};
