// Which service translates the call. Only the server decides this; the
// browser receives the chosen provider when joining a room.
//
// - "none":    plain video call, everyone hears the original audio
// - "palabra": Palabra.ai speech-to-speech (others are heard only through
//              the translated voice)
//
// For now the choice comes from the TRANSLATION_PROVIDER env var. In
// phase 2 it moves to the admin panel, so this function is async already.
export const TRANSLATION_PROVIDERS = ["none", "palabra"] as const;

export type TranslationProvider = (typeof TRANSLATION_PROVIDERS)[number];

function isTranslationProvider(value: string): value is TranslationProvider {
  return (TRANSLATION_PROVIDERS as readonly string[]).includes(value);
}

function isConfigured(provider: TranslationProvider): boolean {
  switch (provider) {
    case "none":
      return true;
    case "palabra":
      return Boolean(
        process.env.PALABRA_CLIENT_ID && process.env.PALABRA_CLIENT_SECRET,
      );
  }
}

export async function getActiveTranslationProvider(): Promise<TranslationProvider> {
  const requested = process.env.TRANSLATION_PROVIDER?.trim() || "none";

  if (!isTranslationProvider(requested)) {
    console.warn(
      `[translation] Unknown TRANSLATION_PROVIDER "${requested}", using "none"`,
    );
    return "none";
  }

  if (!isConfigured(requested)) {
    console.warn(
      `[translation] "${requested}" is selected but its keys are missing, using "none"`,
    );
    return "none";
  }

  return requested;
}
