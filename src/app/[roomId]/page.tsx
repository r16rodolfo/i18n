import { redirect } from "next/navigation";

import { getTeamMember } from "@/lib/auth";
import { getRoomAccess } from "@/lib/room-access";
import { getActiveTranslationProvider } from "@/lib/translation-providers";
import { getActiveVoiceEngine } from "@/lib/voice-engines";

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

  // Locked: the team closed the room to new guests
  if (!access.member && access.room.lockedAt) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-light text-black">
            Esta reunión ya no acepta nuevas entradas
          </h1>
          <p className="text-neutral-600">
            Si crees que es un error, habla con quien te invitó.
          </p>
          <p className="text-sm text-neutral-500 pt-4">
            Esta reunião não aceita mais entradas. Se achar que é um engano,
            fale com quem te convidou.
          </p>
        </div>
      </div>
    );
  }

  // Soniox/ElevenLabs voice: each person picks theirs when joining
  const voiceEngine = await getActiveVoiceEngine(
    await getActiveTranslationProvider(),
  );

  return (
    <RoomClient
      roomId={roomId}
      inviteToken={access.member ? null : inviteToken}
      isTeamMember={Boolean(access.member)}
      askVoice={voiceEngine === "soniox" || voiceEngine === "elevenlabs"}
    />
  );
}
