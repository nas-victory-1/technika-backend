import express from "express";
import rateLimit from "express-rate-limit";
import { aiChat } from "../controllers/aiController.js";
import { protect } from "../middleware/authMiddleware.js";


// Rate limiter - 20 requests per 15 minutes per IP.
const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many AI requests, please slow down" },
});

const router = express.Router();

router.post("/chat", aiLimiter, protect, aiChat);

export default router;
