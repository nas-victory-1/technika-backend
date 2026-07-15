import jwt from "jsonwebtoken";
import User from "../models/User.js";
import asyncHandler from "../middleware/asyncHandler.js";

const generateToken = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "5d",
    });

// @desc    Register a new user (public registration always creates a technician)
// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
    const { firstName, lastName, phoneNumber, email, password } = req.body;

    if (!firstName || !lastName || !phoneNumber || !email || !password) {
        return res.status(400).json({
            message: "First name, last name, email, and password are required",
        });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
    }

    // Public registration always creates a technician; role cannot be set by the user
    const user = await User.create({
        firstName,
        lastName,
        phoneNumber,
        email,
        password,
        role: "technician",
    });

    res.status(201).json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
    });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res
            .status(400)
            .json({ message: "email and password are required" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ message: "Invalid email or password" });
    }

    res.json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
    });
});

// @desc    Get current logged-in user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
    res.json(req.user);
});

// @desc    Request a password reset (stubbed — no email is actually sent yet)
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "email is required" });
    }

    // Always return the same generic message so we don't leak which emails exist.
    // (Real reset-token generation / email delivery can be wired in later.)
    res.json({
        message: "If this email exists, a reset link has been sent",
    });
});

// @desc    Register a device token for the logged-in user (push / connected devices)
// @route   POST /api/auth/device-token
// @access  Private
const registerDeviceToken = asyncHandler(async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ message: "token is required" });
    }

    // $addToSet avoids storing duplicate tokens for the same device
    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $addToSet: { deviceTokens: token } },
        { new: true },
    ).select("deviceTokens");

    res.json({
        message: "Device token registered",
        deviceTokens: user.deviceTokens,
    });
});

// @desc    Verify OTP (stub — accepts any 4-digit code)
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOtp = asyncHandler(async (req, res) => {
    const { otp } = req.body;

    if (!otp || otp.length !== 4) {
        return res
            .status(400)
            .json({ message: "Please enter a valid 4-digit code" });
    }

    // Stub: any 4-digit code is accepted
    res.json({ success: true, message: "Phone number verified successfully" });
});

export {
    register,
    login,
    getMe,
    forgotPassword,
    registerDeviceToken,
    verifyOtp,
};
