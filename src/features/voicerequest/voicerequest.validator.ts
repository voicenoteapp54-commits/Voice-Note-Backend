import { z } from "zod";

export const createRequestSchema = z.object({
  recipientName: z.string().trim().max(80, "Name must be at most 80 characters").optional(),
  message: z.string().trim().max(200, "Message must be at most 200 characters").optional(),
  expiresInHours: z.coerce.number().int().min(1).max(72).default(48),
});

export const requestIdParamSchema = z.object({
  id: z.string().uuid("Invalid request id"),
});

// Sent by the public recording page (multipart text fields => strings)
export const submitRecordingSchema = z.object({
  senderName: z.string().trim().max(80, "Name must be at most 80 characters").optional(),
  durationSeconds: z.coerce.number().int().min(0).max(600).optional(),
});