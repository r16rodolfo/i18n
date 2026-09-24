"use client";

import { useCallback, useEffect, useState } from "react";

import type { EntryMode } from "@/db/schema";

import type { RoomSettings } from "../types";

// Team only, inside the call: the room's lock and entry mode, and the guests
// waiting to be let in (checked every 3 s).

const POLL_MS = 3000;

export interface WaitingGuest {
  id: string;
  username: string;
  preferredLanguage: string;
}

export function useRoomEntry(
  roomId: string,
  initial: RoomSettings | null,
  enabled: boolean,
) {
  const [settings, setSettings] = useState<RoomSettings | null>(initial);
  const [waiting, setWaiting] = useState<WaitingGuest[]>([]);

  const updateSettings = useCallback(
    async (change: { locked?: boolean; entryMode?: EntryMode }) => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        });
        if (res.ok) setSettings(await res.json());
      } catch (error) {
        console.error("[Room] settings update failed:", error);
      }
    },
    [roomId],
  );

  const decide = useCallback(
    async (requestId: string, approve: boolean) => {
      // Hide it right away; the next check confirms
      setWaiting((current) => current.filter((g) => g.id !== requestId));
      try {
        await fetch(`/api/rooms/${roomId}/join-requests/${requestId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: approve ? "approve" : "deny" }),
        });
      } catch (error) {
        console.error("[Room] decision failed:", error);
      }
    },
    [roomId],
  );

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/join-requests`, {
          cache: "no-store",
        });
        if (!res.ok || stopped) return;
        const { requests } = (await res.json()) as {
          requests: WaitingGuest[];
        };
        setWaiting(requests);
      } catch {
        // Try again on the next round
      }
    };
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [roomId, enabled]);

  return { settings, updateSettings, waiting, decide };
}
