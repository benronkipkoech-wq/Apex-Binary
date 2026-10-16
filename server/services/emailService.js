import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Resend Configuration
const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM_EMAIL || 'Apex Binary <onboarding@resend.dev>';
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Optional SMTP Fallback Configuration
const smtpHost = process.env.EMAIL_HOST;
const smtpPort = parseInt(process.env.EMAIL_PORT) || 587;
const smtpUser = process.env.EMAIL_USER;
const smtpPass = process.env.EMAIL_PASS;
const fromAddress = process.env.EMAIL_FROM || smtpUser || 'no-reply@apexbinary.ke';

let transporter = null;
if (smtpHost && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
}

/**
 * Send a verification email containing a 6-digit numeric code via Resend.
 * @param {string} toEmail - Recipient email address.
 * @param {string} verificationCode - 6-digit verification code.
 */
export async function sendVerificationEmail(toEmail, verificationCode) {
  const subject = `${verificationCode} is your Apex Binary verification code`;
  const textContent = `Your Apex Binary verification code is: ${verificationCode}\n\nThis code expires in 15 minutes.\nIf you did not request this, please ignore this email.`;
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0e14; color: #e6edf3; margin: 0; padding: 20px; }
          .container { max-width: 480px; margin: 0 auto; background: #131722; border: 1px solid #232733; border-radius: 12px; padding: 32px 24px; text-align: center; }
          .logo { font-size: 22px; font-weight: 800; color: #00f59b; letter-spacing: 2px; margin-bottom: 6px; }
          .sub { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 24px; }
          .card { background: #1a1e29; border: 1px solid #2a3040; border-radius: 8px; padding: 24px 16px; margin-bottom: 24px; }
          .code-box { font-family: 'SF Mono', Monaco, Consolas, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #00f59b; padding: 14px 20px; background: rgba(0, 245, 155, 0.08); border: 1px solid rgba(0, 245, 155, 0.25); border-radius: 8px; display: inline-block; margin: 12px 0; }
          .desc { font-size: 13px; color: #9da7b3; line-height: 1.5; margin: 0; }
          .footer { font-size: 11px; color: #6e7681; margin-top: 20px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">▲ APEX BINARY</div>
          <div class="sub">Secure Trading Platform</div>
          <div class="card">
            <p class="desc">Enter the authentication code below to verify your account and activate trading:</p>
            <div class="code-box">${verificationCode}</div>
            <p class="desc" style="font-size: 12px; color: #8b949e;">This code will expire in 15 minutes. Never disclose this code to anyone.</p>
          </div>
          <p class="footer">If you did not sign up for an Apex Binary trading account, you can safely ignore this email.</p>
        </div>
      </body>
    </html>
  `;

  // 1. Primary: Resend API
  if (resend) {
    try {
      const response = await resend.emails.send({
        from: resendFrom,
        to: [toEmail],
        subject,
        html: htmlContent,
        text: textContent,
      });

      if (response.error) {
        console.error('[Resend Error]:', response.error);
        throw new Error(response.error.message || 'Resend error sending email');
      }

      console.log(`[Resend] Verification code sent to ${toEmail}. Message ID: ${response.data?.id}`);
      return { success: true, provider: 'resend', id: response.data?.id };
    } catch (resendError) {
      console.error('[Resend Failed, falling back if configured]:', resendError.message);
      if (!transporter) throw resendError;
    }
  }

  // 2. Secondary: SMTP fallback
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to: toEmail,
        subject,
        text: textContent,
        html: htmlContent,
      });
      console.log(`[SMTP] Verification email sent to ${toEmail}: ${info.messageId}`);
      return { success: true, provider: 'smtp', id: info.messageId };
    } catch (smtpError) {
      console.error('[SMTP Error]:', smtpError);
      throw smtpError;
    }
  }

  // 3. Fallback when no keys are configured (Local / Dev mode)
  console.log(`[Email Service - Dev Mode] Verification code for ${toEmail}: ${verificationCode}`);
  return { success: true, provider: 'dev-console', code: verificationCode };
}

/**
 * Send a PIN reset email containing a 6-digit numeric code via Resend.
 * @param {string} toEmail - Recipient email address.
 * @param {string} resetCode - 6-digit reset code.
 */
export async function sendPinResetEmail(toEmail, resetCode) {
  const subject = `${resetCode} — Your Apex Binary PIN Reset Code`;
  const textContent = `Your Apex Binary PIN reset code is: ${resetCode}\n\nThis code expires in 15 minutes.\nIf you did not request a PIN reset, please ignore this email and secure your account.`;
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0e14; color: #e6edf3; margin: 0; padding: 20px; }
          .container { max-width: 480px; margin: 0 auto; background: #131722; border: 1px solid #232733; border-radius: 12px; padding: 32px 24px; text-align: center; }
          .logo { font-size: 22px; font-weight: 800; color: #00f59b; letter-spacing: 2px; margin-bottom: 6px; }
          .sub { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 24px; }
          .card { background: #1a1e29; border: 1px solid #2a3040; border-radius: 8px; padding: 24px 16px; margin-bottom: 24px; }
          .code-box { font-family: 'SF Mono', Monaco, Consolas, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #ff4d6d; padding: 14px 20px; background: rgba(255, 77, 109, 0.08); border: 1px solid rgba(255, 77, 109, 0.25); border-radius: 8px; display: inline-block; margin: 12px 0; }
          .desc { font-size: 13px; color: #9da7b3; line-height: 1.5; margin: 0; }
          .footer { font-size: 11px; color: #6e7681; margin-top: 20px; line-height: 1.5; }
          .warning { font-size: 12px; color: #e3b341; margin-top: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">▲ APEX BINARY</div>
          <div class="sub">PIN Reset Request</div>
          <div class="card">
            <p class="desc">You requested to reset your trading PIN. Enter the code below to set a new PIN:</p>
            <div class="code-box">${resetCode}</div>
            <p class="desc" style="font-size: 12px; color: #8b949e;">This code will expire in <strong>15 minutes</strong>. Never share this code with anyone.</p>
          </div>
          <p class="warning">⚠️ If you did not request this reset, your account may be at risk. Change your PIN immediately after login.</p>
          <p class="footer">Apex Binary Trading Platform · Kenya</p>
        </div>
      </body>
    </html>
  `;

  // 1. Primary: Resend API
  if (resend) {
    try {
      const response = await resend.emails.send({
        from: resendFrom,
        to: [toEmail],
        subject,
        html: htmlContent,
        text: textContent,
      });
      if (response.error) throw new Error(response.error.message || 'Resend error');
      console.log(`[Resend] PIN reset code sent to ${toEmail}. ID: ${response.data?.id}`);
      return { success: true, provider: 'resend', id: response.data?.id };
    } catch (resendError) {
      console.error('[Resend PIN Reset Failed]:', resendError.message);
      if (!transporter) throw resendError;
    }
  }

  // 2. Secondary: SMTP fallback
  if (transporter) {
    const info = await transporter.sendMail({ from: fromAddress, to: toEmail, subject, text: textContent, html: htmlContent });
    console.log(`[SMTP] PIN reset email sent to ${toEmail}: ${info.messageId}`);
    return { success: true, provider: 'smtp', id: info.messageId };
  }

  // 3. Dev mode fallback
  console.log(`[Email Dev Mode] PIN reset code for ${toEmail}: ${resetCode}`);
  return { success: true, provider: 'dev-console', code: resetCode };
}

export default {
  sendVerificationEmail,
  sendPinResetEmail,
};
