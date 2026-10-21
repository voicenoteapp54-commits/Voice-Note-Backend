import { prisma } from "../../lib/prisma.ts";
import {
  storage,
  BUCKETS,
  buildStorageKey,
  normalizeMime,
} from "../../../utils/storage.ts";

type UploadedFile = Express.Multer.File;

type UserRow = {
  id: string;
  username: string | null;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_path: string | null;
  email_verified: boolean;
  created_at: Date | null;
};

const prismaErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;

/** Uploaded avatar wins (fresh signed URL); falls back to a social-login avatar_url. */
const toProfile = async (user: UserRow, voiceNoteCount: number) => {
  const signed = user.avatar_path
    ? await storage.getSignedUrl(BUCKETS.images, user.avatar_path)
    : null;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    avatarUrl: signed ?? user.avatar_url,
    emailVerified: user.email_verified,
    createdAt: user.created_at,
    voiceNoteCount,
  };
};

const countNotes = (userId: string) =>
  prisma.voice_notes.count({ where: { user_id: userId } });

export const profileModel = {
  async getProfile(userId: string) {
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return null;

    return toProfile(user, await countNotes(userId));
  },

  async updateProfile(
    userId: string,
    data: { username?: string | undefined; fullName?: string | undefined },
  ) {
    try {
      const user = await prisma.users.update({
        where: { id: userId },
        data: {
          ...(data.username !== undefined && { username: data.username }),
          ...(data.fullName !== undefined && { full_name: data.fullName }),
        },
      });

      return {
        status: "ok",
        profile: await toProfile(user, await countNotes(userId)),
      } as const;
    } catch (error: unknown) {
      const code = prismaErrorCode(error);
      if (code === "P2002") return { status: "username_taken" } as const;
      if (code === "P2025") return { status: "not_found" } as const;
      throw error;
    }
  },

  /** Uploads the new image, points the user at it, then deletes the old one. */
  async setAvatar(userId: string, file: UploadedFile) {
    const current = await prisma.users.findUnique({
      where: { id: userId },
      select: { avatar_path: true },
    });
    if (!current) return null;

    const key = buildStorageKey("avatars", userId, file);
    await storage.upload(
      BUCKETS.images,
      key,
      file.buffer,
      normalizeMime(file.mimetype),
    );

    const user = await prisma.users
      .update({ where: { id: userId }, data: { avatar_path: key } })
      .catch(async (error: unknown) => {
        await storage.remove(BUCKETS.images, [key]); // don't leave an orphan
        throw error;
      });

    if (current.avatar_path) {
      await storage.remove(BUCKETS.images, [current.avatar_path]);
    }

    return toProfile(user, await countNotes(userId));
  },

  async removeAvatar(userId: string) {
    const current = await prisma.users.findUnique({
      where: { id: userId },
      select: { avatar_path: true },
    });
    if (!current) return null;

    const user = await prisma.users.update({
      where: { id: userId },
      data: { avatar_path: null },
    });

    if (current.avatar_path) {
      await storage.remove(BUCKETS.images, [current.avatar_path]);
    }

    return toProfile(user, await countNotes(userId));
  },
};