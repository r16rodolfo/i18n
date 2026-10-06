import { z } from "zod";

import {
  listCloudRecordings,
  startCloudRecording,
  stopCloudRecording,
} from "@/lib/daily-recordings";
import { getTeamRoom } from "@/lib/team-room";
import { recordUsage } from "@/lib/usage";
import { timeCost } from "@/lib/usage-pricing";

// Team only: start or stop the cloud recording of a meeting (Daily). Every
// participant sees that it is being recorded (Daily tells all of them).
// The cost is saved when it stops, from how long it ran.

const BodySchema = z.object({ action: z.enum(["start", "stop"]) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const teamRoom = await getTeamRoom(roomId);
  if (!teamRoom) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const { room } = teamRoom;

  try {
    if (parsed.data.action === "start") {
      await startCloudRecording(room.dailyRoomName);
      return Response.json({ recording: true });
    }

    // How long the recording that is stopping ran
    const [current] = await listCloudRecordings(room.dailyRoomName).catch(
      () => [],
    );
    await stopCloudRecording(room.dailyRoomName);
    if (current && current.status === "in-progress") {
      const seconds = Math.max(0, (Date.now() - current.startedAt) / 1000);
      await recordUsage([
        {
          roomName: room.dailyRoomName,
          roomId: room.id,
          service: "recording_cloud",
          quantity: seconds,
          costUsd: timeCost("recording_cloud", seconds),
          detail: { recordingId: current.id },
        },
      ]);
    }
    return Response.json({ recording: false });
  } catch (error) {
    console.error("[recording]", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao falar com o Daily",
      },
      { status: 502 },
    );
  }
}
