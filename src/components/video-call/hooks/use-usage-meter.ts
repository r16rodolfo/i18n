"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ServiceTotal } from "@/lib/usage";

// Cost estimate of the meeting.
// - Everyone: tells the server, about once a minute and when leaving, how
//   long they were in the call and how long the translation engine was
//   listening to them.
// - Team: reads the meeting's estimated cost so far.

const REPORT_EVERY_MS = 60_000;
const COST_POLL_MS = 30_000;
// A tab in the background ticks slowly; never count more than this per tick
const MAX_TICK_MS = 65_000;

export type MeteredEngine = "soniox" | "elevenlabs" | "palabra";

interface UseUsageMeterOptions {
  enabled: boolean;
  roomId: string;
  inviteToken?: string | null;
  visitorId: string;
  engine: MeteredEngine | null;
  // Is the engine listening to this person right now?
  engineActive: boolean;
}

export function useUsageMeter({
  enabled,
  roomId,
  inviteToken,
  visitorId,
  engine,
  engineActive,
}: UseUsageMeterOptions) {
  const pending = useRef({ callMs: 0, engineMs: 0 });
  const lastTick = useRef(0);
  const engineActiveRef = useRef(engineActive);
  const engineRef = useRef(engine);

  // Counts the time since the last tick with the state it had until now
  const tick = useCallback(() => {
    const now = Date.now();
    const elapsed = Math.min(now - lastTick.current, MAX_TICK_MS);
    lastTick.current = now;
    if (elapsed <= 0) return;
    pending.current.callMs += elapsed;
    if (engineActiveRef.current) pending.current.engineMs += elapsed;
  }, []);

  useEffect(() => {
    tick();
    engineActiveRef.current = engineActive;
    engineRef.current = engine;
  }, [engineActive, engine, tick]);

  const report = useCallback(() => {
    tick();
    const { callMs, engineMs } = pending.current;
    if (callMs < 1000) return;
    pending.current = { callMs: 0, engineMs: 0 };
    const seconds = (ms: number) => Math.min(120, Math.round(ms / 1000));
    // keepalive: still delivered when the page is closing
    fetch(`/api/rooms/${roomId}/usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        invite: inviteToken,
        visitorId,
        callSeconds: seconds(callMs),
        engine: engineRef.current,
        engineSeconds: seconds(engineMs),
      }),
    }).catch(() => {
      // Lost report: the estimate is only a little low
    });
  }, [roomId, inviteToken, visitorId, tick]);

  useEffect(() => {
    if (!enabled) return;
    lastTick.current = Date.now();
    pending.current = { callMs: 0, engineMs: 0 };
    const timer = setInterval(report, REPORT_EVERY_MS);
    window.addEventListener("pagehide", report);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", report);
      report();
    };
  }, [enabled, report]);
}

export interface MeetingCost {
  totalUsd: number;
  services: ServiceTotal[];
}

// Team only: the meeting's estimated cost so far, refreshed every 30 s
export function useMeetingCost(roomId: string, enabled: boolean) {
  const [cost, setCost] = useState<MeetingCost | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/usage`, {
          cache: "no-store",
        });
        if (res.ok && !stopped) setCost(await res.json());
      } catch {
        // Try again on the next round
      }
    };
    load();
    const timer = setInterval(load, COST_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [roomId, enabled]);

  return cost;
}
