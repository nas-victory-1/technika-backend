import asyncHandler from "../middleware/asyncHandler.js";
import Task from "../models/Task.js";
import { chat_with_llm } from "../services/llmService.js";

// @desc    Send a message to the AI technical assistant
// @route   POST /api/ai/chat
// @access  Private (technician)
const aiChat = asyncHandler(async (req, res) => {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
        return res
            .status(400)
            .json({ message: "messages array is required and must not be empty" });
    }

    // Validate message shape — each entry must have role + content
    const valid = messages.every(
        (m) =>
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0,
    );
    if (!valid) {
        return res.status(400).json({
            message:
                'Each message must have role ("user" or "assistant") and a non-empty content string',
        });
    }

    // Fetch the technician's current active task for context injection
    const currentTask = await Task.findOne({
        assignedTo: req.user._id,
        status: "pending",
    }).select("title description priority companyName location status");

    const context = {
        technicianName: req.user.firstName,
        task: currentTask || null,
    };

    const { reply, provider } = await chat_with_llm(messages, context);

    res.json({ reply, provider });
});

export { aiChat };
