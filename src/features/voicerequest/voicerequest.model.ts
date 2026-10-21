import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.ts";
import {
  storage,
  BUCKETS,
  buildStorageKey,
  normalizeMime,
} from "../../../utils/storage.ts";
import { sendEmail } from "../../../config/mailer.ts";
type UploadedFile = Express.Multer.File;

export const DEFAULT_EXPIRES_IN_HOURS = 48;
export const MAX_EXPIRES_IN_HOURS = 72;
const LIST_LIMIT = 50;

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

// 32 random bytes -> 43 base64url chars. Only the SHA-256 is stored.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const generateToken = (): string =>
  crypto.randomBytes(32).toString("base64url");

const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

/* ------------------------------------------------------------------ */
/* Types & helpers                                                     */
/* ------------------------------------------------------------------ */

export type RequestStatus = "pending" | "fulfilled" | "cancelled" | "expired";

type RequestRow = {
  id: string;
  user_id: string;
  recipient_name: string | null;
  message: string | null;
  status: string;
  expires_at: Date;
  fulfilled_at: Date | null;
  created_at: Date;
};

export type TokenLookup =
  | { status: "invalid" | "used" | "cancelled" | "expired" }
  | { status: "active"; request: RequestRow; requesterName: string };

/** "expired" isn't stored; it's a pending request whose time ran out. */
const effectiveStatus = (row: RequestRow): RequestStatus => {
  if (row.status === "pending") {
    return row.expires_at <= new Date() ? "expired" : "pending";
  }
  return row.status === "fulfilled" ? "fulfilled" : "cancelled";
};

const toRequestDto = (row: RequestRow, voiceNoteId: string | null) => ({
  id: row.id,
  recipientName: row.recipient_name,
  message: row.message,
  status: effectiveStatus(row),
  expiresAt: row.expires_at,
  fulfilledAt: row.fulfilled_at,
  createdAt: row.created_at,
  voiceNoteId,
});
 
async function notifyRequester(
  userId: string,
  senderName: string | null,
): Promise<void> {
  const requester = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      email: true,
      username: true,
      full_name: true,
      status: true,
    },
  });

  if (!requester || requester.status !== "active" || !requester.email) {
    console.warn(`Could not notify requester ${userId}: no active email`);
    return;
  }

  const name = requester.full_name || requester.username || "there";
  const sender = senderName || "Someone";

  try {
    await sendEmail({
      to: requester.email,
      subject: "You've received a new voice note",
      text: `Hi ${name}, ${sender} has sent you a voice note. Open the Voice Note app to listen.`,
      html: `
        <h2>You've received a new voice note!</h2>
        <p>Hi ${name},</p>
        <p><strong>${sender}</strong> has sent you a voice note.</p>
        <p>Open the Voice Note app to listen to it.</p>
      `,
    });
  } catch (error) {
    // Email failure must not undo a successfully submitted recording.
    console.error("Voice-note notification email failed:", error);
  }
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export const voiceRequestModel = {
  /** Returns the raw token ONCE. Only its hash is stored, so it can't be shown again. */
  async create(
    userId: string,
    data: {
      recipientName?: string | undefined;
      message?: string | undefined;
      expiresInHours: number;
    },
  ) {
    const token = generateToken();

    const row = await prisma.voice_note_requests.create({
      data: {
        user_id: userId,
        token_hash: hashToken(token),
        recipient_name: data.recipientName || null,
        message: data.message || null,
        expires_at: new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000),
      },
    });

    return { request: toRequestDto(row, null), token };
  },

  async list(userId: string) {
    const rows = await prisma.voice_note_requests.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: LIST_LIMIT,
    });

    // Which requests produced a voice note?
    const notes =
      rows.length === 0
        ? []
        : await prisma.voice_notes.findMany({
            where: { request_id: { in: rows.map((row) => row.id) } },
            select: { id: true, request_id: true },
          });

    const noteByRequest = new Map<string, string>();
    for (const note of notes) {
      if (note.request_id) noteByRequest.set(note.request_id, note.id);
    }

    return rows.map((row) =>
      toRequestDto(row, noteByRequest.get(row.id) ?? null),
    );
  },

  /** Only pending requests can be cancelled (that kills the link immediately). */
  async cancel(userId: string, id: string) {
    const existing = await prisma.voice_note_requests.findFirst({
      where: { id, user_id: userId },
    });
    if (!existing) return "not_found" as const;
    if (existing.status !== "pending") return "not_pending" as const;

    const result = await prisma.voice_note_requests.updateMany({
      where: { id, user_id: userId, status: "pending" },
      data: { status: "cancelled" },
    });

    return result.count === 0
      ? ("not_pending" as const)
      : ("cancelled" as const);
  },

  /** Resolves a link token to its state. Never throws for bad tokens. */
  async lookupByToken(token: string): Promise<TokenLookup> {
    if (!TOKEN_PATTERN.test(token)) return { status: "invalid" };

    const request = await prisma.voice_note_requests.findUnique({
      where: { token_hash: hashToken(token) },
    });
    if (!request) return { status: "invalid" };

    if (request.status === "fulfilled") return { status: "used" };
    if (request.status === "cancelled") return { status: "cancelled" };
    if (request.expires_at <= new Date()) return { status: "expired" };

    const requester = await prisma.users.findUnique({
      where: { id: request.user_id },
      select: { username: true, full_name: true, status: true },
    });
    if (!requester || requester.status !== "active")
      return { status: "invalid" };

    return {
      status: "active",
      request,
      requesterName: requester.full_name || requester.username || "Someone",
    };
  },

  /**
   * Stores the recording and burns the link.
   * The link is claimed atomically (pending -> fulfilled) in the same transaction
   * that creates the voice note, so two simultaneous uploads can't both win.
   * The loser's file is deleted.
   */
  async submit(
    request: RequestRow,
    file: UploadedFile,
    meta: {
      senderName?: string | undefined;
      durationSeconds?: number | undefined;
    },
  ) {
    const mimeType = normalizeMime(file.mimetype);
    const key = buildStorageKey("voice-notes", request.user_id, file);
    const senderName = meta.senderName || request.recipient_name || null;

    await storage.upload(BUCKETS.voiceNotes, key, file.buffer, mimeType);

    try {
      const note = await prisma.$transaction(async (tx) => {
        const claimed = await tx.voice_note_requests.updateMany({
          where: {
            id: request.id,
            status: "pending",
            expires_at: { gt: new Date() },
          },
          data: { status: "fulfilled", fulfilled_at: new Date() },
        });
        if (claimed.count === 0) return null;

        return tx.voice_notes.create({
          data: {
            user_id: request.user_id,
            title: null,
            storage_key: key,
            original_filename: file.originalname.slice(0, 255),
            mime_type: mimeType,
            size_bytes: file.size,
            duration_seconds: meta.durationSeconds ?? null,
            source: "request",
            sender_name: senderName,
            request_id: request.id,
          },
        });
      });

      if (!note) {
        await storage.remove(BUCKETS.voiceNotes, [key]);
        return { status: "used" } as const;
      }

      notifyRequester(request.user_id, senderName);
      return { status: "ok" } as const;
    } catch (error: unknown) {
      await storage.remove(BUCKETS.voiceNotes, [key]); // don't leave an orphan
      throw error;
    }
  },
};
