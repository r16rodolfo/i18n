import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { ENTRY_MODES, rooms } from "@/db/schema";
import { getTeamRoom } from "@/lib/team-room";

// Team only: lock/unlock a room (a locked room takes no new guests, the
// people already in the call stay) and choose how guests get in.

const SettingsSchema = z
  .object({
    locked: z.boolean().optional(),
    entryMode: z.enum(ENTRY_MODES).optional(),
  })
  .refine((value) => value.locked !== undefined || value.entryMode, {
    message: "Nada para mudar",
  });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const parsed = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const found = await getTeamRoom(roomId);
  if (!found) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { locked, entryMode } = parsed.data;
  const [room] = await db
    .update(rooms)
    .set({
      ...(locked !== undefined ? { lockedAt: locked ? new Date() : null } : {}),
      ...(entryMode ? { entryMode } : {}),
    })
    .where(eq(rooms.id, found.room.id))
    .returning();

  return Response.json({
    locked: Boolean(room.lockedAt),
    entryMode: room.entryMode,
  });
}
