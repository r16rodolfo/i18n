// Server-only helpers for ElevenLabs (the API key never leaves the server)

export const ELEVENLABS_API = "https://api.elevenlabs.io";

export function hasElevenLabsKey(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

// Single-use token that lets one browser open one realtime transcription
// (Scribe) connection. It expires after 15 minutes and is consumed on use,
// so the browser gets a fresh one for every connection.
export async function createScribeToken(): Promise<string | null> {
  try {
    const res = await fetch(
      `${ELEVENLABS_API}/v1/single-use-token/realtime_scribe`,
      {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY?.trim() ?? "" },
        cache: "no-store",
      },
    );
    const body = await res.json().catch(() => null);
    const token: unknown = body?.token;
    if (!res.ok || typeof token !== "string") {
      console.error("[elevenlabs] token request failed:", res.status, body);
      return null;
    }
    return token;
  } catch (error) {
    console.error("[elevenlabs] token request failed:", error);
    return null;
  }
}

// Checks that ElevenLabs accepts our key (and that it may use realtime
// transcription) before the admin turns it on. An unused token just expires.
export async function verifyElevenLabsKey(): Promise<boolean> {
  return (await createScribeToken()) !== null;
}
