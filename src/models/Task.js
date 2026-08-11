import mongoose from "mongoose";

const taskLocationSchema = new mongoose.Schema(
    {
        latitude: { type: Number },
        longitude: { type: Number },
        address: { type: String, trim: true },
    },
    { _id: false },
);

const taskSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Task title is required"],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        status: {
            type: String,
            enum: [
                "pending",
                "available",
                "awaiting_verification",
                "disputed",
                "completed",
            ],
            default: "available",
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        location: {
            type: taskLocationSchema,
            default: null,
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high"],
            default: "medium",
        },
        // Client/company the operation is for (admin panel field)
        companyName: {
            type: String,
            trim: true,
            default: "",
        },
        // Phone number of the person who called in the service request
        callerPhone: {
            type: String,
            trim: true,
            default: "",
        },
        // Email of the on-site contact who receives the completion verification code.
        // Kept as free-text on the task (like companyName/callerPhone) rather than
        // linked to the Customer collection — see design note below.
        contactEmail: {
            type: String,
            trim: true,
            lowercase: true,
            default: "",
        },
        // bcrypt hash of the 6-digit verification code. Never store the plaintext code.
        verificationCodeHash: {
            type: String,
            default: null,
        },
        verificationCodeExpiresAt: {
            type: Date,
            default: null,
        },
        // Incremented on each failed verification attempt; used to rate-limit brute-forcing
        // a 6-digit code.
        verificationAttempts: {
            type: Number,
            default: 0,
        },
        // Technician's note when they can't get the code from the customer
        // (e.g. "customer unreachable", "customer refused") — surfaces on the
        // admin dashboard for manual review/override.
        disputeReason: {
            type: String,
            trim: true,
            default: "",
        },
        // Technician's note left when completing the task
        completionNote: {
            type: String,
            trim: true,
            default: "",
        },
        // Lifecycle timestamps used for average-completion-time calculations
        acknowledgedAt: { type: Date }, // set when technician accepts the task (status -> pending)
        startedAt: { type: Date },
        completedAt: { type: Date }, // set when task is completed (status -> completed)
    },
    { timestamps: true },
);

export default mongoose.model("Task", taskSchema);
