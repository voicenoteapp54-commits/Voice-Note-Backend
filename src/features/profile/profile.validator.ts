import { z } from "zod";

export const updateProfileSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9_]{3,30}$/,
        "Username must be 3-30 characters: letters, numbers, underscores",
      )
      .optional(),
    fullName: z
      .string()
      .trim()
      .min(1, "Full name cannot be empty")
      .max(100, "Full name must be at most 100 characters")
      .optional(),
  })
  .refine((data) => data.username !== undefined || data.fullName !== undefined, {
    message: "Provide at least one field to update (username, fullName)",
  });