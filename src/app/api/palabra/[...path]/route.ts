import { getRoomAccess } from "@/lib/room-access";
import { getActiveTranslationProvider } from "@/lib/translation-providers";

// Server-side proxy for the Palabra.ai session API. The browser SDK is pointed
// here (apiBaseUrl: "/api/palabra"), so the Palabra client secret never leaves
// the server. The SDK sends "Authorization: Bearer <room>.<invite token>";
// team members send "<room>." and are recognized by their login cookie.
//
// Only the two calls the SDK makes are forwarded:
//   POST   /session-storage/session        → create a streaming session
//   DELETE /session-storage/sessions/:id   → end it

const PALABRA_API = "https://api.palabra.ai";

type Params = { params: Promise<{ path: string[] }> };

async function authorize(req: Request): Promise<boolean> {
  if ((await getActiveTranslationProvider()) !== "palabra") return false;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return false;

  const dot = bearer.indexOf(".");
  const roomName = dot === -1 ? bearer : bearer.slice(0, dot);
  const inviteToken = dot === -1 ? null : bearer.slice(dot + 1) || null;
  if (!roomName) return false;

  return Boolean(await getRoomAccess(roomName, inviteToken));
}

function palabraHeaders() {
  return {
    ClientId: process.env.PALABRA_CLIENT_ID ?? "",
    ClientSecret: process.env.PALABRA_CLIENT_SECRET ?? "",
    "Content-Type": "application/json",
  };
}

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

export async function POST(req: Request, { params }: Params) {
  const { path } = await params;
  if (path.join("/") !== "session-storage/session") return notFound();
  if (!(await authorize(req))) {
    return Response.json(
      { ok: false, error: "Não autorizado" },
      { status: 401 },
    );
  }

  // Build the payload here instead of forwarding the browser's, so a caller
  // can't ask Palabra for more publishers/subscribers than one person needs.
  const body = await req.json().catch(() => null);
  const intent =
    typeof body?.data?.intent === "string" ? body.data.intent : undefined;

  const res = await fetch(`${PALABRA_API}/session-storage/session`, {
    method: "POST",
    headers: palabraHeaders(),
    body: JSON.stringify({
      data: {
        publisher_count: 1,
        subscriber_count: 0,
        publisher_can_subscribe: true,
        intent,
      },
    }),
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function DELETE(req: Request, { params }: Params) {
  const { path } = await params;
  const [scope, resource, sessionId, ...rest] = path;
  if (
    scope !== "session-storage" ||
    resource !== "sessions" ||
    !sessionId ||
    rest.length > 0
  ) {
    return notFound();
  }
  if (!(await authorize(req))) {
    return Response.json(
      { ok: false, error: "Não autorizado" },
      { status: 401 },
    );
  }

  const res = await fetch(
    `${PALABRA_API}/session-storage/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE", headers: palabraHeaders() },
  );

  return new Response(null, { status: res.status });
}
