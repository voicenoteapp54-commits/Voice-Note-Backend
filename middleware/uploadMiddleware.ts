import multer from "multer";
import type { RequestHandler } from "express";

export const MAX_AUDIO_SIZE_MB = 25;
export const MAX_IMAGE_SIZE_MB = 5;

class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.toLowerCase().startsWith("audio/")) return cb(null, true);
    cb(new UploadValidationError("Only audio files are allowed"));
  },
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype.toLowerCase())) {
      return cb(null, true);
    }
    cb(new UploadValidationError("Only JPEG, PNG or WebP images are allowed"));
  },
});

/** Wraps multer so its errors come back as clean JSON instead of an HTML 500. */
const singleFile =
  (upload: multer.Multer, field: string): RequestHandler =>
  (req, res, next) => {
    upload.single(field)(req, res, (error: unknown) => {
      if (!error) return next();

      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return res
            .status(413)
            .json({ success: false, message: "File is too large" });
        }
        if (error.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            success: false,
            message: `Unexpected file field. Send the file under the "${field}" field`,
          });
        }
        return res.status(400).json({ success: false, message: error.message });
      }

      if (error instanceof UploadValidationError) {
        return res.status(400).json({ success: false, message: error.message });
      }

      return next(error);
    });
  };

export const uploadAudio = singleFile(audioUpload, "audio");
export const uploadImage = singleFile(imageUpload, "image");