import type { Request, Response } from "express";
import { voiceNoteModel } from "./voicenote.model.ts";
import {
  uploadVoiceNoteSchema,
  listVoiceNotesQuerySchema,
  voiceNoteIdParamSchema,
} from "./voicenote.validator.ts";
import { validationError, serverError } from "../../../utils/httpHelper.ts";

export const voiceNoteController = {
   async upload(req: Request, res: Response) {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No audio file uploaded (send it as multipart field "audio")',
      });
    }

    const validation = uploadVoiceNoteSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const voiceNote = await voiceNoteModel.create(
        req.user!.id,
        req.file,
        validation.data,
      );

      return res.status(201).json({
        success: true,
        message: "Voice note uploaded successfully",
        data: { voiceNote },
      });
    } catch (error: unknown) {
      return serverError(res, "voice note upload", error);
    }
  },

  // ------------------------------------------------------------------- LIST
  async list(req: Request, res: Response) {
    const validation = listVoiceNotesQuerySchema.safeParse(req.query);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const { items, pagination } = await voiceNoteModel.list(
        req.user!.id,
        validation.data,
      );

      return res.status(200).json({
        success: true,
        data: { voiceNotes: items, pagination },
      });
    } catch (error: unknown) {
      return serverError(res, "voice note listing", error);
    }
  },

  // -------------------------------------------------------------------- GET
  async getOne(req: Request, res: Response) {
    const validation = voiceNoteIdParamSchema.safeParse(req.params);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const voiceNote = await voiceNoteModel.findOne(
        req.user!.id,
        validation.data.id,
      );

      if (!voiceNote) {
        return res
          .status(404)
          .json({ success: false, message: "Voice note not found" });
      }

      return res.status(200).json({ success: true, data: { voiceNote } });
    } catch (error: unknown) {
      return serverError(res, "voice note fetch", error);
    }
  },

  // ----------------------------------------------------------------- DELETE
  async remove(req: Request, res: Response) {
    const validation = voiceNoteIdParamSchema.safeParse(req.params);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const deleted = await voiceNoteModel.delete(
        req.user!.id,
        validation.data.id,
      );

      if (!deleted) {
        return res
          .status(404)
          .json({ success: false, message: "Voice note not found" });
      }

      return res.status(200).json({
        success: true,
        message: "Voice note deleted successfully",
      });
    } catch (error: unknown) {
      return serverError(res, "voice note deletion", error);
    }
  },
};