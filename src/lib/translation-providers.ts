import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { hasElevenLabsKey } from "@/lib/elevenlabs";
import { hasPalabraKeys } from "@/lib/palabra";

// Which service translates the call. Only the server decides this; the
// browser receives the chosen provider when joining a room.
//
// - "none":    plain video call, everyone hears the original audio
// - "palabra": Palabra.ai speech-to-speech (others are heard only through
//              the translated voice)
// - "elevenlabs": each person's speech is transcribed by ElevenLabs and
//              translated by OpenAI into captions; everyone keeps hearing
//              the original voice
//
// The choice is made in the admin panel (/admin) and stored in app_settings.
// Until someone picks one there, the TRANSLATION_PROVIDER env var is used.
export const TRANSLATION_PROVIDERS = ["none", "palabra", "elevenlabs"] as const;

export type TranslationProvider = (typeof TRANSLATION_PROVIDERS)[number];

export const TRANSLATION_PROVIDER_SETTING = "translation_provider";

export const TRANSLATION_PROVIDER_INFO: Record<
  TranslationProvider,
  { label: string; description: string }
> = {
  none: {
    label: "Sem tradução",
    description: "Chamada comum. Todos ouvem a voz original.",
  },
  palabra: {
    label: "Palabra.ai",
    description:
      "Tradução de voz em tempo real. Cada pessoa ouve os outros na voz traduzida.",
  },
  elevenlabs: {
    label: "ElevenLabs + OpenAI",
    description:
      "Legendas traduzidas na língua de cada pessoa. Todos ouvem a voz original. (Em construção: as legendas chegam nas próximas etapas.)",
  },
};

export function isTranslationProvider(
  value: unknown,
): value is TranslationProvider {
  return (
    typeof value === "string" &&
    (TRANSLATION_PROVIDERS as readonly string[]).includes(value)
  );
}

// Whether the provider's keys are set on the server (env vars)
export function isConfigured(provider: TranslationProvider): boolean {
  switch (provider) {
    case "none":
      return true;
    case "palabra":
      return hasPalabraKeys();
    case "elevenlabs":
      // ElevenLabs transcribes, OpenAI translates: both keys are needed
      return hasElevenLabsKey() && Boolean(process.env.OPENAI_API_KEY?.trim());
  }
}

// What the admin picked (or the env var fallback), before checking keys
export async function getSelectedTranslationProvider(): Promise<TranslationProvider> {
  const setting = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, TRANSLATION_PROVIDER_SETTING),
  });
  if (isTranslationProvider(setting?.value)) return setting.value;

  const fromEnv = process.env.TRANSLATION_PROVIDER?.trim() || "none";
  if (isTranslationProvider(fromEnv)) return fromEnv;

  console.warn(
    `[translation] Unknown TRANSLATION_PROVIDER "${fromEnv}", using "none"`,
  );
  return "none";
}

// Local development only: DEV_TRANSLATION_PROVIDER wins over the admin's
// choice. The local app shares the production database, so testing a
// provider through /admin would change it for real meetings too.
function devOverride(): TranslationProvider | null {
  if (process.env.NODE_ENV !== "development") return null;
  const value = process.env.DEV_TRANSLATION_PROVIDER?.trim();
  return isTranslationProvider(value) ? value : null;
}

// The provider calls actually use: falls back to "none" if keys are missing
export async function getActiveTranslationProvider(): Promise<TranslationProvider> {
  const selected = devOverride() ?? (await getSelectedTranslationProvider());

  if (!isConfigured(selected)) {
    console.warn(
      `[translation] "${selected}" is selected but its keys are missing, using "none"`,
    );
    return "none";
  }

  return selected;
}
