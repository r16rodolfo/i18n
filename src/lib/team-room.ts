import { eq } from "drizzle-orm";

import { db } from "@/db";
import { type Room, rooms } from "@/db/schema";
import { type CurrentMember, getTeamMember } from "@/lib/auth";

// For team-only room routes (settings, waiting room): the signed-in team
// member and the room, or null when either is missing
export async function getTeamRoom(
  roomName: string,
): Promise<{ member: CurrentMember; room: Room } | null> {
  const member = await getTeamMember();
  if (!member) return null;
  const room = await db.query.rooms.findFirst({
    where: eq(rooms.dailyRoomName, roomName),
  });
  return room ? { member, room } : null;
}
