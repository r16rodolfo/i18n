import { getTeamMember, unauthorized } from "@/lib/auth";
import { checkServices } from "@/lib/service-health";
import {
  getActiveTranslationProvider,
  type TranslationProvider,
} from "@/lib/translation-providers";
import { getActiveVoiceEngine, type VoiceEngine } from "@/lib/voice-engines";

// Admin only: tests every outside service now (status panel in /admin)

const TRANSLATION_CHECKS: Record<TranslationProvider, string[]> = {
  none: [],
  palabra: ["palabra"],
  elevenlabs: ["elevenlabs-stt", "openai-text"],
  soniox: ["soniox-stt"],
};

const VOICE_CHECKS: Record<VoiceEngine, string[]> = {
  none: [],
  soniox: ["soniox-tts"],
  elevenlabs: ["elevenlabs-tts"],
  openai: ["openai-voice"],
};

export async function POST() {
  const member = await getTeamMember();
  if (!member || member.role !== "admin") return unauthorized();

  const provider = await getActiveTranslationProvider();
  const [checks, voice] = await Promise.all([
    checkServices(),
    getActiveVoiceEngine(provider),
  ]);
  // What real meetings depend on right now
  const inUse = [
    "database",
    "daily",
    ...TRANSLATION_CHECKS[provider],
    ...(VOICE_CHECKS[voice] ?? []),
  ];

  return Response.json(
    { checks, inUse, checkedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
