import express from "express";
import {
    register,
    login,
    getMe,
    forgotPassword,
    resetPassword,
    registerDeviceToken,
    verifyOtp,
    verifyLoginOtp,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", register); //✅
router.post("/login", login); //✅
router.post("/forgot-password", forgotPassword); //✅
router.post("/reset-password", resetPassword);
router.get("/me", protect, getMe); //✅
router.post("/device-token", protect, registerDeviceToken); //✅
router.post("/verify-otp", verifyOtp);
router.post("/verify-login-otp", verifyLoginOtp);

export default router;
