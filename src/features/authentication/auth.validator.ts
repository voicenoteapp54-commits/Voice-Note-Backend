import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Invalid email address");

// bcrypt only uses the first 72 bytes, so cap there
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

const otp = z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z.object({ email, password });

export const verifyOtpSchema = z.object({ email, otp });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  email,
  otp,
  newPassword: password,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});