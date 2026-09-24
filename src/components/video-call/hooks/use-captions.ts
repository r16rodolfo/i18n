"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DailyCall } from "@daily-co/daily-js";
import { useDailyEvent } from "@daily-co/daily-react";
import { nanoid } from "nanoid";

import type { LiveTranscript, TranscriptEntry } from "../types";

// Shares what each person says with everyone in the call. Each browser
// transcribes only its own mic and broadcasts the text through Daily app
// messages; the others show it as a caption. (Next step: translated text.)

const MESSAGE_KIND = "r16-caption";
const MAX_TEXT = 2000;
const MAX_ENTRIES = 100;
// How long a finished phrase stays on screen
const CAPTION_HOLD_MS = 5000;

type CaptionMessage =
  | { kind: typeof MESSAGE_KIND; type: "partial"; name: string; text: string }
  | {
      kind: typeof MESSAGE_KIND;
      type: "final";
      id: string;
      name: string;
      text: string;
    };

// Omit that keeps each variant of the union intact
type Outgoing<T> = T extends unknown ? Omit<T, "kind"> : never;

function isCaptionMessage(data: unknown): data is CaptionMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { kind?: unknown }).kind === MESSAGE_KIND
  );
}

export interface LiveCaption extends LiveTranscript {
  speakerId: string;
  // false while the phrase is still being spoken
  final: boolean;
}

interface UseCaptionsOptions {
  daily: DailyCall | null;
  ready: boolean;
  myName: string;
}

export function useCaptions({ daily, ready, myName }: UseCaptionsOptions) {
  const [live, setLive] = useState<LiveCaption | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((caption: LiveCaption) => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    setLive(caption);
    if (caption.final) {
      clearTimerRef.current = setTimeout(() => setLive(null), CAPTION_HOLD_MS);
    }
  }, []);

  const addEntry = useCallback((id: string, speaker: string, text: string) => {
    setEntries((prev) => [
      ...prev.slice(-(MAX_ENTRIES - 1)),
      { id, speaker, original: text, translated: text, timestamp: new Date() },
    ]);
  }, []);

  const send = useCallback(
    (message: Outgoing<CaptionMessage>) => {
      if (!daily || !ready) return;
      daily.sendAppMessage({ kind: MESSAGE_KIND, ...message }, "*");
    },
    [daily, ready],
  );

  const getMyId = useCallback(
    () => daily?.participants().local?.session_id ?? "local",
    [daily],
  );

  // The phrase you are saying right now (changes as you speak)
  const publishPartial = useCallback(
    (text: string) => {
      show({ speakerId: getMyId(), speaker: myName, text, final: false });
      send({ type: "partial", name: myName, text });
    },
    [getMyId, myName, show, send],
  );

  // A finished phrase
  const publishFinal = useCallback(
    (text: string) => {
      const id = nanoid(12);
      show({ speakerId: getMyId(), speaker: myName, text, final: true });
      addEntry(id, myName, text);
      send({ type: "final", id, name: myName, text });
    },
    [getMyId, myName, show, addEntry, send],
  );

  useDailyEvent(
    "app-message",
    useCallback(
      (event) => {
        if (!event || !isCaptionMessage(event.data)) return;
        const message = event.data;
        const text = String(message.text ?? "").slice(0, MAX_TEXT);
        const name = String(message.name ?? "").slice(0, 60);
        if (!text) return;

        if (message.type === "partial") {
          show({ speakerId: event.fromId, speaker: name, text, final: false });
        } else if (message.type === "final") {
          show({ speakerId: event.fromId, speaker: name, text, final: true });
          addEntry(String(message.id || nanoid(12)).slice(0, 32), name, text);
        }
      },
      [show, addEntry],
    ),
  );

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  return { live, entries, publishPartial, publishFinal };
}
