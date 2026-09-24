import { z } from "zod";

import { db } from "@/db";
import { participants } from "@/db/schema";
import { isValidLanguageCode } from "@/lib/languages";
import { getRoomAccess } from "@/lib/room-access";
import { getActiveTranslationProvider } from "@/lib/translation-providers";

const JoinRequestSchema = z.object({
  visitorId: z.string().min(1).max(100),
  username: z.string().trim().min(1).max(60),
  preferredLanguage: z.string().refine(isValidLanguageCode).optional(),
  email: z.email().optional(),
  inviteToken: z.string().max(100).nullish(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const parsed = JoinRequestSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success) {
      return Response.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const { visitorId, username, preferredLanguage, email, inviteToken } =
      parsed.data;

    const access = await getRoomAccess(roomId, inviteToken);
    if (!access) {
      // Same answer for "no such room" and "not allowed", on purpose
      return Response.json(
        { error: "Link inválido ou reunião encerrada" },
        { status: 403 },
      );
    }
    const { room, member } = access;

    // Upsert participant
    const participantId = `${visitorId}_${room.id}`;
    const language = preferredLanguage || "en";

    await db
      .insert(participants)
      .values({
        id: participantId,
        visitorId,
        roomId: room.id,
        username,
        preferredLanguage: language,
        email: email || null,
      })
      .onConflictDoUpdate({
        target: participants.id,
        set: {
          username,
          preferredLanguage: language,
          email: email || null,
          joinedAt: new Date(),
        },
      });

    // The meeting token is the only way into the private Daily room.
    // It never outlives the room.
    const roomExp = room.expiresAt
      ? Math.floor(room.expiresAt.getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 3600 * 2;

    const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: room.dailyRoomName,
          user_name: username,
          user_id: member ? member.userId : visitorId,
          is_owner: Boolean(member),
          exp: roomExp,
          permissions: {
            canAdmin: ["transcription"],
          },
        },
      }),
    });

    if (!tokenRes.ok) {
      const error = await tokenRes.text();
      console.error("Daily.co token error:", error);
      return Response.json(
        { error: "Não foi possível entrar na chamada" },
        { status: 500 },
      );
    }

    const { token } = await tokenRes.json();

    return Response.json({
      token,
      roomUrl: room.dailyRoomUrl,
      dailyRoomName: room.dailyRoomName,
      isTeamMember: Boolean(member),
      // Only the team gets the guest link, to share it from inside the call
      invitePath:
        member && room.inviteToken
          ? `/${room.dailyRoomName}?convite=${room.inviteToken}`
          : null,
      translationProvider: await getActiveTranslationProvider(),
    });
  } catch (error) {
    console.error("Error joining room:", error);
    return Response.json(
      { error: "Não foi possível entrar na chamada" },
      { status: 500 },
    );
  }
}
