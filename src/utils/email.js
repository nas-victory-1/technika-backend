import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Sender address — must be on a domain you've verified with Resend, or use
// Resend's default sandbox sender (onboarding@resend.dev) which only
// delivers to your own account email until a domain is verified.
const FROM_ADDRESS =
    process.env.RESEND_FROM_EMAIL || "Technika <onboarding@resend.dev>";

/**
 * Sends the task completion verification code to the on-site contact.
 * @param {string} to - contact email on the task
 * @param {string} code - plaintext 6-digit code (never persisted anywhere)
 * @param {string} taskTitle
 */
export const sendVerificationCode = async (to, code, taskTitle) => {
    if (!to) {
        throw new Error("No contact email provided for verification code");
    }

    const { data, error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject: `Technika verification code for "${taskTitle}"`,
        text:
            `A Technika technician has been assigned to: "${taskTitle}".\n\n` +
            `Your verification code is: ${code}\n\n` +
            `Please give this code to the technician only once the work has been ` +
            `completed to your satisfaction. Do not share it beforehand.\n\n` +
            `This code expires in 72 hours.`,
    });

    if (error) {
        // Let the caller decide how to handle send failure — task should still
        // be claimed even if the email bounces, rather than losing the claim.
        throw new Error(
            `Failed to send verification email: ${error.message || error}`,
        );
    }

    return data;
};

/**
 * Sends a password reset code to the user, for manual entry in the app's
 * reset-password screen (no deep link / clickable URL — user copies the
 * token into the app themselves).
 * @param {string} to - user's email
 * @param {string} resetToken - plaintext reset token (never persisted anywhere)
 */
export const sendPasswordResetEmail = async (to, resetToken) => {
    if (!to) {
        throw new Error("No email provided for password reset");
    }

    const { data, error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject: "Reset your Technika password",
        text:
            `We received a request to reset your Technika password.\n\n` +
            `Your reset code is: ${resetToken}\n\n` +
            `Open the Technika app, go to "Reset Password", and enter this code ` +
            `along with your new password.\n\n` +
            `This code expires in 30 minutes. If you didn't request this, you can ` +
            `safely ignore this email — your password will remain unchanged.`,
    });

    if (error) {
        throw new Error(
            `Failed to send password reset email: ${error.message || error}`,
        );
    }

    return data;
};
