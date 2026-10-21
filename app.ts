
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

import authRoutes from "./src/features/authentication/auth.routes.ts";
import profileRoutes from "./src/features/profile/profile.routes.ts";
import voiceNoteRoutes from "./src/features/voicenote/voicenote.route.ts";
import voiceRequestRoutes, {
  publicRecordingRouter,
} from "./src/features/voicerequest/voicerequest.route.ts";
import ttsRoutes from "./src/features/tts/tts.route.ts";

import { swaggerSpec } from "./config/swagger.ts";

const app = express();

/**
 * CORS allowlist.
 * Replace these examples with your actual frontend origins.
 * Include the scheme and port where applicable.
 */
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "",
]);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin header (e.g. server-to-server,
      // curl, and some native clients). CORS is a browser policy, not auth.
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    optionsSuccessStatus: 204,
  }),
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    message: "VoiceNote API is running",
  });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Authenticated API routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/voice-notes", voiceNoteRoutes);
app.use("/api/v1/voice-requests", voiceRequestRoutes);
app.use("/api/v1/tts", ttsRoutes);

// Public recording page and submission routes
app.use(publicRecordingRouter);

// Fallback for unmatched routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// CORS error handler
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (error instanceof Error && error.message === "Origin not allowed by CORS") {
      return res.status(403).json({
        success: false,
        message: "Origin not allowed",
      });
    }

    return next(error);
  },
);

export default app;
