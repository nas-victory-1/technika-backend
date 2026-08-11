import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { sendPasswordResetEmail } from "../utils/email.js";

const RESET_TOKEN_TTL_MINUTES = 30;

const generateToken = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "5d",
    });

// Short-lived token used only to carry a user through the gap between
// "password verified" and "OTP verified" during 2FA login. It deliberately
// cannot be used as a real auth token (protect middleware only accepts
// tokens without a `purpose` claim doing double duty — this one is scoped).
const generatePreAuthToken = (id) =>
    jwt.sign({ id, purpose: "login-2fa" }, process.env.JWT_SECRET, {
        expiresIn: "10m",
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

    // 2FA accounts don't get a real token yet — password is only step one.
    // The client must call /auth/verify-login-otp with this preAuthToken
    // plus a code before it gets a usable session.
    if (user.twoStepVerification) {
        return res.json({
            twoStepRequired: true,
            preAuthToken: generatePreAuthToken(user._id),
            message: "Enter the verification code to finish signing in",
        });
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

// @desc    Request a password reset — generates a reset token and emails it
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "email is required" });
    }

    const user = await User.findOne({ email });

    // Always return the same generic message whether or not the user exists,
    // so this endpoint can't be used to enumerate registered emails. Only do
    // the token generation / send work if a matching user was actually found.
    if (user) {
        // Short numeric code, not a long hex token — this gets manually typed
        // into the app (no clickable link/deep-linking set up yet), so it needs
        // to be short enough to copy-paste comfortably. Only its hash is stored;
        // even a compromised DB can't be used to reset the account.
        const resetToken = crypto.randomInt(100000, 1000000).toString(); // 6 digits
        const resetTokenHash = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        user.resetPasswordTokenHash = resetTokenHash;
        user.resetPasswordExpires = new Date(
            Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000,
        );
        await user.save();

        try {
            await sendPasswordResetEmail(user.email, resetToken);
        } catch (err) {
            // Don't fail the request over an email hiccup — the generic
            // response below still goes out either way, and the token is
            // already saved so a resend attempt would work if needed.
            console.error(
                `Failed to send password reset email to ${user.email}:`,
                err.message,
            );
        }
    }

    res.json({
        message: "If this email exists, a reset link has been sent",
    });
});

// @desc    Reset password using the token emailed via /forgot-password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
    const { token, password } = req.body;

    if (!token) {
        return res.status(400).json({ message: "token is required" });
    }
    if (!password || password.length < 6) {
        return res
            .status(400)
            .json({
                message: "A password of at least 6 characters is required",
            });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordTokenHash +resetPasswordExpires");

    if (!user) {
        return res
            .status(400)
            .json({ message: "Reset link is invalid or has expired" });
    }

    // Assigning triggers the existing pre('save') hook, which rehashes it
    user.password = password;
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: "Password has been reset successfully" });
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

// @desc    Complete login for accounts with two-step verification enabled.
//          Stub: any 4-digit code is accepted, same as /verify-otp — this
//          endpoint gates access to one specific pending login (tied to the
//          preAuthToken), it does not add real SMS delivery. Real delivery
//          still depends on Africa's Talking sender ID approval.
// @route   POST /api/auth/verify-login-otp
// @access  Public (requires a valid preAuthToken from /login)
const verifyLoginOtp = asyncHandler(async (req, res) => {
    const { preAuthToken, otp } = req.body;

    if (!preAuthToken) {
        return res.status(400).json({ message: "preAuthToken is required" });
    }
    if (!otp || otp.length !== 4) {
        return res
            .status(400)
            .json({ message: "Please enter a valid 4-digit code" });
    }

    let decoded;
    try {
        decoded = jwt.verify(preAuthToken, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({
            message: "Verification session expired, please log in again",
        });
    }

    if (decoded.purpose !== "login-2fa") {
        return res
            .status(401)
            .json({ message: "Invalid verification session" });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    // Stub: any well-formed 4-digit code is accepted (see verifyOtp above)
    // !!Must be doneee
    res.json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
    });
});

export {
    register,
    login,
    getMe,
    forgotPassword,
    resetPassword,
    registerDeviceToken,
    verifyOtp,
    verifyLoginOtp,
};
