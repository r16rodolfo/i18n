import { db } from "@/db";
import { rooms } from "@/db/schema";
import { getTeamMember, unauthorized } from "@/lib/auth";
import { generateInviteToken, generateRoomId } from "@/lib/nanoid";

const ROOM_DURATION_SECONDS = 3600 * 2; // 2 hours

// Only team members create rooms. Guests get in with the invite link.
export async function POST() {
  const member = await getTeamMember();
  if (!member) return unauthorized();

  try {
    const dailyRoomName = generateRoomId();
    const expiresAtSeconds =
      Math.floor(Date.now() / 1000) + ROOM_DURATION_SECONDS;

    // Create Daily.co room. "private" means nobody gets in without a meeting
    // token, and only /api/rooms/[roomId]/join hands those out.
    const dailyRes = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: dailyRoomName,
        privacy: "private",
        properties: {
          max_participants: 10,
          exp: expiresAtSeconds,
          eject_at_room_exp: true,
          enable_chat: true,
          enable_knocking: false,
          start_video_off: false,
          start_audio_off: false,
          // Transcription permissions
          permissions: {
            canAdmin: ["transcription"],
          },
        },
      }),
    });

    if (!dailyRes.ok) {
      const error = await dailyRes.text();
      console.error("Daily.co error:", error);
      return Response.json(
        { error: "Não foi possível criar a sala de vídeo" },
        { status: 500 },
      );
    }

    const dailyData = await dailyRes.json();
    const inviteToken = generateInviteToken();

    const [room] = await db
      .insert(rooms)
      .values({
        dailyRoomName: dailyData.name,
        dailyRoomUrl: dailyData.url,
        createdBy: member.userId,
        inviteToken,
        expiresAt: new Date(expiresAtSeconds * 1000),
      })
      .returning();

    return Response.json({
      roomId: room.dailyRoomName,
      invitePath: `/${room.dailyRoomName}?convite=${inviteToken}`,
    });
  } catch (error) {
    console.error("Error creating room:", error);
    return Response.json(
      { error: "Não foi possível criar a sala" },
      { status: 500 },
    );
  }
}
