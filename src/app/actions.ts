"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { rooms } from "@/db/schema";
import { getTeamMember } from "@/lib/auth";

export interface DeleteRoomResult {
  error: string | null;
}

// Deletes a room: closes the Daily room (anyone still in the call is
// disconnected and the invite link stops working) and removes it from the
// database, together with its participants and transcripts.
// Only whoever created the room, or an admin, may delete it.
export async function deleteRoom(roomName: string): Promise<DeleteRoomResult> {
  const member = await getTeamMember();
  if (!member) return { error: "Não autorizado" };

  const room = await db.query.rooms.findFirst({
    where: eq(rooms.dailyRoomName, roomName),
  });
  if (!room) {
    revalidatePath("/");
    return { error: null };
  }

  if (room.createdBy !== member.userId && member.role !== "admin") {
    return { error: "Só quem criou a sala ou um administrador pode excluí-la" };
  }

  const dailyRes = await fetch(
    `https://api.daily.co/v1/rooms/${encodeURIComponent(room.dailyRoomName)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
    },
  );
  // 404: Daily already removed it (e.g. after it expired)
  if (!dailyRes.ok && dailyRes.status !== 404) {
    console.error("Daily.co delete error:", await dailyRes.text());
    return { error: "Não foi possível encerrar a sala de vídeo" };
  }

  await db.delete(rooms).where(eq(rooms.id, room.id));

  revalidatePath("/");
  return { error: null };
}
