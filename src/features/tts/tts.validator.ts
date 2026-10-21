import { z } from "zod";
import { MAX_TEXT_CHARS, STYLES, VOICE_IDS } from "../../../utils/ttsCatalog.ts";

export const generateSpeechSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Text is required")
    .max(MAX_TEXT_CHARS, `Text must be at most ${MAX_TEXT_CHARS} characters`),
  voice: z.enum(VOICE_IDS, { message: `Voice must be one of: ${VOICE_IDS.join(", ")}` }),
  style: z.enum(STYLES, { message: `Style must be one of: ${STYLES.join(", ")}` }).optional(),
  title: z.string().trim().max(120, "Title must be at most 120 characters").optional(),
});