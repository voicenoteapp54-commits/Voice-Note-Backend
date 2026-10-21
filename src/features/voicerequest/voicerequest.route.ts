import { Router } from "express";
import rateLimit from "express-rate-limit";
import { voiceRequestController } from "./voicerequest.controller.ts";
import { middleWareProtection } from "../../../middleware/jwtMiddleware.ts";
import { uploadAudio } from "../../../middleware/uploadMiddleware.ts";

/* ------------------------------------------------------------------ */
/* Authenticated: mount at /api/v1/requests                            */
/* ------------------------------------------------------------------ */

const router = Router();
router.use(middleWareProtection);

/**
 * @openapi
 * /api/v1/voice-requests:
 *   post:
 *     tags: [Voice Requests]
 *     summary: Create a one-time recording link to send to someone
 *     description: The link is returned once and is not retrievable later. Valid for 1-72 hours (default 48) and works a single time.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipientName: { type: string, example: Mom }
 *               message: { type: string, example: Tell me about your day! }
 *               expiresInHours: { type: integer, default: 48, minimum: 1, maximum: 72 }
 *     responses:
 *       "201": { description: Request created, includes the shareable link }
 *       "400": { description: Invalid request data }
 */
router.post("/", voiceRequestController.create);

/**
 * @openapi
 * /api/v1/voice-requests:
 *   get:
 *     tags: [Voice Requests]
 *     summary: List your recent requests and their status (pending / fulfilled / expired / cancelled)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200": { description: Requests returned }
 */
router.get("/", voiceRequestController.list);

/**
 * @openapi
 * /api/v1/voice-requests/{id}:
 *   delete:
 *     tags: [Voice Requests]
 *     summary: Cancel a pending request (kills the link)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       "200": { description: Cancelled }
 *       "404": { description: Not found }
 *       "409": { description: Request is no longer pending }
 */
router.delete("/:id", voiceRequestController.cancel);

export default router;

/* ------------------------------------------------------------------ */
/* Public: mount at the app root  ->  app.use(publicRecordingRouter)   */
/* ------------------------------------------------------------------ */

const tooMany = {
  success: false,
  message: "Too many requests. Please try again later.",
};

const pageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooMany,
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooMany,
});

export const publicRecordingRouter = Router();

// The recording web page
publicRecordingRouter.get("/r/:token", pageLimiter, voiceRequestController.page);

/**
 * @openapi
 * /api/v1/public/voice-requests/{token}/submit:
 *   post:
 *     tags: [Voice Requests]
 *     summary: Submit a recording through a one-time link (no account needed)
 *     parameters:
 *       - { in: path, name: token, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [audio]
 *             properties:
 *               audio: { type: string, format: binary }
 *               senderName: { type: string }
 *               durationSeconds: { type: integer }
 *     responses:
 *       "201": { description: Recording delivered, link burned }
 *       "404": { description: Invalid link }
 *       "410": { description: Link expired, cancelled or already used }
 *       "429": { description: Rate limited }
 */
publicRecordingRouter.post(
  "/api/v1/public/requests/:token/submit",
  submitLimiter,
  voiceRequestController.ensureActiveToken, // reject bad links BEFORE buffering the upload
  uploadAudio,
  voiceRequestController.submit,
);