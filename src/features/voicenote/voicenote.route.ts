import { Router } from "express";
import { voiceNoteController } from "./voicenote.controller.ts";
import { middleWareProtection } from "../../../middleware/jwtMiddleware.ts";
import { uploadAudio } from "../../../middleware/uploadMiddleware.ts";

const router = Router();

// Every voice note route requires a valid Bearer token
router.use(middleWareProtection);

/**
 * @openapi
 * /api/v1/voice-notes:
 *   post:
 *     tags: [Voice Notes]
 *     summary: Upload a voice note (audio/*, max 25 MB)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [audio]
 *             properties:
 *               audio: { type: string, format: binary }
 *               title: { type: string, example: Meeting recap }
 *               durationSeconds: { type: integer, example: 93 }
 *     responses:
 *       "201": { description: Voice note uploaded }
 *       "400": { description: Missing/invalid file or fields }
 *       "413": { description: File too large }
 */
router.post("/", uploadAudio, voiceNoteController.upload);

/**
 * @openapi
 * /api/v1/voice-notes:
 *   get:
 *     tags: [Voice Notes]
 *     summary: List the logged-in user's voice notes (newest first)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }
 *     responses:
 *       "200": { description: Voice notes with fresh signed audio URLs }
 */
router.get("/", voiceNoteController.list);

/**
 * @openapi
 * /api/v1/voice-notes/{id}:
 *   get:
 *     tags: [Voice Notes]
 *     summary: Get one voice note with a fresh signed audio URL
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       "200": { description: Voice note returned }
 *       "404": { description: Not found }
 */
router.get("/:id", voiceNoteController.getOne);

/**
 * @openapi
 * /api/v1/voice-notes/{id}:
 *   delete:
 *     tags: [Voice Notes]
 *     summary: Delete a voice note and its audio file
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       "200": { description: Deleted }
 *       "404": { description: Not found }
 */
router.delete("/:id", voiceNoteController.remove);

export default router;