import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import connectDB from "./src/config/db.js";

import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import taskRoutes from "./src/routes/taskRoutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";
import chatRoutes from "./src/routes/chatRoutes.js";

const app = express();

app.use(express.json());

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", apiLimiter, userRoutes);
app.use("/api/tasks", apiLimiter, taskRoutes);
app.use("/api/notifications", apiLimiter, notificationRoutes);
app.use("/api/chats", apiLimiter, chatRoutes);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    return res.status(404).json({ message: "Resource not found" });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    return res.status(400).json({ message: "Duplicate field value entered" });
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
    return res.status(400).json({ message });
  }

  const statusCode = err.statusCode || 500;
  res
    .status(statusCode)
    .json({ message: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 3000;

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

export default app;
