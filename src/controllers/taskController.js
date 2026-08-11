import Task from "../models/Task.js";
import User from "../models/User.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { createNotification } from "./notificationController.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sendVerificationCode } from "../utils/email.js";

// Fields populated for user references on tasks (never expose `name` — model uses firstName/lastName)
const USER_FIELDS = "firstName lastName email";

// Generates a plaintext 6-digit code + its bcrypt hash. The plaintext is
// only ever used once (to email it) and is never persisted.
const generateVerificationCode = async () => {
    const code = crypto.randomInt(100000, 1000000).toString(); // 6 digits, no leading-zero drop
    const codeHash = await bcrypt.hash(code, 10);
    return { code, codeHash };
};

const VERIFICATION_CODE_TTL_HOURS = 72;
const MAX_VERIFICATION_ATTEMPTS = 3;

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private/Admin
const createTask = asyncHandler(async (req, res) => {
    const {
        title,
        description,
        assignedTo,
        location,
        priority,
        companyName,
        callerPhone,
        contactEmail,
    } = req.body;

    if (!title) {
        return res.status(400).json({ message: "title is required" });
    }

    if (assignedTo) {
        const technician = await User.findOne({
            _id: assignedTo,
            role: "technician",
        });
        if (!technician) {
            return res.status(404).json({ message: "Technician not found" });
        }
    }

    const task = await Task.create({
        title,
        description,
        assignedTo: assignedTo || null,
        createdBy: req.user._id,
        location: location || null,
        priority: priority || "medium",
        companyName: companyName || "",
        callerPhone: callerPhone || "",
        contactEmail: contactEmail || "",
    });

    // Notify the technician if the task was assigned at creation time
    if (task.assignedTo) {
        await createNotification({
            userId: task.assignedTo,
            title: "New task assigned",
            message: `You have been assigned the task "${task.title}".`,
            type: "task_assigned",
            relatedTask: task._id,
        });
    }

    await task.populate("assignedTo", USER_FIELDS);
    await task.populate("createdBy", USER_FIELDS);

    res.status(201).json(task);
});

// @desc    Get all tasks (admin sees all; technician sees only theirs)
// @route   GET /api/tasks
// @access  Private
const getTasks = asyncHandler(async (req, res) => {
    const filter =
        req.user.role === "admin" ? {} : { assignedTo: req.user._id };

    const tasks = await Task.find(filter)
        .populate("assignedTo", USER_FIELDS)
        .populate("createdBy", USER_FIELDS)
        .sort({ createdAt: -1 });

    res.json(tasks);
});

// @desc    Get task statistics for the requesting user (counts + avg completion time)
// @route   GET /api/tasks/stats
// @access  Private
const getTaskStats = asyncHandler(async (req, res) => {
    // Admins see stats across all tasks; technicians see only their own
    const scope = req.user.role === "admin" ? {} : { assignedTo: req.user._id };

    const [available, completed, pending] = await Promise.all([
        Task.countDocuments({ ...scope, status: "available" }),
        Task.countDocuments({ ...scope, status: "completed" }),
        Task.countDocuments({ ...scope, status: "pending" }),
    ]);

    // Average completion time (minutes) from acknowledgedAt -> completedAt
    const completedTasks = await Task.find({
        ...scope,
        status: "completed",
        acknowledgedAt: { $ne: null },
        completedAt: { $ne: null },
    }).select("acknowledgedAt completedAt");

    let averageCompletionMinutes = 0;
    if (completedTasks.length > 0) {
        const totalMs = completedTasks.reduce(
            (sum, t) => sum + (t.completedAt - t.acknowledgedAt),
            0,
        );
        averageCompletionMinutes = Math.round(
            totalMs / completedTasks.length / 60000,
        );
    }

    res.json({
        available,
        completed,
        pending,
        averageCompletionMinutes,
    });
});

// @desc    Get task completion counts grouped by month for the last 6 months
// @route   GET /api/tasks/stats/monthly
// @access  Private
const getMonthlyStats = asyncHandler(async (req, res) => {
    const scope = req.user.role === "admin" ? {} : { assignedTo: req.user._id };

    const MONTHS = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];

    const now = new Date();
    // Start of the month 5 months ago (gives us a 6-month window incl. current month)
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const completed = await Task.find({
        ...scope,
        status: "completed",
        completedAt: { $gte: start },
    }).select("completedAt");

    // Pre-seed the 6 month buckets in order so months with 0 completions still appear
    const buckets = [];
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        buckets.push({
            key: `${d.getFullYear()}-${d.getMonth()}`,
            month: MONTHS[d.getMonth()],
            completed: 0,
        });
    }

    const indexByKey = new Map(buckets.map((b, i) => [b.key, i]));
    completed.forEach((t) => {
        const d = new Date(t.completedAt);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (indexByKey.has(key)) {
            buckets[indexByKey.get(key)].completed += 1;
        }
    });

    res.json(buckets.map(({ month, completed }) => ({ month, completed })));
});

// @desc    Get all open tasks technicians can browse and accept
//          (both unclaimed tasks and tasks pre-assigned but not yet accepted)
// @route   GET /api/tasks/available
// @access  Private
const getAvailableTasks = asyncHandler(async (req, res) => {
    const tasks = await Task.find({ status: "available" })
        .populate("assignedTo", USER_FIELDS)
        .populate("createdBy", USER_FIELDS)
        .sort({ createdAt: -1 });

    res.json(tasks);
});

// @desc    Get the technician's current (in-progress) task — status "pending"
// @route   GET /api/tasks/current
// @access  Private
const getCurrentTask = asyncHandler(async (req, res) => {
    const task = await Task.findOne({
        assignedTo: req.user._id,
        status: "pending",
    })
        .populate("assignedTo", USER_FIELDS)
        .populate("createdBy", USER_FIELDS)
        .sort({ acknowledgedAt: -1 });

    // No active task is a valid state for the home screen, not an error
    res.json(task || null);
});

// @desc    Get a single task by ID
// @route   GET /api/tasks/:id
// @access  Private
const getTaskById = asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id)
        .populate("assignedTo", USER_FIELDS)
        .populate("createdBy", USER_FIELDS);

    if (!task) {
        return res.status(404).json({ message: "Task not found" });
    }

    // Technicians can only view their own tasks
    if (
        req.user.role === "technician" &&
        (!task.assignedTo ||
            task.assignedTo._id.toString() !== req.user._id.toString())
    ) {
        return res
            .status(403)
            .json({ message: "Not authorized to view this task" });
    }

    res.json(task);
});

// @desc    Assign a task to a technician (admin only)
// @route   PUT /api/tasks/:id/assign
// @access  Private/Admin
const assignTask = asyncHandler(async (req, res) => {
    const { assignedTo } = req.body;

    if (!assignedTo) {
        return res.status(400).json({ message: "assignedTo is required" });
    }

    const technician = await User.findOne({
        _id: assignedTo,
        role: "technician",
    });
    if (!technician) {
        return res.status(404).json({ message: "Technician not found" });
    }

    const task = await Task.findByIdAndUpdate(
        req.params.id,
        { assignedTo },
        { new: true },
    )
        .populate("assignedTo", USER_FIELDS)
        .populate("createdBy", USER_FIELDS);

    if (!task) {
        return res.status(404).json({ message: "Task not found" });
    }

    // Notify the technician that they've been assigned this task
    await createNotification({
        userId: assignedTo,
        title: "New task assigned",
        message: `You have been assigned the task "${task.title}".`,
        type: "task_assigned",
        relatedTask: task._id,
    });

    res.json(task);
});

// @desc    Update task status
// @route   PUT /api/tasks/:id/status
// @access  Private (technician updates their own; admin can update any)
const updateTaskStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowedStatuses = [
        "pending",
        "available",
        "awaiting_verification",
        "disputed",
        "completed",
    ];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            message: `Status must be one of: ${allowedStatuses.join(", ")}`,
        });
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
        return res.status(404).json({ message: "Task not found" });
    }

    const isTechnician = req.user.role === "technician";
    const isUnclaimed = !task.assignedTo;
    const isOwnTask =
        task.assignedTo &&
        task.assignedTo.toString() === req.user._id.toString();

    // Claiming an open task: a technician accepting an unassigned "available"
    // task both assigns it to themselves AND advances it to "pending" in one
    // atomic operation, so two technicians tapping "accept" on the same job
    // at the same moment can't both succeed. A verification code is generated
    // and hashed in the same update, and emailed to the on-site contact once
    // the claim is confirmed.
    if (isTechnician && isUnclaimed && status === "pending") {
        const { code, codeHash } = await generateVerificationCode();
        const expiresAt = new Date(
            Date.now() + VERIFICATION_CODE_TTL_HOURS * 60 * 60 * 1000,
        );

        const claimed = await Task.findOneAndUpdate(
            { _id: req.params.id, assignedTo: null, status: "available" },
            {
                assignedTo: req.user._id,
                status: "pending",
                acknowledgedAt: new Date(),
                verificationCodeHash: codeHash,
                verificationCodeExpiresAt: expiresAt,
                verificationAttempts: 0,
            },
            { new: true },
        )
            .populate("assignedTo", USER_FIELDS)
            .populate("createdBy", USER_FIELDS);

        if (!claimed) {
            // Someone else claimed it (or it moved on) between fetch and update
            return res.status(409).json({
                message:
                    "This task has already been claimed by another technician",
            });
        }

        // Email failure shouldn't undo a successful claim — log and move on.
        // Admin can resend/override if the customer never received the code.
        if (claimed.contactEmail) {
            try {
                await sendVerificationCode(
                    claimed.contactEmail,
                    code,
                    claimed.title,
                );
            } catch (err) {
                console.error(
                    `Failed to send verification code for task ${claimed._id}:`,
                    err.message,
                );
            }
        } else {
            console.warn(
                `Task ${claimed._id} claimed with no contactEmail — no verification code sent`,
            );
        }

        return res.json(claimed);
    }

    // Everything else requires the technician to already own the task
    if (isTechnician && !isOwnTask) {
        return res
            .status(403)
            .json({ message: "Not authorized to update this task" });
    }

    // Technicians can only move a task forward (available -> pending ->
    // awaiting_verification), or abandon a task they've accepted back to
    // available. Reaching "completed" happens only through /verify (correct
    // code entered) or /override (admin), never through a raw status PUT —
    // that's the whole point of the verification feature. Admins are exempt
    // (trusted role, may need to make manual corrections).
    if (isTechnician) {
        const validTransitions = {
            available: ["pending"],
            pending: ["awaiting_verification", "available"],
            awaiting_verification: [],
            disputed: [],
            completed: [],
        };
        const allowedNext = validTransitions[task.status] || [];

        if (!allowedNext.includes(status)) {
            return res.status(400).json({
                message: `Cannot change status from "${task.status}" to "${status}"`,
            });
        }

        // Abandoning: give the task back to the open pool for real, not just
        // in name — assignedTo must be cleared or the atomic claim check above
        // (`assignedTo: null`) would wrongly tell the next technician it's
        // already taken.
        if (task.status === "pending" && status === "available") {
            task.assignedTo = null;
            task.acknowledgedAt = null;
            task.verificationCodeHash = null;
            task.verificationCodeExpiresAt = null;
            task.verificationAttempts = 0;
        }
    }

    // Stamp lifecycle timestamps as the task progresses.
    // pending == technician has accepted/acknowledged the task (it's now in progress).
    if (status === "pending" && !task.acknowledgedAt) {
        task.acknowledgedAt = new Date();
    }
    if (status === "completed" && !task.completedAt) {
        task.completedAt = new Date();
    }

    task.status = status;
    await task.save();

    await task.populate("assignedTo", USER_FIELDS);
    await task.populate("createdBy", USER_FIELDS);

    res.json(task);
});

// @desc    Technician submits the customer's verification code to complete a task
// @route   PUT /api/tasks/:id/verify
// @access  Private (technician, own task only)
const verifyTaskCompletion = asyncHandler(async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ message: "code is required" });
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
        return res.status(404).json({ message: "Task not found" });
    }

    if (
        !task.assignedTo ||
        task.assignedTo.toString() !== req.user._id.toString()
    ) {
        return res
            .status(403)
            .json({ message: "Not authorized to verify this task" });
    }

    if (!["pending", "awaiting_verification"].includes(task.status)) {
        return res.status(400).json({
            message: `Cannot verify a task with status "${task.status}"`,
        });
    }

    if (!task.verificationCodeHash) {
        return res
            .status(400)
            .json({ message: "No verification code exists for this task" });
    }

    if (
        task.verificationCodeExpiresAt &&
        task.verificationCodeExpiresAt < new Date()
    ) {
        return res.status(400).json({
            message:
                "Verification code has expired. Contact an admin to resend or override.",
        });
    }

    if (task.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
        return res.status(429).json({
            message:
                "Too many failed attempts. Contact an admin to resend or override.",
        });
    }

    const isMatch = await bcrypt.compare(code, task.verificationCodeHash);

    if (!isMatch) {
        task.verificationAttempts += 1;
        await task.save();
        return res.status(400).json({
            message: "Incorrect code",
            attemptsRemaining: Math.max(
                0,
                MAX_VERIFICATION_ATTEMPTS - task.verificationAttempts,
            ),
        });
    }

    task.status = "completed";
    task.completedAt = new Date();
    task.verificationCodeHash = null; // burn the code, one-time use
    await task.save();

    await task.populate("assignedTo", USER_FIELDS);
    await task.populate("createdBy", USER_FIELDS);

    res.json(task);
});

// @desc    Technician flags a task as disputed (couldn't get the code from customer)
// @route   PUT /api/tasks/:id/dispute
// @access  Private (technician, own task only)
const disputeTask = asyncHandler(async (req, res) => {
    const { disputeReason } = req.body;

    if (!disputeReason || !disputeReason.trim()) {
        return res.status(400).json({ message: "disputeReason is required" });
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
        return res.status(404).json({ message: "Task not found" });
    }

    if (
        !task.assignedTo ||
        task.assignedTo.toString() !== req.user._id.toString()
    ) {
        return res
            .status(403)
            .json({ message: "Not authorized to update this task" });
    }

    if (!["pending", "awaiting_verification"].includes(task.status)) {
        return res.status(400).json({
            message: `Cannot dispute a task with status "${task.status}"`,
        });
    }

    task.status = "disputed";
    task.disputeReason = disputeReason.trim();
    await task.save();

    // Let admins know a task needs manual review
    const admins = await User.find({ role: "admin" }).select("_id");
    await Promise.all(
        admins.map((admin) =>
            createNotification({
                userId: admin._id,
                title: "Task disputed",
                message: `"${task.title}" was flagged: ${task.disputeReason}`,
                type: "task_disputed",
                relatedTask: task._id,
            }),
        ),
    );

    await task.populate("assignedTo", USER_FIELDS);
    await task.populate("createdBy", USER_FIELDS);

    res.json(task);
});

// @desc    Admin manually completes a disputed or stuck task, bypassing the code
// @route   PUT /api/tasks/:id/override
// @access  Private/Admin
const overrideTaskCompletion = asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) {
        return res.status(404).json({ message: "Task not found" });
    }

    if (
        !["disputed", "pending", "awaiting_verification"].includes(task.status)
    ) {
        return res.status(400).json({
            message: `Cannot override a task with status "${task.status}"`,
        });
    }

    task.status = "completed";
    task.completedAt = new Date();
    task.verificationCodeHash = null;
    await task.save();

    await task.populate("assignedTo", USER_FIELDS);
    await task.populate("createdBy", USER_FIELDS);

    res.json(task);
});

// @desc    Add/update the completion note on a task (technician's own task)
// @route   PUT /api/tasks/:id/note
// @access  Private
const addCompletionNote = asyncHandler(async (req, res) => {
    const { completionNote } = req.body;

    if (!completionNote || !completionNote.trim()) {
        return res.status(400).json({ message: "completionNote is required" });
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
        return res.status(404).json({ message: "Task not found" });
    }

    // Technicians can only annotate their own tasks
    if (
        req.user.role === "technician" &&
        (!task.assignedTo ||
            task.assignedTo.toString() !== req.user._id.toString())
    ) {
        return res
            .status(403)
            .json({ message: "Not authorized to update this task" });
    }

    task.completionNote = completionNote.trim();
    await task.save();

    await task.populate("assignedTo", USER_FIELDS);
    await task.populate("createdBy", USER_FIELDS);

    res.json(task);
});

// @desc    Update a task's core details (admin only)
// @route   PUT /api/tasks/:id
// @access  Private/Admin
const updateTask = asyncHandler(async (req, res) => {
    const {
        title,
        description,
        priority,
        location,
        companyName,
        callerPhone,
        contactEmail,
    } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (location !== undefined) updates.location = location;
    if (companyName !== undefined) updates.companyName = companyName;
    if (callerPhone !== undefined) updates.callerPhone = callerPhone;
    if (contactEmail !== undefined) updates.contactEmail = contactEmail;

    const task = await Task.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
    })
        .populate("assignedTo", USER_FIELDS)
        .populate("createdBy", USER_FIELDS);

    if (!task) {
        return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
});

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private/Admin
const deleteTask = asyncHandler(async (req, res) => {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) {
        return res.status(404).json({ message: "Task not found" });
    }
    res.json({ message: "Task removed" });
});

export {
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
};
