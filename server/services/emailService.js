import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Load SMTP configuration from environment variables
const smtpHost = process.env.EMAIL_HOST || 'smtp.example.com';
const smtpPort = parseInt(process.env.EMAIL_PORT) || 587;
const smtpUser = process.env.EMAIL_USER || 'user@example.com';
const smtpPass = process.env.EMAIL_PASS || 'password';
const fromAddress = process.env.EMAIL_FROM || smtpUser;

// Create a reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465, // true for 465, false for other ports
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

/**
 * Send a verification email containing a numeric code.
 * @param {string} toEmail - Recipient email address.
 * @param {string} verificationCode - 6‑digit verification code.
 */
export async function sendVerificationEmail(toEmail, verificationCode) {
  const mailOptions = {
    from: fromAddress,
    to: toEmail,
    subject: 'Your Apex Binary Verification Code',
    text: `Your verification code is: ${verificationCode}\n\nIf you did not request this, please ignore this email.`,
    html: `<p>Your verification code is: <strong>${verificationCode}</strong></p><p>If you did not request this, please ignore this email.</p>`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
}
