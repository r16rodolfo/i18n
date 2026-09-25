import { and, asc, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { joinRequests } from "@/db/schema";
import { getTeamRoom } from "@/lib/team-room";

// A waiting guest's page checks in every 2 s; after this long without news
// they probably closed it, so the team no longer sees the request
const STALE_AFTER_MS = 15_000;

// Team only: guests waiting to be let into the room
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const found = await getTeamRoom(roomId);
  if (!found) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const waiting = await db
    .select({
      id: joinRequests.id,
      username: joinRequests.username,
      preferredLanguage: joinRequests.preferredLanguage,
      createdAt: joinRequests.createdAt,
    })
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.roomId, found.room.id),
        eq(joinRequests.status, "pending"),
        gt(joinRequests.lastSeenAt, new Date(Date.now() - STALE_AFTER_MS)),
      ),
    )
    .orderBy(asc(joinRequests.createdAt));

  return Response.json(
    { requests: waiting },
    { headers: { "Cache-Control": "no-store" } },
  );
}
