import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { rooms, type Room } from "@/db/schema";
import { type CurrentMember, getTeamMember } from "@/lib/auth";

export interface RoomAccess {
  room: Room;
  // null when the visitor is a guest who came in through the invite link
  member: CurrentMember | null;
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Who may use a room: any team member, or a guest holding the room's invite
// token while the room has not expired. Returns null for everyone else.
export async function getRoomAccess(
  roomName: string,
  inviteToken?: string | null,
): Promise<RoomAccess | null> {
  const room = await db.query.rooms.findFirst({
    where: eq(rooms.dailyRoomName, roomName),
  });
  if (!room) return null;

  const member = await getTeamMember();
  if (member) return { room, member };

  if (!inviteToken || !room.inviteToken) return null;
  if (room.expiresAt && room.expiresAt.getTime() < Date.now()) return null;
  if (!safeEqual(inviteToken, room.inviteToken)) return null;

  return { room, member: null };
}
