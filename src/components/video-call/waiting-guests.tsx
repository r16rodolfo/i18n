"use client";

import { UserPlus } from "lucide-react";

import { getLanguageFlag } from "@/lib/languages";

import { Button } from "@/components/ui/button";

import type { WaitingGuest } from "./hooks/use-room-entry";

// Team only: "Fulano quer entrar" cards, top right of the call
export function WaitingGuests({
  guests,
  onDecide,
}: {
  guests: WaitingGuest[];
  onDecide: (requestId: string, approve: boolean) => void;
}) {
  if (guests.length === 0) return null;

  return (
    <div className="absolute right-4 top-4 z-50 flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2">
      {guests.map((guest) => (
        <div
          key={guest.id}
          role="alert"
          className="rounded-xl border border-white/10 bg-neutral-950/95 p-4 text-white shadow-2xl"
        >
          <p className="flex items-center gap-2 text-sm">
            <UserPlus className="h-4 w-4 shrink-0 text-emerald-400" />
            <span className="min-w-0">
              <span className="font-medium">{guest.username}</span>{" "}
              <span aria-hidden>
                {getLanguageFlag(guest.preferredLanguage)}
              </span>{" "}
              quer entrar na reunião
            </span>
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDecide(guest.id, false)}
              className="cursor-pointer border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              Recusar
            </Button>
            <Button
              size="sm"
              onClick={() => onDecide(guest.id, true)}
              className="cursor-pointer bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Admitir
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
