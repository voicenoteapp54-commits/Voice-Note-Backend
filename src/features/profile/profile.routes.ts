import { Router } from "express";
import { profileController } from "./profile.controller.ts";
import { middleWareProtection } from "../../../middleware/jwtMiddleware.ts";
import { uploadImage } from "../../../middleware/uploadMiddleware.ts";

const router = Router();

// Every profile route requires a valid Bearer token
router.use(middleWareProtection);

/**
 * @openapi
 * /api/v1/profile/me:
 *   get:
 *     tags: [Profile]
 *     summary: Get the logged-in user's profile (username, name, avatar, voice note count)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200": { description: Profile returned }
 *       "401": { description: Missing or invalid token }
 *       "404": { description: User not found }
 */
router.get("/me", profileController.getMe);

/**
 * @openapi
 * /api/v1/profile/me:
 *   patch:
 *     tags: [Profile]
 *     summary: Edit username and/or full name
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string, example: john_doe }
 *               fullName: { type: string, example: John Doe }
 *     responses:
 *       "200": { description: Profile updated }
 *       "400": { description: Invalid request data }
 *       "409": { description: Username already taken }
 */
router.patch("/me", profileController.updateMe);

/**
 * @openapi
 * /api/v1/profile/avatar:
 *   put:
 *     tags: [Profile]
 *     summary: Upload or replace the profile image (JPEG/PNG/WebP, max 5 MB)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       "200": { description: Profile image updated }
 *       "400": { description: Missing or invalid image }
 *       "413": { description: Image too large }
 */
router.put("/avatar", uploadImage, profileController.uploadAvatar);

/**
 * @openapi
 * /api/v1/profile/avatar:
 *   delete:
 *     tags: [Profile]
 *     summary: Remove the profile image
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200": { description: Profile image removed }
 */
router.delete("/avatar", profileController.removeAvatar);

export default router;