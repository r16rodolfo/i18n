import { after } from "next/server";

import { z } from "zod";

import { isValidLanguageCode } from "@/lib/languages";
import { getRoomAccess } from "@/lib/room-access";
import { getActiveTranslationProvider } from "@/lib/translation-providers";
import {
  elevenLabsSpeech,
  type SpeechStream,
  sonioxSpeech,
  TTS_SAMPLE_RATE,
} from "@/lib/tts";
import { recordUsage } from "@/lib/usage";
import { characterCost, timeCost } from "@/lib/usage-pricing";
import { getActiveVoiceEngine, VOICE_GENDERS } from "@/lib/voice-engines";

// A translated caption read aloud for one listener (Soniox or ElevenLabs
// voice). Answers with the audio as it is generated: raw 16-bit PCM, mono,
// 24 kHz. POST so the invite never ends up in URLs or logs.

const SpeakSchema = z.object({
  invite: z.string().max(100).nullish(),
  visitorId: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(600),
  language: z.string().refine(isValidLanguageCode),
  // The voice the speaker picked when joining
  gender: z.enum(VOICE_GENDERS),
  speed: z.number().min(1).max(1.3).default(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const parsed = SpeakSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const request = parsed.data;

  const [provider, access] = await Promise.all([
    getActiveTranslationProvider(),
    getRoomAccess(roomId, request.invite),
  ]);
  if (!access) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }
  const engine = await getActiveVoiceEngine(provider);
  if (engine !== "soniox" && engine !== "elevenlabs") {
    return Response.json({ error: "Voz desativada" }, { status: 409 });
  }

  let speech: SpeechStream | null;
  try {
    speech =
      engine === "soniox"
        ? sonioxSpeech(request)
        : await elevenLabsSpeech(request);
  } catch (error) {
    console.error("[voice] failed to start:", error);
    speech = null;
  }
  if (!speech) {
    return Response.json({ error: "Falha na voz" }, { status: 502 });
  }

  const { room } = access;
  const done = speech.done;
  after(async () => {
    const { audioBytes } = await done;
    const seconds = audioBytes / 2 / TTS_SAMPLE_RATE;
    await recordUsage([
      engine === "soniox"
        ? {
            roomName: room.dailyRoomName,
            roomId: room.id,
            service: "tts_soniox",
            quantity: seconds,
            costUsd: timeCost("tts_soniox", seconds),
            visitorId: request.visitorId,
          }
        : {
            roomName: room.dailyRoomName,
            roomId: room.id,
            service: "tts_elevenlabs",
            quantity: request.text.length,
            costUsd: characterCost("tts_elevenlabs", request.text.length),
            visitorId: request.visitorId,
          },
    ]);
  });

  return new Response(speech.audio, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Sample-Rate": String(TTS_SAMPLE_RATE),
    },
  });
}
