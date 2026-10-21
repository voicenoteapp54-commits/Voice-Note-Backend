
import express from "express";
import swaggerUi from "swagger-ui-express";

import authRoutes from "./src/features/authentication/auth.routes.ts";
import profileRoutes from "./src/features/profile/profile.routes.ts";
import voiceNoteRoutes from "./src/features/voicenote/voicenote.route.ts";
import voiceRequestRoutes, {
  publicRecordingRouter,
} from "./src/features/voicerequest//voicerequest.route.ts";
import ttsRoutes from "./src/features/tts/tts.route.ts";

import { swaggerSpec } from "./config/swagger.ts";

const app = express();

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


// Public recording page: GET /r/:token
// Public submission: POST /api/v1/public/voice-requests/:token/submit
app.use(publicRecordingRouter);

// Fallback for unmatched routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

export default app;
