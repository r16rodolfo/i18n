"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { DoorOpen, Loader2, Lock, LockOpen, ShieldCheck } from "lucide-react";

import type { EntryMode } from "@/db/schema";

import { Button } from "@/components/ui/button";

// Dashboard: lock/unlock a room and switch how guests get in
export function RoomEntryButtons({
  roomName,
  locked,
  entryMode,
}: {
  roomName: string;
  locked: boolean;
  entryMode: EntryMode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = (change: { locked?: boolean; entryMode?: EntryMode }) => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/rooms/${roomName}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      }).catch(() => null);
      if (!res?.ok) {
        setError("Não foi possível mudar a sala");
        return;
      }
      router.refresh();
    });
  };

  const approval = entryMode === "approval";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => update({ entryMode: approval ? "open" : "approval" })}
          className="cursor-pointer"
          title={
            approval
              ? "Visitantes esperam alguém da equipe admitir. Clique para deixar entrar direto."
              : "Visitantes entram direto com o convite. Clique para exigir autorização."
          }
        >
          {approval ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          ) : (
            <DoorOpen className="w-4 h-4" />
          )}
          {approval ? "Com autorização" : "Entrada direta"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => update({ locked: !locked })}
          className={`cursor-pointer ${locked ? "text-amber-700" : ""}`}
          title={
            locked
              ? "Sala trancada: o convite não funciona para quem ainda não entrou. Clique para destrancar."
              : "Trancar: o convite para de funcionar para quem ainda não entrou. Quem está dentro continua."
          }
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : locked ? (
            <Lock className="w-4 h-4" />
          ) : (
            <LockOpen className="w-4 h-4" />
          )}
          {locked ? "Trancada" : "Trancar"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
