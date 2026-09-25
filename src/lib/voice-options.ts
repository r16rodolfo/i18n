// Translated voice options that the browser also needs (no server code
// here; the engine choice itself lives in voice-engines.ts)

export const VOICE_ENGINES = [
  "none",
  "soniox",
  "elevenlabs",
  "openai",
] as const;
export type VoiceEngine = (typeof VOICE_ENGINES)[number];

// The voice each speaker picks for their translated speech
export const VOICE_GENDERS = ["female", "male"] as const;
export type VoiceGender = (typeof VOICE_GENDERS)[number];

export function isVoiceEngine(value: unknown): value is VoiceEngine {
  return (
    typeof value === "string" &&
    (VOICE_ENGINES as readonly string[]).includes(value)
  );
}

export function isVoiceGender(value: unknown): value is VoiceGender {
  return value === "female" || value === "male";
}
