import { z } from "zod";

// multipart text fields arrive as strings, hence coerce
export const uploadVoiceNoteSchema = z.object({
  title: z.string().trim().max(120, "Title must be at most 120 characters").optional(),
  durationSeconds: z.coerce
    .number()
    .int("Duration must be a whole number of seconds")
    .min(0)
    .max(60 * 60 * 24)
    .optional(),
});

export const listVoiceNotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // "request" = only recordings received through one-time links (your inbox)
  source: z.enum(["own", "request"]).optional(),
});

export const voiceNoteIdParamSchema = z.object({
  id: z.string().uuid("Invalid voice note id"),
});