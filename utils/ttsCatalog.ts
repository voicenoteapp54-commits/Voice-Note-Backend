 
export const MAX_TEXT_CHARS = 1500; // whole request
export const PROVIDER_INPUT_LIMIT = 200; // Groq Orpheus: max characters per call
export const MAX_CHUNKS = 15; // sanity cap on provider calls per request

export const VOICE_IDS = [
  "autumn", "diana", "hannah", "austin", "daniel", "troy", // English
  "abdullah", "fahad", "sultan", "lulwa", "noura", "aisha", // Arabic (Saudi)
] as const;
export type VoiceId = (typeof VOICE_IDS)[number];

// Vocal directions drawn from Groq's documented examples. English voices only.
export const STYLES = [
  "cheerful", "friendly", "casual", "warm",
  "professionally", "authoritatively", "formally", "confidently",
  "excited", "dramatic", "whisper", "deadpan", "sarcastic", "singsong", "breathy",
] as const;
export type Style = (typeof STYLES)[number];

export const LANGUAGES = {
  en: { name: "English", supportsStyles: true },
  "ar-SA": { name: "Arabic (Saudi dialect)", supportsStyles: false },
} as const;
export type LanguageCode = keyof typeof LANGUAGES;

export type VoiceDef = {
  id: VoiceId;
  name: string;
  gender: "female" | "male";
  language: LanguageCode;
  provider: "groq";
  model: string;
};

const EN = "canopylabs/orpheus-v1-english";
const AR = "canopylabs/orpheus-arabic-saudi";

export const VOICE_CATALOG: Record<VoiceId, VoiceDef> = {
  autumn: { id: "autumn", name: "Autumn", gender: "female", language: "en", provider: "groq", model: EN },
  diana: { id: "diana", name: "Diana", gender: "female", language: "en", provider: "groq", model: EN },
  hannah: { id: "hannah", name: "Hannah", gender: "female", language: "en", provider: "groq", model: EN },
  austin: { id: "austin", name: "Austin", gender: "male", language: "en", provider: "groq", model: EN },
  daniel: { id: "daniel", name: "Daniel", gender: "male", language: "en", provider: "groq", model: EN },
  troy: { id: "troy", name: "Troy", gender: "male", language: "en", provider: "groq", model: EN },
  abdullah: { id: "abdullah", name: "Abdullah", gender: "male", language: "ar-SA", provider: "groq", model: AR },
  fahad: { id: "fahad", name: "Fahad", gender: "male", language: "ar-SA", provider: "groq", model: AR },
  sultan: { id: "sultan", name: "Sultan", gender: "male", language: "ar-SA", provider: "groq", model: AR },
  lulwa: { id: "lulwa", name: "Lulwa", gender: "female", language: "ar-SA", provider: "groq", model: AR },
  noura: { id: "noura", name: "Noura", gender: "female", language: "ar-SA", provider: "groq", model: AR },
  aisha: { id: "aisha", name: "Aisha", gender: "female", language: "ar-SA", provider: "groq", model: AR },
};