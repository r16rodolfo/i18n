import { z } from "zod";

import { getRoomAccess } from "@/lib/room-access";

import { db } from "@/db";
import { callEvents } from "@/db/schema";

// Diagnostics: what happened in one browser during the call (joined,
// languages, mic, errors), sent in small batches. Only to find out later why
// someone wasn't heard or translated; nothing reads it during the call.

const EventSchema = z.object({
  type: z.string().min(1).max(40),
  at: z.number(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const BodySchema = z.object({
  invite: z.string().max(100).nullish(),
  visitorId: z.string().min(1).max(100),
  username: z.string().max(60).optional(),
  events: z.array(EventSchema).min(1).max(50),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const body = parsed.data;
  const access = await getRoomAccess(roomId, body.invite);
  if (!access) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    await db.insert(callEvents).values(
      body.events.map((event) => {
        // Keep each entry small
        const data = event.data ? JSON.stringify(event.data) : null;
        return {
          roomId: access.room.id,
          visitorId: body.visitorId,
          username: body.username ?? null,
          type: event.type,
          data:
            data && data.length <= 2000
              ? event.data
              : data
                ? { truncated: data.slice(0, 2000) }
                : null,
          happenedAt: new Date(event.at),
        };
      }),
    );
  } catch (error) {
    console.error("[events] failed to save:", error);
  }
  return new Response(null, { status: 204 });
}
