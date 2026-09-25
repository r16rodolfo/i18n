// Server-only helpers for Soniox (the API key never leaves the server)

export const SONIOX_API = "https://api.soniox.com";

export function hasSonioxKey(): boolean {
  return Boolean(process.env.SONIOX_API_KEY?.trim());
}

// Temporary keys for the browser (the real key stays here):
// - "stt": opens one realtime transcription + translation connection. It
//   works once and expires in a few minutes, so the browser asks for a new
//   one for every connection.
// - "tts": reads the translated captions aloud (translated voice) over one
//   connection kept open for the whole call, so it lasts 30 minutes and
//   can be used many times.
export const SONIOX_TTS_KEY_SECONDS = 1800;

export async function createSonioxTempKey(
  purpose: "stt" | "tts" = "stt",
): Promise<string | null> {
  try {
    const res = await fetch(`${SONIOX_API}/v1/auth/temporary-api-key`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SONIOX_API_KEY?.trim() ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        purpose === "tts"
          ? {
              usage_type: "tts_rt",
              expires_in_seconds: SONIOX_TTS_KEY_SECONDS,
              single_use: false,
            }
          : {
              usage_type: "transcribe_websocket",
              expires_in_seconds: 300,
              single_use: true,
            },
      ),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    const key: unknown = body?.api_key;
    if (!res.ok || typeof key !== "string") {
      console.error("[soniox] temporary key failed:", res.status, body);
      return null;
    }
    return key;
  } catch (error) {
    console.error("[soniox] temporary key failed:", error);
    return null;
  }
}

// Checks that Soniox accepts our key (and may create temporary keys) before
// the admin turns it on. An unused temporary key just expires.
export async function verifySonioxKey(): Promise<boolean> {
  return (await createSonioxTempKey()) !== null;
}
