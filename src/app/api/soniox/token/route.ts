import { z } from "zod";

import { getRoomAccess } from "@/lib/room-access";
import { createSonioxTempKey, SONIOX_TTS_KEY_SECONDS } from "@/lib/soniox";
import { getActiveTranslationProvider } from "@/lib/translation-providers";
import { SONIOX_VOICES } from "@/lib/tts";
import { getActiveVoiceEngine } from "@/lib/voice-engines";

// Gives the browser a temporary Soniox key without it ever seeing the real
// key: to transcribe and translate its own microphone ("stt"), or to read
// the translated captions aloud with the Soniox voice ("tts", with the
// voice names). Only for people who may use the room: team members (login
// cookie) or guests with the invite token. POST so the invite never ends
// up in URLs or logs.

const BodySchema = z.object({
  room: z.string().min(1),
  invite: z.string().nullish(),
  purpose: z.enum(["stt", "tts"]).default("stt"),
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
  const { purpose } = parsed.data;
  // The Soniox voice also works with the ElevenLabs + OpenAI captions
  const active =
    purpose === "tts"
      ? (await getActiveVoiceEngine(provider)) === "soniox"
      : provider === "soniox";
  if (!active) {
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

  const apiKey = await createSonioxTempKey(purpose);
  if (!apiKey) {
    return Response.json(
      { error: "Não foi possível falar com a Soniox" },
      { status: 502, headers: noStore },
    );
  }

  if (purpose === "tts") {
    return Response.json(
      {
        apiKey,
        expiresAt: Date.now() + SONIOX_TTS_KEY_SECONDS * 1000,
        voices: SONIOX_VOICES,
      },
      { headers: noStore },
    );
  }
  return Response.json({ apiKey }, { headers: noStore });
}
