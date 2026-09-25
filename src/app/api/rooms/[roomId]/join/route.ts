import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  type JoinRequestStatus,
  joinRequests,
  participants,
} from "@/db/schema";
import { isValidLanguageCode } from "@/lib/languages";
import { getRoomAccess } from "@/lib/room-access";
import { getActiveTranslationProvider } from "@/lib/translation-providers";

const JoinRequestSchema = z.object({
  visitorId: z.string().min(1).max(100),
  username: z.string().trim().min(1).max(60),
  preferredLanguage: z.string().refine(isValidLanguageCode).optional(),
  email: z.email().optional(),
  inviteToken: z.string().max(100).nullish(),
  // Waiting room: the ticket from an earlier "wait" answer
  requestId: z.uuid().nullish(),
});

// Gets someone into the call: checks access, then hands out a Daily meeting
// token. Guests may be stopped on the way:
// - locked room (423): the invite no longer works for new entries
// - "approval" room: the guest gets a waiting ticket (202) and asks again
//   with it every few seconds until a team member admits (200) or refuses
//   (403, reason "denied") them. Team members always go straight in.
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
    const {
      visitorId,
      username,
      preferredLanguage,
      email,
      inviteToken,
      requestId,
    } = parsed.data;

    const access = await getRoomAccess(roomId, inviteToken);
    if (!access) {
      // Same answer for "no such room" and "not allowed", on purpose
      return Response.json(
        { error: "Link inválido ou reunião encerrada" },
        { status: 403 },
      );
    }
    const { room, member } = access;
    const language = preferredLanguage || "en";

    if (!member) {
      if (room.lockedAt) {
        return Response.json(
          { error: "Reunião trancada", reason: "locked" },
          { status: 423 },
        );
      }

      if (room.entryMode === "approval") {
        const existing = requestId
          ? await db.query.joinRequests.findFirst({
              where: and(
                eq(joinRequests.id, requestId),
                eq(joinRequests.roomId, room.id),
                eq(joinRequests.visitorId, visitorId),
              ),
            })
          : undefined;

        let request: { id: string; status: JoinRequestStatus };
        if (existing) {
          request = existing;
          if (existing.status === "pending") {
            // Still waiting on the page: keep the request visible to the team
            await db
              .update(joinRequests)
              .set({ lastSeenAt: new Date() })
              .where(eq(joinRequests.id, existing.id));
          }
        } else {
          const [created] = await db
            .insert(joinRequests)
            .values({
              roomId: room.id,
              visitorId,
              username,
              preferredLanguage: language,
            })
            .returning({ id: joinRequests.id });
          request = { id: String(created.id), status: "pending" };
        }

        if (request.status === "denied") {
          return Response.json(
            { error: "Entrada recusada", reason: "denied" },
            { status: 403 },
          );
        }
        if (request.status !== "approved") {
          return Response.json(
            { status: "waiting", requestId: request.id },
            { status: 202 },
          );
        }
      }
    }

    // Upsert participant
    const participantId = `${visitorId}_${room.id}`;

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
      // Only the team gets the guest link, to share it from inside the call,
      // and the room's entry settings, to change them from there
      invitePath:
        member && room.inviteToken
          ? `/${room.dailyRoomName}?convite=${room.inviteToken}`
          : null,
      roomSettings: member
        ? { locked: Boolean(room.lockedAt), entryMode: room.entryMode }
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
