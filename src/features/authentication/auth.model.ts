import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.ts";
import { config } from "../../../config/env.ts";
import { storage, BUCKETS } from "../../../utils/storage.ts";

/* ------------------------------------------------------------------ */
/* Constants & types                                                   */
/* ------------------------------------------------------------------ */

export type OtpPurpose = "email_verification" | "password_reset";


export const OTP_TTL_MINUTES = config.otpTtlMinutes;
export const OTP_RESEND_COOLDOWN_SECONDS = config.otpResendCooldownSeconds;

export const ACCESS_TOKEN_EXPIRES_IN_SECONDS =
  config.accessTokenExpiresInSeconds;

export const REFRESH_TOKEN_TTL_DAYS = config.refreshTokenTtlDays;

export const REFRESH_TOKEN_EXPIRES_IN_SECONDS =
  REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

const BCRYPT_ROUNDS = config.bcryptRounds;
/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

/** Placeholder username from the email, e.g. "john_a3f9c2". User can change it later. */
const generateUsername = (email: string): string => {
  const base =
    (email.split("@")[0] ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20) || "user";

  return `${base}_${crypto.randomBytes(3).toString("hex")}`;
};

export const userModel = {
  findByEmail(email: string) {
    return prisma.users.findUnique({ where: { email } });
  },

  findById(id: string) {
    return prisma.users.findUnique({ where: { id } });
  },

  create(data: { email: string; passwordHash: string }) {
    return prisma.users.create({
      data: {
        username: generateUsername(data.email),
        email: data.email,
        password_hash: data.passwordHash,
        auth_provider: "email",
        email_verified: false,
        status: "active",
      },
    });
  },

  updatePassword(id: string, passwordHash: string) {
    return prisma.users.update({
      where: { id },
      data: { password_hash: passwordHash },
    });
  },

  updateLastLogin(id: string) {
    return prisma.users.update({
      where: { id },
      data: { last_login_at: new Date() },
    });
  },

  /** Marks the email verified AND burns the OTP in one transaction. */
  async verifyEmailWithOtp(userId: string, otpId: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const burned = await tx.otp_codes.updateMany({
        where: { id: otpId, used_at: null },
        data: { used_at: new Date() },
      });
      if (burned.count === 0) return false; // someone else already used it

      await tx.users.update({
        where: { id: userId },
        data: { email_verified: true },
      });
      return true;
    });
  },

  /** Sets the new password AND burns the OTP in one transaction. */
  async resetPasswordWithOtp(
    userId: string,
    otpId: string,
    passwordHash: string,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const burned = await tx.otp_codes.updateMany({
        where: { id: otpId, used_at: null },
        data: { used_at: new Date() },
      });
      if (burned.count === 0) return false;

      await tx.users.update({
        where: { id: userId },
        data: { password_hash: passwordHash },
      });

      // A password reset must kill every existing session
      await tx.refresh_tokens.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      return true;
    });
  },

  /**
   * Hard delete. otp_codes, refresh_tokens and voice_notes rows go with it via
   * ON DELETE CASCADE; the files in Supabase Storage are removed afterwards.
   */
  async delete(id: string) {
    // Collect storage paths BEFORE the cascade wipes the rows that hold them
    const [owner, notes] = await Promise.all([
      prisma.users.findUnique({ where: { id }, select: { avatar_path: true } }),
      prisma.voice_notes.findMany({
        where: { user_id: id },
        select: { storage_key: true },
      }),
    ]);

    const deleted = await prisma.users.delete({ where: { id } });

    // Best effort: a storage hiccup must not undo a successful account deletion
    await storage.remove(
      BUCKETS.voiceNotes,
      notes.map((note) => note.storage_key),
    );
    if (owner?.avatar_path) {
      await storage.remove(BUCKETS.images, [owner.avatar_path]);
    }

    return deleted;
  },
};

/* ------------------------------------------------------------------ */
/* OTP table access                                                    */
/* ------------------------------------------------------------------ */

export const otpModel = {
  /** Invalidate any still-active codes for this email+purpose, then create a fresh one. */
  async replace(data: {
    userId: string;
    email: string;
    purpose: OtpPurpose;
    codeHash: string;
    expiresAt: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.otp_codes.updateMany({
        where: { email: data.email, purpose: data.purpose, used_at: null },
        data: { used_at: new Date() },
      });

      return tx.otp_codes.create({
        data: {
          user_id: data.userId,
          email: data.email,
          purpose: data.purpose,
          code_hash: data.codeHash,
          expires_at: data.expiresAt,
        },
      });
    });
  },

  findLatest(email: string, purpose: OtpPurpose) {
    return prisma.otp_codes.findFirst({
      where: { email, purpose },
      orderBy: { created_at: "desc" },
    });
  },

  findLatestActive(email: string, purpose: OtpPurpose) {
    return prisma.otp_codes.findFirst({
      where: {
        email,
        purpose,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: "desc" },
    });
  },

  incrementAttempts(id: string) {
    return prisma.otp_codes.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  },
};

/* ------------------------------------------------------------------ */
/* Password + token helpers                                            */
/* ------------------------------------------------------------------ */

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, BCRYPT_ROUNDS);

export const comparePassword = (
  password: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(password, hash);

export const generateAccessToken = (userId: string, email: string): string =>
  jwt.sign({ email }, config.jwtAccessSecret, {
    subject: userId,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    issuer: "voice-note-api",
    audience: "voice-note-client",
  });

/* ------------------------------------------------------------------ */
/* OTP service                                                         */
/* ------------------------------------------------------------------ */

const generateOtp = (): string => crypto.randomInt(100000, 1000000).toString();

/** HMAC so a leaked DB can't be brute-forced from the 1M possible codes. */
const hashOtp = (email: string, code: string): string =>
  crypto
    .createHmac("sha256", config.jwtAccessSecret)
    .update(`${email}:${code}`)
    .digest("hex");

const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

/** MOCK: replace with a real email provider (Resend, SES, Nodemailer...). */
export const sendOtp = async (
  email: string,
  otp: string,
  purpose: OtpPurpose,
): Promise<void> => {
  console.log(`[MOCK OTP] purpose=${purpose} email=${email} otp=${otp}`);
};

/** True if the last OTP was sent too recently. */
export const isOnCooldown = async (
  email: string,
  purpose: OtpPurpose,
): Promise<boolean> => {
  const last = await otpModel.findLatest(email, purpose);
  if (!last) return false;
  return (
    Date.now() - last.created_at.getTime() <
    OTP_RESEND_COOLDOWN_SECONDS * 1000
  );
};

export const issueOtp = async (
  userId: string,
  email: string,
  purpose: OtpPurpose,
): Promise<void> => {
  const code = generateOtp();

  await otpModel.replace({
    userId,
    email,
    purpose,
    codeHash: hashOtp(email, code),
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
  });

  await sendOtp(email, code, purpose);
};

/**
 * Returns the matching OTP row, or null if missing/expired/used/locked/wrong.
 * Wrong guesses increment `attempts`; after max_attempts the code is dead.
 */
export const verifyOtp = async (
  email: string,
  purpose: OtpPurpose,
  code: string,
) => {
  const otp = await otpModel.findLatestActive(email, purpose);
  if (!otp) return null;
  if (otp.attempts >= otp.max_attempts) return null;

  if (!safeEqual(otp.code_hash, hashOtp(email, code))) {
    await otpModel.incrementAttempts(otp.id);
    return null;
  }

  return otp;
};


/* ------------------------------------------------------------------ */
/* Refresh tokens                                                      */
/* ------------------------------------------------------------------ */

export const refreshTokenModel = {
  create(data: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return prisma.refresh_tokens.create({
      data: {
        user_id: data.userId,
        family_id: data.familyId,
        token_hash: data.tokenHash,
        expires_at: data.expiresAt,
      },
    });
  },

  findByHash(tokenHash: string) {
    return prisma.refresh_tokens.findUnique({
      where: { token_hash: tokenHash },
    });
  },

  /** Revokes the old token and creates its replacement in one transaction. */
  async rotate(
    oldId: string,
    data: {
      userId: string;
      familyId: string;
      tokenHash: string;
      expiresAt: Date;
    },
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const revoked = await tx.refresh_tokens.updateMany({
        where: { id: oldId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      if (revoked.count === 0) return false; // already used by a concurrent request

      await tx.refresh_tokens.create({
        data: {
          user_id: data.userId,
          family_id: data.familyId,
          token_hash: data.tokenHash,
          expires_at: data.expiresAt,
        },
      });
      return true;
    });
  },

  revokeFamily(familyId: string) {
    return prisma.refresh_tokens.updateMany({
      where: { family_id: familyId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  },
};

const generateRefreshToken = (): string =>
  crypto.randomBytes(48).toString("base64url");

/** Plain SHA-256 is fine here: the token is 384 bits of randomness. */
const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

const refreshExpiry = (): Date =>
  new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_SECONDS * 1000);

/** Called on login: starts a new session (new token family). */
export const issueTokenPair = async (user: { id: string; email: string }) => {
  const refreshToken = generateRefreshToken();

  await refreshTokenModel.create({
    userId: user.id,
    familyId: crypto.randomUUID(),
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiry(),
  });

  return {
    accessToken: generateAccessToken(user.id, user.email),
    refreshToken,
  };
};

/**
 * Exchanges a refresh token for a new access + refresh pair (rotation).
 * - "reuse": a token that was already rotated was presented again, which
 *   suggests theft, so the whole session family is revoked.
 */
export const rotateRefreshToken = async (rawToken: string) => {
  const existing = await refreshTokenModel.findByHash(hashToken(rawToken));
  if (!existing) return { status: "invalid" } as const;

  if (existing.revoked_at) {
    await refreshTokenModel.revokeFamily(existing.family_id);
    return { status: "reuse" } as const;
  }

  if (existing.expires_at <= new Date()) return { status: "invalid" } as const;

  const user = await userModel.findById(existing.user_id);
  if (
    !user ||
    user.status !== "active" ||
    user.auth_provider !== "email" ||
    !user.email_verified
  ) {
    await refreshTokenModel.revokeFamily(existing.family_id);
    return { status: "invalid" } as const;
  }

  const newRefreshToken = generateRefreshToken();

  const rotated = await refreshTokenModel.rotate(existing.id, {
    userId: user.id,
    familyId: existing.family_id,
    tokenHash: hashToken(newRefreshToken),
    expiresAt: refreshExpiry(),
  });

  if (!rotated) {
    // Lost a race with another request using the same token
    await refreshTokenModel.revokeFamily(existing.family_id);
    return { status: "reuse" } as const;
  }

  return {
    status: "ok",
    accessToken: generateAccessToken(user.id, user.email),
    refreshToken: newRefreshToken,
  } as const;
};

/** Logout: revokes this token's whole session family. Silent if unknown. */
export const revokeRefreshToken = async (rawToken: string): Promise<void> => {
  const existing = await refreshTokenModel.findByHash(hashToken(rawToken));
  if (existing) await refreshTokenModel.revokeFamily(existing.family_id);
};