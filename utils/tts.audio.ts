/**
 * Pure helpers: text chunking + WAV merging/tagging. No third-party deps.
 */

/* ------------------------------------------------------------------ */
/* Text chunking (provider accepts <= 200 chars per request)           */
/* ------------------------------------------------------------------ */

const SENTENCE_SPLIT = /(?<=[.!?\u061F\u2026])\s+/u;
// A "[vocal direction]" counts as ONE unit so it is never cut in half
const ATOM = /\[[^\]]*\]|\S+/g;
const HAS_SPEECH = /[\p{L}\p{N}]/u;

/** Breaks one over-long sentence into pieces <= maxLen without splitting words/directions. */
const splitLong = (sentence: string, maxLen: number): string[] => {
  const pieces: string[] = [];
  let current = "";

  for (const atom of sentence.match(ATOM) ?? []) {
    let rest = atom;

    // A single giant token (e.g. a URL): hard-slice it
    while (rest.length > maxLen) {
      if (current) {
        pieces.push(current);
        current = "";
      }
      pieces.push(rest.slice(0, maxLen));
      rest = rest.slice(maxLen);
    }

    if (current && current.length + 1 + rest.length > maxLen) {
      pieces.push(current);
      current = rest;
    } else {
      current = current ? `${current} ${rest}` : rest;
    }
  }

  if (current) pieces.push(current);
  return pieces;
};

/** Packs whole sentences into chunks of at most maxLen characters. */
export const chunkText = (text: string, maxLen: number): string[] => {
  const sentences = text
    .split(/\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((paragraph) => paragraph.split(SENTENCE_SPLIT));

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const pieces = sentence.length > maxLen ? splitLong(sentence, maxLen) : [sentence];

    for (const piece of pieces) {
      if (current && current.length + 1 + piece.length > maxLen) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) chunks.push(current);

  // Drop chunks with nothing to say (e.g. only "[cheerful]" or punctuation)
  return chunks.filter((chunk) => HAS_SPEECH.test(chunk.replace(/\[[^\]]*\]/g, "")));
};

/* ------------------------------------------------------------------ */
/* WAV parse / merge / tag                                             */
/* ------------------------------------------------------------------ */

export type WavInfo = { fmt: Buffer; data: Buffer; byteRate: number };

export const parseWav = (buf: Buffer): WavInfo => {
  if (
    buf.length < 12 ||
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Provider returned audio that is not a valid WAV file");
  }

  let offset = 12;
  let fmt: Buffer | null = null;
  let data: Buffer | null = null;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    let size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;

    // Streamed WAVs often declare size 0 / 0xFFFFFFFF for the data chunk
    if (start + size > buf.length || (id === "data" && size === 0)) {
      size = buf.length - start;
    }

    if (id === "fmt ") {
      fmt = buf.subarray(start, start + size);
    } else if (id === "data") {
      data = buf.subarray(start, start + size);
      break;
    }

    offset = start + size + (size % 2); // chunks are word-aligned
  }

  if (!fmt || fmt.length < 16 || !data) {
    throw new Error("Provider returned a WAV file with a missing fmt/data chunk");
  }

  return { fmt, data, byteRate: fmt.readUInt32LE(8) };
};

const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};

const chunk = (id: string, payload: Buffer): Buffer =>
  Buffer.concat([
    Buffer.from(id, "ascii"),
    u32(payload.length),
    payload,
    payload.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0),
  ]);

/**
 * Concatenates WAV parts (same format) into one file and embeds a RIFF INFO
 * tag (ISFT software + ICMT comment) so the AI flag travels with the file itself.
 */
export const buildWav = (
  parts: WavInfo[],
  tags: { software: string; comment: string },
): { wav: Buffer; durationSeconds: number } => {
  const first = parts[0];
  if (!first) throw new Error("No audio parts to build");

  for (const part of parts) {
    if (!part.fmt.equals(first.fmt)) {
      throw new Error("Provider returned audio parts in different formats");
    }
  }

  const pcm = Buffer.concat(parts.map((part) => part.data));

  const info = chunk(
    "LIST",
    Buffer.concat([
      Buffer.from("INFO", "ascii"),
      chunk("ISFT", Buffer.from(`${tags.software}\0`, "utf8")),
      chunk("ICMT", Buffer.from(`${tags.comment}\0`, "utf8")),
    ]),
  );

  const body = Buffer.concat([
    Buffer.from("WAVE", "ascii"),
    chunk("fmt ", first.fmt),
    chunk("data", pcm),
    info,
  ]);

  const wav = Buffer.concat([Buffer.from("RIFF", "ascii"), u32(body.length), body]);

  const seconds = first.byteRate > 0 ? pcm.length / first.byteRate : 0;
  return { wav, durationSeconds: Math.max(1, Math.round(seconds)) };
};