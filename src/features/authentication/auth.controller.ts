import type { Request, Response } from "express";
import type { ZodError } from "zod";
import {
  userModel,
  issueOtp,
  isOnCooldown,
  verifyOtp,
  hashPassword,
  comparePassword,
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  REFRESH_TOKEN_EXPIRES_IN_SECONDS,
} from "./auth.model.ts";
import {
  loginSchema,
  signupSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  deleteAccountSchema,
  refreshTokenSchema,
} from "./auth.validator.ts";

const validationError = (res: Response, error: ZodError) =>
  res.status(400).json({
    success: false,
    message: "Invalid request data",
    errors: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });

const serverError = (res: Response, label: string, error: unknown) => {
  console.error(`${label} failed:`, error);
  return res.status(500).json({
    success: false,
    message: `An unexpected error occurred during ${label}`,
  });
};

const INVALID_OTP = {
  success: false,
  message: "Invalid or expired OTP",
};

export const authController = {
  // ---------------------------------------------------------------- SIGNUP
  async signup(req: Request, res: Response) {
    const validation = signupSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const { email, password } = validation.data;

      const existing = await userModel.findByEmail(email);

      if (existing && (existing.email_verified || existing.auth_provider !== "email")) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists",
        });
      }

      if (existing && (await isOnCooldown(email, "email_verification"))) {
        return res.status(429).json({
          success: false,
          message: "Please wait a minute before requesting another OTP",
        });
      }

      const passwordHash = await hashPassword(password);

      // Unverified account re-signing up: take the new password and resend OTP
      const user = existing
        ? await userModel.updatePassword(existing.id, passwordHash)
        : await userModel.create({ email, passwordHash });

      await issueOtp(user.id, email, "email_verification");

      return res.status(201).json({
        success: true,
        message: "Account created. Check your email for the verification OTP.",
        data: { email },
      });
    } catch (error: unknown) {
      return serverError(res, "signup", error);
    }
  },

  // ------------------------------------------------------------ VERIFY OTP
  async verifyEmail(req: Request, res: Response) {
    const validation = verifyOtpSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const { email, otp } = validation.data;

      const user = await userModel.findByEmail(email);
      if (!user || user.auth_provider !== "email") {
        return res.status(400).json(INVALID_OTP);
      }

      if (user.email_verified) {
        return res.status(200).json({
          success: true,
          message: "Email is already verified",
        });
      }

      const otpRow = await verifyOtp(email, "email_verification", otp);
      if (!otpRow) return res.status(400).json(INVALID_OTP);

      const ok = await userModel.verifyEmailWithOtp(user.id, otpRow.id);
      if (!ok) return res.status(400).json(INVALID_OTP);

      return res.status(200).json({
        success: true,
        message: "Email verified successfully. You can now log in.",
      });
    } catch (error: unknown) {
      return serverError(res, "email verification", error);
    }
  },

  // ----------------------------------------------------------------- LOGIN
  async login(req: Request, res: Response) {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const { email, password } = validation.data;

      const user = await userModel.findByEmail(email);

      if (
        !user ||
        !user.password_hash ||
        !(await comparePassword(password, user.password_hash))
      ) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      if (
        user.status !== "active" ||
        user.auth_provider !== "email" ||
        !user.email_verified
      ) {
        return res.status(403).json({
          success: false,
          message:
            "This account cannot log in. Check your account status and verification.",
        });
      }

      const { accessToken, refreshToken } = await issueTokenPair(user);

      await userModel.updateLastLogin(user.id);

      return res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          accessToken,
          refreshToken,
          tokenType: "Bearer",
          expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
          refreshExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            avatarUrl: user.avatar_url,
            emailVerified: user.email_verified,
          },
        },
      });
    } catch (error: unknown) {
      return serverError(res, "login", error);
    }
  },

  // --------------------------------------------------------------- REFRESH
  async refresh(req: Request, res: Response) {
    const validation = refreshTokenSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const result = await rotateRefreshToken(validation.data.refreshToken);

      if (result.status !== "ok") {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired refresh token",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Token refreshed",
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          tokenType: "Bearer",
          expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
          refreshExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SECONDS,
        },
      });
    } catch (error: unknown) {
      return serverError(res, "token refresh", error);
    }
  },

  // ---------------------------------------------------------------- LOGOUT
  async logout(req: Request, res: Response) {
    const validation = refreshTokenSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      await revokeRefreshToken(validation.data.refreshToken);

      return res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error: unknown) {
      return serverError(res, "logout", error);
    }
  },

  // ------------------------------------------------------- FORGOT PASSWORD
  async forgotPassword(req: Request, res: Response) {
    const validation = forgotPasswordSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    // Same response whether or not the account exists (prevents email enumeration)
    const genericResponse = {
      success: true,
      message: "If an account exists for this email, a reset OTP has been sent.",
    };

    try {
      const { email } = validation.data;

      const user = await userModel.findByEmail(email);

      if (
        user &&
        user.status === "active" &&
        user.auth_provider === "email" &&
        user.email_verified &&
        !(await isOnCooldown(email, "password_reset"))
      ) {
        await issueOtp(user.id, email, "password_reset");
      }

      return res.status(200).json(genericResponse);
    } catch (error: unknown) {
      return serverError(res, "forgot password", error);
    }
  },

  // -------------------------------------------------------- RESET PASSWORD
  async resetPassword(req: Request, res: Response) {
    const validation = resetPasswordSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const { email, otp, newPassword } = validation.data;

      const user = await userModel.findByEmail(email);
      if (!user || user.status !== "active" || user.auth_provider !== "email") {
        return res.status(400).json(INVALID_OTP);
      }

      const otpRow = await verifyOtp(email, "password_reset", otp);
      if (!otpRow) return res.status(400).json(INVALID_OTP);

      const passwordHash = await hashPassword(newPassword);

      const ok = await userModel.resetPasswordWithOtp(user.id, otpRow.id, passwordHash);
      if (!ok) return res.status(400).json(INVALID_OTP);

      return res.status(200).json({
        success: true,
        message: "Password reset successful. You can now log in.",
      });
    } catch (error: unknown) {
      return serverError(res, "password reset", error);
    }
  },

  // ----------------------------------------------------------- DELETE USER
  async deleteAccount(req: Request, res: Response) {
    const validation = deleteAccountSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const userId = req.user!.id; // set by middleWareProtection
      const { password } = validation.data;

      const user = await userModel.findById(userId);

      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      if (
        !user.password_hash ||
        !(await comparePassword(password, user.password_hash))
      ) {
        return res.status(401).json({
          success: false,
          message: "Incorrect password",
        });
      }

      await userModel.delete(user.id);

      return res.status(200).json({
        success: true,
        message: "Account deleted successfully",
      });
    } catch (error: unknown) {
      return serverError(res, "account deletion", error);
    }
  },
};