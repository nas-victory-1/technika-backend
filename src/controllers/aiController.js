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

    // Validate message shape — content can be a plain string or a multipart
    // array (text + image_base64 parts) for multimodal messages.
    const valid = messages.every((m) => {
        if (m.role !== "user" && m.role !== "assistant") return false;
        if (typeof m.content === "string") return m.content.trim().length > 0;
        if (Array.isArray(m.content) && m.content.length > 0) {
            return m.content.every(
                (part) =>
                    (part.type === "text" &&
                        typeof part.content === "string" &&
                        part.content.trim().length > 0) ||
                    (part.type === "image_base64" &&
                        typeof part.data === "string" &&
                        part.data.length > 0),
            );
        }
        return false;
    });
    if (!valid) {
        return res.status(400).json({
            message:
                'Each message must have role ("user" or "assistant") and content as a non-empty string or a non-empty array of text/image parts',
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
