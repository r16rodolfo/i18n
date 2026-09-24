import { redirect } from "next/navigation";

import { getTeamMember } from "@/lib/auth";
import { getRoomAccess } from "@/lib/room-access";

import { RoomClient } from "./room-client";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ convite?: string | string[] }>;
}) {
  const { roomId } = await params;
  const { convite } = await searchParams;
  const inviteToken = typeof convite === "string" ? convite : null;

  const access = await getRoomAccess(roomId, inviteToken);

  if (!access) {
    // A team member who opened a plain room link just needs to log in
    if (!inviteToken && !(await getTeamMember())) redirect("/entrar");

    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-light text-black">
            Enlace no válido o reunión terminada
          </h1>
          <p className="text-neutral-600">
            Pide un nuevo enlace a quien te invitó.
          </p>
          <p className="text-sm text-neutral-500 pt-4">
            Link inválido ou reunião encerrada. Peça um novo link a quem te
            convidou.
          </p>
        </div>
      </div>
    );
  }

  return (
    <RoomClient
      roomId={roomId}
      inviteToken={access.member ? null : inviteToken}
      isTeamMember={Boolean(access.member)}
    />
  );
}
