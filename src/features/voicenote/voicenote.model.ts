
import { prisma } from "../../lib/prisma.ts";
import {
  storage,
  BUCKETS,
  buildStorageKey,
  normalizeMime,
} from "../../../utils/storage.ts";

type UploadedFile = Express.Multer.File;

type NoteRow = {
  id: string;
  title: string | null;
  storage_key: string;
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  source: string;
  sender_name: string | null;
  created_at: Date;
};

/** Storage keys stay server-side; clients only get signed URLs. */
const toDto = (note: NoteRow, audioUrl: string | null) => ({
  id: note.id,
  title: note.title,
  fileName: note.original_filename,
  mimeType: note.mime_type,
  sizeBytes: note.size_bytes,
  durationSeconds: note.duration_seconds,
  source: note.source,
  senderName: note.sender_name,
  audioUrl,
  createdAt: note.created_at,
});

export const voiceNoteModel = {
  /** Uploads to storage first, then records it. Cleans up if the DB insert fails. */
  async create(
    userId: string,
    file: UploadedFile,
  meta: {
  title?: string | undefined;
  durationSeconds?: number | undefined;
},
  ) {
    const mimeType = normalizeMime(file.mimetype);
    const key = buildStorageKey("voice-notes", userId, file);

    await storage.upload(BUCKETS.voiceNotes, key, file.buffer, mimeType);

    try {
      const note = await prisma.voice_notes.create({
        data: {
          user_id: userId,
          title: meta.title || null,
          storage_key: key,
          original_filename: file.originalname.slice(0, 255),
          mime_type: mimeType,
          size_bytes: file.size,
          duration_seconds: meta.durationSeconds ?? null,
        },
      });

      return toDto(
        note,
        await storage.getSignedUrl(BUCKETS.voiceNotes, key),
      );
    } catch (error: unknown) {
      await storage.remove(BUCKETS.voiceNotes, [key]);
      throw error;
    }
  },

  async list(
    userId: string,
    opts: {
      page: number;
      limit: number;
      source?: "own" | "request" | undefined;
    },
  ) {
    const where = {
      user_id: userId,
      ...(opts.source ? { source: opts.source } : {}),
    };

    // Run the list and count queries concurrently without an explicit transaction.
    const [rows, total] = await Promise.all([
      prisma.voice_notes.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
      }),
      prisma.voice_notes.count({ where }),
    ]);

    const urls = await storage.getSignedUrls(
      BUCKETS.voiceNotes,
      rows.map((row) => row.storage_key),
    );

    return {
      items: rows.map((row) =>
        toDto(row, urls.get(row.storage_key) ?? null),
      ),
      pagination: {
        page: opts.page,
        limit: opts.limit,
        total,
        totalPages: Math.ceil(total / opts.limit),
      },
    };
  },

  async findOne(userId: string, id: string) {
    const note = await prisma.voice_notes.findFirst({
      where: { id, user_id: userId },
    });

    if (!note) return null;

    return toDto(
      note,
      await storage.getSignedUrl(BUCKETS.voiceNotes, note.storage_key),
    );
  },

  /** Deletes the DB row, then the file (best effort). */
  async delete(userId: string, id: string): Promise<boolean> {
    const note = await prisma.voice_notes.findFirst({
      where: { id, user_id: userId },
    });

    if (!note) return false;

    await prisma.voice_notes.delete({
      where: { id: note.id },
    });

    await storage.remove(BUCKETS.voiceNotes, [note.storage_key]);

    return true;
  },
};
