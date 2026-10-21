import { Router } from "express";
import { authController } from "./auth.controller.ts";
import { middleWareProtection } from "../../../middleware/jwtMiddleware.ts";

const router = Router();

/**
 * @openapi
 * /api/v1/auth/signup:
 *   post:
 *     tags: [Authentication]
 *     summary: Create an account and send a verification OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: user@example.com }
 *               password: { type: string, format: password, example: YourPassword123! }
 *     responses:
 *       "201": { description: Account created, OTP sent }
 *       "400": { description: Invalid request data }
 *       "409": { description: Email already registered }
 *       "429": { description: OTP requested too soon }
 */
router.post("/signup", authController.signup);

/**
 * @openapi
 * /api/v1/auth/verify-email:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify email with the OTP sent at signup
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string, format: email }
 *               otp: { type: string, example: "123456" }
 *     responses:
 *       "200": { description: Email verified }
 *       "400": { description: Invalid or expired OTP }
 */
router.post("/verify-email", authController.verifyEmail);

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Log in with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       "200": { description: Login successful }
 *       "401": { description: Invalid email or password }
 *       "403": { description: Account inactive, unverified, or uses another provider }
 */
router.post("/login", authController.login);

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Authentication]
 *     summary: Exchange a refresh token for a new access + refresh token pair
 *     description: Refresh tokens are single-use (rotated). Reusing an old one revokes the whole session.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       "200": { description: New token pair issued }
 *       "400": { description: Invalid request data }
 *       "401": { description: Invalid, expired, or reused refresh token }
 */
router.post("/refresh", authController.refresh);

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Log out by revoking the session's refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       "200": { description: Logged out }
 *       "400": { description: Invalid request data }
 */
router.post("/logout", authController.logout);

/**
 * @openapi
 * /api/v1/auth/forgot-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Request a password reset OTP
 *     description: Always returns 200 so account existence is not leaked.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       "200": { description: OTP sent if the account exists }
 */
router.post("/forgot-password", authController.forgotPassword);

/**
 * @openapi
 * /api/v1/auth/reset-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Reset password using email + OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, newPassword]
 *             properties:
 *               email: { type: string, format: email }
 *               otp: { type: string, example: "123456" }
 *               newPassword: { type: string, format: password }
 *     responses:
 *       "200": { description: Password reset }
 *       "400": { description: Invalid or expired OTP / invalid data }
 */
router.post("/reset-password", authController.resetPassword);

/**
 * @openapi
 * /api/v1/auth/account:
 *   delete:
 *     tags: [Authentication]
 *     summary: Permanently delete the logged-in user's account
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, format: password }
 *     responses:
 *       "200": { description: Account deleted }
 *       "401": { description: Missing/invalid token or wrong password }
 *       "404": { description: User not found }
 */
router.delete("/account", middleWareProtection, authController.deleteAccount);

export default router;