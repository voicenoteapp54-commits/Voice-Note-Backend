
import { Resend } from "resend";
import { config } from "../config/env.ts";
import type { OtpPurpose } from "../src/features/authentication/auth.model.ts";

 
const resendClient = config.RESEND_API_KEY
  ? new Resend(config.RESEND_API_KEY)
  : null;

type Recipient = string;

type EmailAttachment = {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
};

type SendEmailOptions = {
  to: Recipient | Recipient[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  cc?: Recipient[];
  bcc?: Recipient[];
  attachments?: EmailAttachment[];
};

const validateEmailConfig = (): void => {
  if (!config.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!config.RESEND_SENDER) {
    throw new Error("RESEND_SENDER is not configured");
  }

  if (!resendClient) {
    throw new Error("Resend is not properly configured");
  }
};

const validateEmailAddress = (email: string): void => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    throw new Error(`Invalid email address: ${email}`);
  }
};

const processRecipients = (
  recipients: Recipient | Recipient[],
): string[] => {
  const emails = Array.isArray(recipients)
    ? recipients
    : [recipients];

  if (emails.length === 0) {
    throw new Error("At least one recipient is required");
  }

  for (const email of emails) {
    if (typeof email !== "string" || !email.trim()) {
      throw new Error("Invalid email recipient");
    }

    validateEmailAddress(email.trim());
  }

  return emails.map((email) => email.trim());
};

export const sendEmail = async ({
  to,
  subject,
  text = "",
  html,
  from,
  cc = [],
  bcc = [],
  attachments = [],
}: SendEmailOptions) => {
  validateEmailConfig();

  const sender = from ?? config.RESEND_SENDER!;

  if (!sender.includes("@")) {
    throw new Error(`Invalid sender: ${sender}`);
  }

  const recipients = processRecipients(to);
  const ccRecipients =
    cc.length > 0 ? processRecipients(cc) : [];
  const bccRecipients =
    bcc.length > 0 ? processRecipients(bcc) : [];

  try {
    const response = await resendClient!.emails.send({
      from: sender,
      to: recipients,
      subject,
      text,
      ...(html ? { html } : {}),
      ...(ccRecipients.length > 0 ? { cc: ccRecipients } : {}),
      ...(bccRecipients.length > 0 ? { bcc: bccRecipients } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return {
      success: true as const,
      provider: "resend" as const,
      data: response.data,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown email error";

    console.error("Email sending via Resend failed:", message);

    throw new Error(`Resend failed: ${message}`);
  }
};

export const sendOtp = async (
  email: string,
  otp: string,
  purpose: OtpPurpose,
): Promise<void> => {
  const isPasswordReset = purpose === "password_reset";

  const subject = isPasswordReset
    ? "Your password reset code"
    : "Verify your email address";

  const heading = isPasswordReset
    ? "Password Reset"
    : "Email Verification";

  const description = isPasswordReset
    ? "Use the code below to reset your password."
    : "Use the code below to verify your email address.";

  const expiryMinutes = 10;

  const text = [
    heading,
    "",
    description,
    "",
    `Your OTP is: ${otp}`,
    "",
    `This code expires in ${expiryMinutes} minutes.`,
    "If you did not request this code, you can safely ignore this email.",
  ].join("\n");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${heading}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif;">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
          <h2 style="color:#18181b;margin-top:0;">${heading}</h2>
          <p style="color:#52525b;line-height:1.6;">${description}</p>
          <div style="margin:24px 0;padding:20px;background:#f4f4f5;border-radius:8px;text-align:center;">
            <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#18181b;">
              ${otp.replace(/[&<>"']/g, (char) => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              })[char]!)}
            </span>
          </div>
          <p style="color:#52525b;line-height:1.6;">
            This code expires in ${expiryMinutes} minutes.
          </p>
          <p style="color:#71717a;font-size:13px;line-height:1.6;">
            If you did not request this code, you can safely ignore this email.
            Do not share this code with anyone.
          </p>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject,
    text,
    html,
  });
};
