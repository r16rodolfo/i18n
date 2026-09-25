import { eq } from "drizzle-orm";

import { hasElevenLabsKey } from "@/lib/elevenlabs";
import { hasSonioxKey } from "@/lib/soniox";
import type { TranslationProvider } from "@/lib/translation-providers";
import { isVoiceEngine, type VoiceEngine } from "@/lib/voice-options";

import { db } from "@/db";
import { appSettings } from "@/db/schema";

export {
  isVoiceEngine,
  isVoiceGender,
  VOICE_ENGINES,
  VOICE_GENDERS,
  type VoiceEngine,
  type VoiceGender,
} from "@/lib/voice-options";

// Translated voice: besides the captions, each listener can hear the others
// in their own language. Chosen in /admin, stored in app_settings.
//
// - "none":       captions only
// - "soniox":     the translated captions are read aloud by Soniox, in the
//                 female or male voice each speaker picked when joining
// - "elevenlabs": same, with ElevenLabs voices
// - "openai":     OpenAI turns the speaker's audio straight into speech in
//                 the listener's language; the voice follows the speaker's
//
// It works together with the captions (Soniox or ElevenLabs + OpenAI):
// with Palabra (which has its own voice) or no translation, it is off.
export const VOICE_ENGINE_SETTING = "voice_engine";

export const VOICE_ENGINE_INFO: Record<
  VoiceEngine,
  { label: string; description: string }
> = {
  none: {
    label: "Sem voz",
    description: "Só as legendas. Todos ouvem a voz original.",
  },
  soniox: {
    label: "Soniox",
    description:
      "Lê as legendas traduzidas em voz alta, com a voz feminina ou masculina que cada pessoa escolhe ao entrar. Cerca de US$ 0,70 por hora de fala gerada.",
  },
  elevenlabs: {
    label: "ElevenLabs",
    description:
      "Como a Soniox, com as vozes da ElevenLabs. Cerca de US$ 0,05 a cada mil letras lidas.",
  },
  openai: {
    label: "OpenAI (voz que acompanha quem fala)",
    description:
      "Transforma a fala direto em voz na língua de quem ouve, seguindo o tom de quem fala. US$ 0,034 por minuto, por pessoa ouvindo.",
  },
};

export function isVoiceEngineConfigured(engine: VoiceEngine): boolean {
  switch (engine) {
    case "none":
      return true;
    case "soniox":
      return hasSonioxKey();
    case "elevenlabs":
      return hasElevenLabsKey();
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY?.trim());
  }
}

export async function getSelectedVoiceEngine(): Promise<VoiceEngine> {
  const setting = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, VOICE_ENGINE_SETTING),
  });
  return isVoiceEngine(setting?.value) ? setting.value : "none";
}

// Local development only (the local app shares the production database)
function devOverride(): VoiceEngine | null {
  if (process.env.NODE_ENV !== "development") return null;
  const value = process.env.DEV_VOICE_ENGINE?.trim();
  return isVoiceEngine(value) ? value : null;
}

// The engine calls actually use, given the captions provider in use
export async function getActiveVoiceEngine(
  provider: TranslationProvider,
): Promise<VoiceEngine> {
  if (provider !== "soniox" && provider !== "elevenlabs") return "none";
  const selected = devOverride() ?? (await getSelectedVoiceEngine());
  return isVoiceEngineConfigured(selected) ? selected : "none";
}

// Checks that the service accepts our key for voice before the admin turns
// it on (none of these checks costs anything: the tokens just expire)
export async function verifyVoiceEngine(engine: VoiceEngine): Promise<boolean> {
  try {
    switch (engine) {
      case "none":
        return true;
      case "soniox": {
        const res = await fetch(
          "https://api.soniox.com/v1/auth/temporary-api-key",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.SONIOX_API_KEY?.trim()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              usage_type: "tts_rt",
              expires_in_seconds: 60,
            }),
            cache: "no-store",
          },
        );
        return res.ok;
      }
      case "elevenlabs": {
        const res = await fetch(
          "https://api.elevenlabs.io/v1/single-use-token/tts_websocket",
          {
            method: "POST",
            headers: {
              "xi-api-key": process.env.ELEVENLABS_API_KEY?.trim() ?? "",
            },
            cache: "no-store",
          },
        );
        return res.ok;
      }
      case "openai": {
        const res = await fetch(
          "https://api.openai.com/v1/realtime/translations/client_secrets",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY?.trim()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session: {
                model: "gpt-realtime-translate",
                audio: { output: { language: "es" } },
              },
            }),
            cache: "no-store",
          },
        );
        return res.ok;
      }
    }
  } catch (error) {
    console.error(`[voice] ${engine} check failed:`, error);
    return false;
  }
}
