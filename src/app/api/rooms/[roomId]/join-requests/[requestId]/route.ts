import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { joinRequests } from "@/db/schema";
import { getTeamRoom } from "@/lib/team-room";

const DecisionSchema = z.object({
  decision: z.enum(["approve", "deny"]),
});

// Team only: let a waiting guest in, or refuse them
export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string; requestId: string }> },
) {
  const { roomId, requestId } = await params;
  const parsed = DecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(requestId).success) {
    return Response.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const found = await getTeamRoom(roomId);
  if (!found) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const [request] = await db
    .update(joinRequests)
    .set({
      status: parsed.data.decision === "approve" ? "approved" : "denied",
      decidedAt: new Date(),
      decidedBy: found.member.userId,
    })
    .where(
      and(
        eq(joinRequests.id, requestId),
        eq(joinRequests.roomId, found.room.id),
        eq(joinRequests.status, "pending"),
      ),
    )
    .returning({ id: joinRequests.id, status: joinRequests.status });

  if (!request) {
    // Already decided by someone else, or the guest gave up
    return Response.json({ error: "Pedido não encontrado" }, { status: 404 });
  }
  return Response.json(request);
}
