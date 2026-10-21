import { prisma } from "../../lib/prisma.ts";
import { config } from "../../../config/env.ts";
import { storage, BUCKETS, buildStorageKey } from "../../../utils/storage.ts";
import { voiceNoteModel } from "../../../src/features/voicenote/voicenote.model.ts";
import {
  VOICE_CATALOG,
  VOICE_IDS,
  LANGUAGES,
  STYLES,
  MAX_TEXT_CHARS,
  MAX_CHUNKS,
  PROVIDER_INPUT_LIMIT,
  type VoiceId,
  type Style,
  type LanguageCode,
} from "../../../utils/ttsCatalog.ts";
import { chunkText, parseWav, buildWav } from "../../../utils/tts.audio.ts";

const GROQ_SPEECH_URL = "https://api.groq.com/openai/v1/audio/speech";
const PROVIDER_TIMEOUT_MS = 30_000;

export class TtsProviderError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "TtsProviderError";
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* Provider: Groq (Orpheus)                                            */
/* ------------------------------------------------------------------ */

/** Returns a WAV buffer. `input` must already be <= 200 characters. */
const groqSynthesize = async (opts: {
  model: string;
  voice: string;
  input: string;
}): Promise<Buffer> => {
  if (!config.GROK_API_KEY) {
    throw new TtsProviderError(500, "GROK_API_KEY is not configured");
  }

  const response = await fetch(GROQ_SPEECH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.GROK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      voice: opts.voice,
      input: opts.input,
      response_format: "wav", // the only format Orpheus supports
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new TtsProviderError(response.status, detail.slice(0, 300));
  }

  return Buffer.from(await response.arrayBuffer());
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Default title: the spoken text, minus [directions], trimmed to ~60 chars. */
const titleFromText = (text: string): string => {
  const plain = text.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  return plain.length > 60 ? `${plain.slice(0, 57)}...` : plain;
};

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export const ttsModel = {
  /** What the client needs to render a voice picker. */
  getCatalog() {
    const languages = (Object.keys(LANGUAGES) as LanguageCode[]).map((code) => ({
      code,
      name: LANGUAGES[code].name,
      supportsStyles: LANGUAGES[code].supportsStyles,
      voices: VOICE_IDS.map((id) => VOICE_CATALOG[id])
        .filter((voice) => voice.language === code)
        .map((voice) => ({ id: voice.id, name: voice.name, gender: voice.gender })),
    }));

    return {
      languages,
      styles: STYLES, // English voices only
      limits: { maxChars: MAX_TEXT_CHARS },
    };
  },

  /**
   * Text -> speech -> stored as a voice note flagged is_ai_generated.
   * Long text is split into <=200-char chunks (provider limit), each chunk is
   * synthesized, and the audio is merged into a single WAV.
   */
  async generate(
    userId: string,
    data: {
      text: string;
      voice: VoiceId;
      style?: Style | undefined;
      title?: string | undefined;
    },
  ) {
    const voice = VOICE_CATALOG[data.voice];

    if (data.style && !LANGUAGES[voice.language].supportsStyles) {
      return { status: "style_not_supported" } as const;
    }

    // The style is prefixed to EVERY chunk so the tone stays consistent
    const prefix = data.style ? `[${data.style}] ` : "";
    const chunks = chunkText(data.text, PROVIDER_INPUT_LIMIT - prefix.length);

    if (chunks.length === 0) return { status: "empty_text" } as const;
    if (chunks.length > MAX_CHUNKS) return { status: "too_long" } as const;

    // Sequential on purpose: keeps order and stays friendly to provider rate limits
    const parts = [];
    for (const chunk of chunks) {
      const wav = await groqSynthesize({
        model: voice.model,
        voice: voice.id,
        input: `${prefix}${chunk}`,
      });
      parts.push(parseWav(wav));
    }

    // The AI flag is embedded in the file itself AND stored in the database
    const { wav, durationSeconds } = buildWav(parts, {
      software: "AI text-to-speech",
      comment: `is_ai_generated=true; provider=${voice.provider}; model=${voice.model}; voice=${voice.id}`,
    });

    const fileName = `tts-${voice.id}.wav`;
    const key = buildStorageKey("voice-notes", userId, {
      originalname: fileName,
      mimetype: "audio/wav",
    });

    await storage.upload(BUCKETS.voiceNotes, key, wav, "audio/wav");

    try {
      const note = await prisma.voice_notes.create({
        data: {
          user_id: userId,
          title: data.title || titleFromText(data.text),
          storage_key: key,
          original_filename: fileName,
          mime_type: "audio/wav",
          size_bytes: wav.length,
          duration_seconds: durationSeconds,
          source: "own",
          is_ai_generated: true,
          ai_provider: voice.provider,
          ai_model: voice.model,
          ai_voice: voice.id,
        },
      });

      const voiceNote = await voiceNoteModel.findOne(userId, note.id);
      if (!voiceNote) throw new Error("Voice note missing right after creation");

      return { status: "ok", voiceNote } as const;
    } catch (error: unknown) {
      await storage.remove(BUCKETS.voiceNotes, [key]); // don't leave an orphan
      throw error;
    }
  },
};