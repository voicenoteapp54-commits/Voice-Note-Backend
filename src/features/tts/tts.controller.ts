import type { Request, Response } from "express";
import { ttsModel, TtsProviderError } from "./tts.model.ts";
import { generateSpeechSchema } from "../../../src/features/tts/tts.validator.ts";
import { validationError, serverError } from "../../../utils/httpHelper.ts";

export const ttsController = {
  // ----------------------------------------------------------------- VOICES
  voices(_req: Request, res: Response) {
    return res.status(200).json({ success: true, data: ttsModel.getCatalog() });
  },

  // --------------------------------------------------------------- GENERATE
  async generate(req: Request, res: Response) {
    const validation = generateSpeechSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const result = await ttsModel.generate(req.user!.id, validation.data);

      if (result.status === "style_not_supported") {
        return res.status(400).json({
          success: false,
          message: "Vocal styles are only available for English voices",
        });
      }

      if (result.status === "empty_text") {
        return res.status(400).json({
          success: false,
          message: "The text has nothing to speak",
        });
      }

      if (result.status === "too_long") {
        return res.status(400).json({
          success: false,
          message: "Text is too long to generate in one request. Please shorten it.",
        });
      }

      return res.status(201).json({
        success: true,
        message: "AI voice note generated successfully",
        data: { voiceNote: result.voiceNote },
      });
    } catch (error: unknown) {
      if (error instanceof TtsProviderError) {
        console.error("TTS provider error:", error.status, error.message);

        return res.status(error.status === 429 ? 503 : 502).json({
          success: false,
          message:
            error.status === 429
              ? "Voice generation is busy right now. Please try again shortly."
              : "The voice generation service failed. Please try again.",
        });
      }

      return serverError(res, "speech generation", error);
    }
  },
};