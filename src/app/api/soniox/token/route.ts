import { z } from "zod";

import { getRoomAccess } from "@/lib/room-access";
import { createSonioxTempKey } from "@/lib/soniox";
import { getActiveTranslationProvider } from "@/lib/translation-providers";

// Gives the browser a temporary Soniox key so it can transcribe and
// translate its own microphone without ever seeing the real key. Only for
// people who may use the room: team members (login cookie) or guests with
// the invite token. POST so the invite never ends up in URLs or logs.

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

  const [provider, access] = await Promise.all([
    getActiveTranslationProvider(),
    getRoomAccess(parsed.data.room, parsed.data.invite),
  ]);
  if (provider !== "soniox") {
    return Response.json(
      { error: "Soniox não está ativa" },
      { status: 409, headers: noStore },
    );
  }
  if (!access) {
    return Response.json(
      { error: "Não autorizado" },
      { status: 401, headers: noStore },
    );
  }

  const apiKey = await createSonioxTempKey();
  if (!apiKey) {
    return Response.json(
      { error: "Não foi possível falar com a Soniox" },
      { status: 502, headers: noStore },
    );
  }

  return Response.json({ apiKey }, { headers: noStore });
}
