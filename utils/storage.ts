import crypto from "node:crypto";
import supabase from "../config/supabase.ts";

export const BUCKETS = {
  voiceNotes: "VoiceNoteBucket",
  images: "VoiceNoteImageBucket",
} as const;

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

export const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60; // 1 hour

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/3gpp": "3gp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
 export const normalizeMime = (mimetype: string): string =>
  (mimetype.split(";")[0] ?? "").trim().toLowerCase();
 
 export const buildStorageKey = (
  folder: string,
  userId: string,
  file: { originalname: string; mimetype: string },
): string => {
  const fromMime = MIME_EXTENSIONS[normalizeMime(file.mimetype)];
  const fromName = file.originalname.includes(".")
    ? (file.originalname.split(".").pop() ?? "").toLowerCase()
    : "";
  const extension =
    fromMime ?? (/^[a-z0-9]{2,5}$/.test(fromName) ? fromName : "bin");

  return `${folder}/${userId}/${crypto.randomUUID()}.${extension}`;
};

export const storage = {
  async upload(
    bucket: Bucket,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(key, body, { contentType, upsert: false });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  },

  async getSignedUrl(bucket: Bucket, key: string): Promise<string | null> {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(key, SIGNED_URL_EXPIRES_IN_SECONDS);

    if (error || !data) {
      console.error(`Signed URL failed (${bucket}):`, error?.message);
      return null;
    }
    return data.signedUrl;
  },

  /** One round trip for many keys. Returns a map of key -> signed URL. */
  async getSignedUrls(
    bucket: Bucket,
    keys: string[],
  ): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    if (keys.length === 0) return urls;

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(keys, SIGNED_URL_EXPIRES_IN_SECONDS);

    if (error || !data) {
      console.error(`Signed URLs failed (${bucket}):`, error?.message);
      return urls;
    }

    for (const item of data) {
      if (item.path && item.signedUrl && !item.error) {
        urls.set(item.path, item.signedUrl);
      }
    }
    return urls;
  },

  /** Best-effort: logs failures instead of throwing. */
  async remove(bucket: Bucket, keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 100) {
      const { error } = await supabase.storage
        .from(bucket)
        .remove(keys.slice(i, i + 100));

      if (error) {
        console.error(`Storage remove failed (${bucket}):`, error.message);
      }
    }
  }
}