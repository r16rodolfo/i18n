import Link from "next/link";

import { desc, gt } from "drizzle-orm";

import { db } from "@/db";
import { rooms } from "@/db/schema";
import { requireTeamMember } from "@/lib/auth";

import { CopyInviteButton } from "@/components/copy-invite-button";
import { TeamHeader } from "@/components/team-header";
import { Button } from "@/components/ui/button";

import { DeleteRoomButton } from "./delete-room-button";
import { NewMeetingButton } from "./new-meeting-button";
import { RoomEntryButtons } from "./room-entry-buttons";

export const metadata = { title: "R16 Meet" };

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export default async function HomePage() {
  const member = await requireTeamMember();

  const activeRooms = await db.query.rooms.findMany({
    where: gt(rooms.expiresAt, new Date()),
    orderBy: desc(rooms.createdAt),
    limit: 20,
  });

  return (
    <div className="min-h-screen bg-neutral-100">
      <TeamHeader member={member} />

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-10">
        <section className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-light tracking-tight text-black">
              Reuniões
            </h1>
            <p className="text-neutral-600">
              Crie a sala na hora da reunião e envie o convite ao cliente. A
              sala fica aberta por 2 horas.
            </p>
          </div>
          <NewMeetingButton />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium tracking-widest uppercase text-neutral-500">
            Salas abertas agora
          </h2>

          {activeRooms.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhuma sala aberta.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-xl bg-white border border-neutral-200">
              {activeRooms.map((room) => (
                <li
                  key={room.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-black">
                      {room.dailyRoomName}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Criada às {timeFormat.format(room.createdAt)}
                      {room.expiresAt &&
                        ` · fecha às ${timeFormat.format(room.expiresAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <RoomEntryButtons
                      roomName={room.dailyRoomName}
                      locked={Boolean(room.lockedAt)}
                      entryMode={room.entryMode}
                    />
                    {room.inviteToken && (
                      <CopyInviteButton
                        invitePath={`/${room.dailyRoomName}?convite=${room.inviteToken}`}
                      />
                    )}
                    <Button
                      asChild
                      size="sm"
                      className="bg-black text-white hover:bg-neutral-800"
                    >
                      <Link href={`/${room.dailyRoomName}`}>Entrar</Link>
                    </Button>
                    {(room.createdBy === member.userId ||
                      member.role === "admin") && (
                      <DeleteRoomButton roomName={room.dailyRoomName} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
