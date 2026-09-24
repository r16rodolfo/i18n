import { z } from "zod";

import { createScribeToken } from "@/lib/elevenlabs";
import { getRoomAccess } from "@/lib/room-access";
import { getActiveTranslationProvider } from "@/lib/translation-providers";

// Gives the browser a single-use ElevenLabs token so it can transcribe its
// own microphone without ever seeing the API key. Only for people who may
// use the room: team members (login cookie) or guests with the invite token.
// POST (not GET) so the invite never ends up in URLs or logs.

const BodySchema = z.object({
  room: z.string().min(1),
  invite: z.string().nullish(),
});

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Pedido inválido" },
      { status: 400, headers: noStore },
    );
  }

  if ((await getActiveTranslationProvider()) !== "elevenlabs") {
    return Response.json(
      { error: "ElevenLabs não está ativa" },
      { status: 409, headers: noStore },
    );
  }

  const access = await getRoomAccess(parsed.data.room, parsed.data.invite);
  if (!access) {
    return Response.json(
      { error: "Não autorizado" },
      { status: 401, headers: noStore },
    );
  }

  const token = await createScribeToken();
  if (!token) {
    return Response.json(
      { error: "Não foi possível falar com a ElevenLabs" },
      { status: 502, headers: noStore },
    );
  }

  return Response.json({ token }, { headers: noStore });
}
