import "dotenv/config";

const databaseUrl = process.env["DATABASE_URL"];
const caPEM = process.env["CA_PEM"];
const jwtAccessSecret = process.env["JWT_ACCESS_SECRET"];
const RESEND_API_KEY = process.env["RESEND_API_KEY"];
const RESEND_SENDER = process.env["RESEND_SENDER"];
const GROK_API_KEY = process.env["GROK_API_KEY"];
const otpTtlMinutes = Number(process.env["OTP_TTL_MINUTES"]);
const SUPABASE_URL = process.env["SUPABASE_URL"];
const SUPABASE_SECRET_KEY = process.env["SUPABASE_SECRET_KEY"];
const PUBLIC_RECORDING_BASE_URL=process.env["PUBLIC_RECORDING_BASE_URL"];
const otpResendCooldownSeconds = Number(
  process.env["OTP_RESEND_COOLDOWN_SECONDS"],
);
const accessTokenExpiresInSeconds = Number(
  process.env["ACCESS_TOKEN_EXPIRES_IN_SECONDS"],
);
const refreshTokenTtlDays = Number(process.env["REFRESH_TOKEN_TTL_DAYS"]);
const bcryptRounds = Number(process.env["BCRYPT_ROUNDS"]);

if (!databaseUrl || !caPEM || !jwtAccessSecret) {
  throw new Error(
    "One or more required environment variables are not configured",
  );
}

const numericSettings = {
  OTP_TTL_MINUTES: otpTtlMinutes,
  OTP_RESEND_COOLDOWN_SECONDS: otpResendCooldownSeconds,
  ACCESS_TOKEN_EXPIRES_IN_SECONDS: accessTokenExpiresInSeconds,
  REFRESH_TOKEN_TTL_DAYS: refreshTokenTtlDays,
  BCRYPT_ROUNDS: bcryptRounds,
};

for (const [name, value] of Object.entries(numericSettings)) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${name} must be a positive integer`);
  }
}

if (bcryptRounds < 4 || bcryptRounds > 31) {
  throw new Error("BCRYPT_ROUNDS must be between 4 and 31");
}

export const config = {
  databaseUrl,
  databaseCaCert: caPEM,
  jwtAccessSecret,
  RESEND_API_KEY,
  otpTtlMinutes,
  SUPABASE_URL, 
  GROK_API_KEY,
  SUPABASE_SECRET_KEY,
  RESEND_SENDER,
  otpResendCooldownSeconds,
  accessTokenExpiresInSeconds,
  publicRecordingBaseUrl: PUBLIC_RECORDING_BASE_URL,
  refreshTokenTtlDays,
  bcryptRounds,
};
