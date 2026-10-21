import type { Response } from "express";
import type { ZodError } from "zod";

export const validationError = (res: Response, error: ZodError) =>
  res.status(400).json({
    success: false,
    message: "Invalid request data",
    errors: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });

export const serverError = (res: Response, label: string, error: unknown) => {
  console.error(`${label} failed:`, error);
  return res.status(500).json({
    success: false,
    message: `An unexpected error occurred during ${label}`,
  });
};