import { z } from "zod";

import { getRoomAccess } from "@/lib/room-access";
import { getTeamRoom } from "@/lib/team-room";
import {
  getMonthVideoSeconds,
  getRoomUsage,
  recordUsage,
  type UsageRecord,
} from "@/lib/usage";
import { dailyVideoCost, timeCost } from "@/lib/usage-pricing";

// How long each person spent in the call, how long their mic was being
// transcribed and how long their OpenAI voice sessions were open, reported
// by their browser about once a minute (and when they leave). Used only to
// estimate the meeting's cost.

// A report covers at most this much time (the browser reports every 60 s)
const MAX_SECONDS = 120;

const ENGINE_SERVICE = {
  soniox: "stt_soniox",
  elevenlabs: "stt_elevenlabs",
  palabra: "palabra",
} as const;

const ReportSchema = z.object({
  invite: z.string().max(100).nullish(),
  visitorId: z.string().min(1).max(100),
  callSeconds: z.number().min(0).max(MAX_SECONDS),
  // Seconds the translation engine was listening to this person
  engine: z.enum(["soniox", "elevenlabs", "palabra"]).nullish(),
  engineSeconds: z.number().min(0).max(MAX_SECONDS).default(0),
  // OpenAI voice: seconds summed over the sessions (one per person heard
  // in translation, so up to a few per report)
  voiceSeconds: z
    .number()
    .min(0)
    .max(MAX_SECONDS * 5)
    .default(0),
  // Soniox voice made in this person's browser: seconds of speech heard
  ttsSeconds: z
    .number()
    .min(0)
    .max(MAX_SECONDS * 5)
    .default(0),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const parsed = ReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const report = parsed.data;

  const access = await getRoomAccess(roomId, report.invite);
  if (!access) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { room } = access;
  // The first 10,000 minutes of the month are free on Daily
  const monthVideoSeconds = await getMonthVideoSeconds();

  const records: UsageRecord[] = [
    {
      roomName: room.dailyRoomName,
      roomId: room.id,
      service: "video",
      quantity: report.callSeconds,
      costUsd: dailyVideoCost(monthVideoSeconds, report.callSeconds),
      visitorId: report.visitorId,
    },
  ];
  if (report.engine) {
    const service = ENGINE_SERVICE[report.engine];
    const seconds = Math.min(report.engineSeconds, report.callSeconds);
    records.push({
      roomName: room.dailyRoomName,
      roomId: room.id,
      service,
      quantity: seconds,
      costUsd: timeCost(service, seconds),
      visitorId: report.visitorId,
    });
  }
  if (report.voiceSeconds > 0) {
    records.push({
      roomName: room.dailyRoomName,
      roomId: room.id,
      service: "voice_openai",
      quantity: report.voiceSeconds,
      costUsd: timeCost("voice_openai", report.voiceSeconds),
      visitorId: report.visitorId,
    });
  }
  if (report.ttsSeconds > 0) {
    records.push({
      roomName: room.dailyRoomName,
      roomId: room.id,
      service: "tts_soniox",
      quantity: report.ttsSeconds,
      costUsd: timeCost("tts_soniox", report.ttsSeconds),
      visitorId: report.visitorId,
    });
  }
  await recordUsage(records);

  return new Response(null, { status: 204 });
}

// Team only: the meeting's estimated cost so far (shown inside the call)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const teamRoom = await getTeamRoom(roomId);
  if (!teamRoom) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }
  const usage = await getRoomUsage(teamRoom.room.id);
  return Response.json(usage, { headers: { "Cache-Control": "no-store" } });
}
