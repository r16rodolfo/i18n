"use client";

import { useCallback, useEffect, useRef } from "react";

import type { DailyCall } from "@daily-co/daily-js";
import { useDailyEvent } from "@daily-co/daily-react";

// Diagnostics: notes what happens in this browser during the call (joined,
// languages, mic, turn-taking, errors) and sends it in small batches, so
// we can find out afterwards why someone wasn't heard or translated.

const FLUSH_MS = 15_000;

interface DiagnosticEvent {
  type: string;
  at: number;
  data?: Record<string, unknown>;
}

interface UseCallDiagnosticsOptions {
  daily: DailyCall | null;
  enabled: boolean;
  roomId: string;
  inviteToken: string | null;
  visitorId: string;
  username: string;
}

export function useCallDiagnostics({
  daily,
  enabled,
  roomId,
  inviteToken,
  visitorId,
  username,
}: UseCallDiagnosticsOptions) {
  const queueRef = useRef<DiagnosticEvent[]>([]);

  const log = useCallback((type: string, data?: Record<string, unknown>) => {
    queueRef.current.push({ type, at: Date.now(), data });
    if (queueRef.current.length > 200) queueRef.current.shift();
  }, []);

  const flush = useCallback(() => {
    const events = queueRef.current.splice(0, 50);
    if (events.length === 0) return;
    fetch(`/api/rooms/${encodeURIComponent(roomId)}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        invite: inviteToken,
        visitorId,
        username,
        events,
      }),
    }).catch(() => {
      // Diagnostics only: losing a batch is fine
    });
  }, [roomId, inviteToken, visitorId, username]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(flush, FLUSH_MS);
    window.addEventListener("pagehide", flush);
    const onError = (event: ErrorEvent) =>
      log("page-error", { message: String(event.message).slice(0, 300) });
    const onRejection = (event: PromiseRejectionEvent) =>
      log("page-error", { message: String(event.reason).slice(0, 300) });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      flush();
    };
  }, [enabled, flush, log]);

  // Daily: device/permission problems and who comes and goes
  useDailyEvent(
    "camera-error",
    useCallback(
      (event) =>
        log("device-error", {
          type: event?.error?.type,
          message: String(event?.errorMsg?.errorMsg ?? "").slice(0, 300),
        }),
      [log],
    ),
  );
  useDailyEvent(
    "nonfatal-error",
    useCallback(
      (event) =>
        log("daily-warning", {
          type: event?.type,
          message: String(event?.errorMsg ?? "").slice(0, 300),
        }),
      [log],
    ),
  );
  useDailyEvent(
    "error",
    useCallback(
      (event) =>
        log("daily-error", {
          message: String(event?.errorMsg ?? "").slice(0, 300),
        }),
      [log],
    ),
  );
  useDailyEvent(
    "participant-joined",
    useCallback(
      (event) => log("someone-joined", { name: event?.participant?.user_name }),
      [log],
    ),
  );
  useDailyEvent(
    "participant-left",
    useCallback(
      (event) => log("someone-left", { name: event?.participant?.user_name }),
      [log],
    ),
  );

  // Your own microphone as Daily sees it (on/off/blocked)
  useEffect(() => {
    if (!daily || !enabled) return;
    let last = "";
    const timer = setInterval(() => {
      const audio = daily.participants().local?.tracks.audio;
      const state = audio
        ? `${audio.state}${audio.off ? `:${JSON.stringify(audio.off)}` : ""}`
        : "none";
      if (state !== last) {
        last = state;
        log("my-mic", { state });
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [daily, enabled, log]);

  return log;
}
