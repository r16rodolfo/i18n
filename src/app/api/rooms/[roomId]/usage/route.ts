import { z } from "zod";

import { getRoomAccess } from "@/lib/room-access";
import { getTeamRoom } from "@/lib/team-room";
import { getRoomUsage, recordUsage, type UsageRecord } from "@/lib/usage";
import { timeCost } from "@/lib/usage-pricing";

// How long each person spent in the call, and how long their mic was being
// transcribed, reported by their browser about once a minute (and when they
// leave). Used only to estimate the meeting's cost.

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

  const records: UsageRecord[] = [
    {
      roomName: room.dailyRoomName,
      roomId: room.id,
      service: "video",
      quantity: report.callSeconds,
      costUsd: timeCost("video", report.callSeconds),
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
