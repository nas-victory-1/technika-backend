import jwt from "jsonwebtoken";
import User from "../models/User.js";
import asyncHandler from "./asyncHandler.js";

const protect = asyncHandler(async (req, res, next) => {
    let token;
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer ")
    ) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({ message: "Not authorized, no token" });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res
            .status(401)
            .json({ message: "Not authorized, token invalid or expired" });
    }

    // Scoped tokens (e.g. the 2FA pre-auth token issued mid-login, before OTP
    // verification) carry a `purpose` claim and must never be accepted as a
    // real bearer token — otherwise 2FA could be bypassed entirely by just
    // using the pre-auth token directly against any protected route.
    if (decoded.purpose) {
        return res
            .status(401)
            .json({ message: "Not authorized, invalid token type" });
    }

    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) {
        return res
            .status(401)
            .json({ message: "Not authorized, user not found" });
    }

    if (!req.user.isActive) {
        return res.status(401).json({
            message: "This account has been deactivated. Contact your admin.",
        });
    }

    next();
});

export { protect };
