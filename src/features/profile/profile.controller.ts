import type { Request, Response } from "express";
import { profileModel } from "./profile.model.ts";
import { updateProfileSchema } from "./profile.validator.ts";
import { validationError, serverError } from "../../../utils/httpHelper.ts";

export const profileController = {
  // ------------------------------------------------------------ GET PROFILE
  async getMe(req: Request, res: Response) {
    try {
      const profile = await profileModel.getProfile(req.user!.id);

      if (!profile) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      return res.status(200).json({ success: true, data: { profile } });
    } catch (error: unknown) {
      return serverError(res, "profile fetch", error);
    }
  },

  // ---------------------------------------------------------- UPDATE PROFILE
  async updateMe(req: Request, res: Response) {
    const validation = updateProfileSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const result = await profileModel.updateProfile(
        req.user!.id,
        validation.data,
      );

      if (result.status === "username_taken") {
        return res.status(409).json({
          success: false,
          message: "That username is already taken",
        });
      }

      if (result.status === "not_found") {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: { profile: result.profile },
      });
    } catch (error: unknown) {
      return serverError(res, "profile update", error);
    }
  },

  // ----------------------------------------------------------- UPLOAD AVATAR
  async uploadAvatar(req: Request, res: Response) {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image uploaded (send it as multipart field "image")',
      });
    }

    try {
      const profile = await profileModel.setAvatar(req.user!.id, req.file);

      if (!profile) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      return res.status(200).json({
        success: true,
        message: "Profile image updated successfully",
        data: { profile },
      });
    } catch (error: unknown) {
      return serverError(res, "avatar upload", error);
    }
  },

  // ----------------------------------------------------------- REMOVE AVATAR
  async removeAvatar(req: Request, res: Response) {
    try {
      const profile = await profileModel.removeAvatar(req.user!.id);

      if (!profile) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      return res.status(200).json({
        success: true,
        message: "Profile image removed",
        data: { profile },
      });
    } catch (error: unknown) {
      return serverError(res, "avatar removal", error);
    }
  },
};