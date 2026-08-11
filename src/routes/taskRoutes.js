import express from "express";
import {
    createTask,
    getTasks,
    getAvailableTasks,
    getTaskStats,
    getMonthlyStats,
    getCurrentTask,
    getTaskById,
    assignTask,
    updateTaskStatus,
    verifyTaskCompletion,
    disputeTask,
    overrideTaskCompletion,
    addCompletionNote,
    updateTask,
    deleteTask,
} from "../controllers/taskController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Create task (admin only)
router.post("/", protect, authorize("admin"), createTask);

// Get all tasks (admin sees all, technician sees own)
router.get("/", protect, getTasks);

// Stats & current task & available pool — MUST come before "/:id" so they aren't captured as an id
router.get("/stats/monthly", protect, getMonthlyStats);
router.get("/stats", protect, getTaskStats);
router.get("/current", protect, getCurrentTask);
router.get("/available", protect, getAvailableTasks);

// Get task by ID
router.get("/:id", protect, getTaskById);

// Update task core details (admin only)
router.put("/:id", protect, authorize("admin"), updateTask);

// Assign task to technician (admin only)
router.put("/:id/assign", protect, authorize("admin"), assignTask);

// Update task status (technician or admin)
router.put("/:id/status", protect, updateTaskStatus);

// Submit the customer's verification code to complete a task (technician, own task)
router.put("/:id/verify", protect, verifyTaskCompletion);

// Flag a task as disputed — couldn't get the code from the customer (technician, own task)
router.put("/:id/dispute", protect, disputeTask);

// Force-complete a disputed/stuck task, bypassing the code (admin only)
router.put(
    "/:id/override",
    protect,
    authorize("admin"),
    overrideTaskCompletion,
);

// Add a completion note (technician or admin)
router.put("/:id/note", protect, addCompletionNote);

// Delete task (admin only)
router.delete("/:id", protect, authorize("admin"), deleteTask);

export default router;
