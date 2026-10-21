import { Router } from "express";
import rateLimit from "express-rate-limit";
import { ttsController } from "./tts.controller.ts";
import { middleWareProtection } from "../../../middleware/jwtMiddleware.ts";

const router = Router();

router.use(middleWareProtection);

// Generation costs money: cap it per user (not per IP)
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user!.id,
  message: {
    success: false,
    message: "You've reached the hourly limit for AI voice generation. Please try again later.",
  },
});

/**
 * @openapi
 * /api/v1/tts/voices:
 *   get:
 *     tags: [AI Text-to-Speech]
 *     summary: List languages, voices (with gender) and vocal styles for the voice picker
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200": { description: Voice catalog }
 */
router.get("/voices", ttsController.voices);

/**
 * @openapi
 * /api/v1/tts:
 *   post:
 *     tags: [AI Text-to-Speech]
 *     summary: Turn text into a voice note (flagged isAiGenerated)
 *     description: Up to 1500 characters. The result is saved to the user's voice notes with isAiGenerated true.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text, voice]
 *             properties:
 *               text: { type: string, example: "Hey! Just a reminder about dinner on Friday." }
 *               voice: { type: string, example: troy, description: "See GET /tts/voices" }
 *               style: { type: string, example: cheerful, description: "English voices only" }
 *               title: { type: string }
 *     responses:
 *       "201": { description: AI voice note created }
 *       "400": { description: Invalid input / unsupported style / text too long }
 *       "429": { description: Hourly generation limit reached }
 *       "502": { description: Voice provider failed }
 *       "503": { description: Voice provider busy }
 */
router.post("/", generateLimiter, ttsController.generate);

export default router;