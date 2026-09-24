// Server-only helpers for the Palabra.ai session API (keys never leave the server)

export const PALABRA_API = "https://api.palabra.ai";

export function palabraHeaders() {
  return {
    ClientId: process.env.PALABRA_CLIENT_ID ?? "",
    ClientSecret: process.env.PALABRA_CLIENT_SECRET ?? "",
    "Content-Type": "application/json",
  };
}

// Checks that Palabra accepts our keys by opening and closing a session.
// Used before the admin turns Palabra on, so a wrong or expired key doesn't
// leave every call silent.
export async function verifyPalabraKeys(): Promise<boolean> {
  try {
    const res = await fetch(`${PALABRA_API}/session-storage/session`, {
      method: "POST",
      headers: palabraHeaders(),
      body: JSON.stringify({
        data: {
          publisher_count: 1,
          subscriber_count: 0,
          publisher_can_subscribe: true,
        },
      }),
    });
    const body = await res.json().catch(() => null);
    const sessionId: unknown = body?.data?.id;
    if (!res.ok || !body?.ok || typeof sessionId !== "string") {
      console.error("[palabra] key check failed:", res.status, body?.errors);
      return false;
    }

    await fetch(
      `${PALABRA_API}/session-storage/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE", headers: palabraHeaders() },
    ).catch(() => {});
    return true;
  } catch (error) {
    console.error("[palabra] key check failed:", error);
    return false;
  }
}
