import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const locationSchema = new mongoose.Schema(
    {
        latitude: { type: Number },
        longitude: { type: Number },
        updatedAt: { type: Date },
    },
    { _id: false },
);

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: [true, "First name is required"],
            trim: true,
        },
        lastName: {
            type: String,
            required: [true, "Last name is required"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
        },
        phoneNumber: {
            type: String,
            required: [true, "Phone number is required"],
            trim: true,
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: 6,
            select: false,
        },
        role: {
            type: String,
            enum: ["admin", "technician"],
            default: "technician",
        },
        profilePicture: {
            type: String,
            default: null,
        },
        birthDate: {
            type: Date,
        },
        // Account-level enable/disable, set by an admin. Distinct from
        // `isOnline`, which is presence (on/off shift) toggled by the user
        // themselves. A deactivated user is blocked from logging in / using
        // any existing session, but their history (tasks, chats) is preserved.
        isActive: {
            type: Boolean,
            default: true,
        },
        isOnline: {
            type: Boolean,
            default: false,
        },
        twoStepVerification: {
            type: Boolean,
            default: false,
        },
        location: {
            type: locationSchema,
            default: null,
        },
        // Push-notification / connected-device tokens (e.g. FCM/APNs tokens)
        deviceTokens: {
            type: [String],
            default: [],
        },
        // Password reset flow: a SHA-256 hash of the reset token (the plaintext
        // token is emailed to the user and never stored), plus its expiry.
        // Hashed with SHA-256 rather than bcrypt because this is looked up by
        // exact match (findOne on the hash), not compared candidate-by-candidate
        // like a password.
        resetPasswordTokenHash: {
            type: String,
            default: null,
            select: false,
        },
        resetPasswordExpires: {
            type: Date,
            default: null,
            select: false,
        },
    },
    { timestamps: true },
);

userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", userSchema);
