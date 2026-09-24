"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DailyCall } from "@daily-co/daily-js";
import { useDailyEvent } from "@daily-co/daily-react";
import { nanoid } from "nanoid";

import { isValidLanguageCode, type LanguageCode } from "@/lib/languages";

import type { LiveTranscript, TranscriptEntry } from "../types";

// Shares what each person says with everyone in the call, translated, like
// TV subtitles: speech arrives in short finished pieces (3 to 6 seconds,
// see use-scribe) and each piece is shown once it is translated, without
// being rewritten afterwards. The last two pieces stay on screen.
//
// Each browser transcribes only its own mic. For every finished piece the
// speaker's browser:
//   1. broadcasts the original text (Daily app message)
//   2. asks the server to translate it into the languages the others want
//      (the server also saves it in the meeting transcript)
//   3. broadcasts the translations
// Everyone announces the language they want to read when they join, and
// only ever sees text in that language.

const MESSAGE_KIND = "r16-caption";
const MAX_TEXT = 2000;
const MAX_ENTRIES = 100;
// Subtitle lines kept on screen
const MAX_LINES = 2;
// The subtitle disappears after this long without anything new
const CAPTION_HOLD_MS = 7000;
// If a translation doesn't come by then, show the original words
const TRANSLATION_TIMEOUT_MS = 5000;

type CaptionMessage =
  | { kind: typeof MESSAGE_KIND; type: "lang"; lang: string; ask?: boolean }
  | {
      kind: typeof MESSAGE_KIND;
      type: "partial";
      name: string;
      text: string;
      lang: string;
    }
  | {
      kind: typeof MESSAGE_KIND;
      type: "final";
      id: string;
      name: string;
      text: string;
      lang: string;
    }
  | {
      kind: typeof MESSAGE_KIND;
      type: "translation";
      id: string;
      translations: Record<string, string>;
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

const clean = (value: unknown, max: number) =>
  String(value ?? "").slice(0, max);

export interface CaptionLine {
  id: string;
  text: string;
  // In another language and not translated yet: `text` is not shown
  translating: boolean;
}

export interface LiveCaption {
  speakerId: string;
  speaker: string;
  // Finished pieces, oldest first
  lines: CaptionLine[];
  // Still talking (a new piece is on its way)
  talking: boolean;
  // What is being said right now, only when it is in your language
  partialText?: string;
}

interface UseCaptionsOptions {
  daily: DailyCall | null;
  ready: boolean;
  myName: string;
  // The language you speak (what your mic is transcribed in)
  spokenLanguage: LanguageCode;
  // The language you want to read the others in
  preferredLanguage: LanguageCode;
  roomId: string;
  inviteToken: string | null;
  visitorId: string;
}

export function useCaptions({
  daily,
  ready,
  myName,
  spokenLanguage,
  preferredLanguage,
  roomId,
  inviteToken,
  visitorId,
}: UseCaptionsOptions) {
  const [live, setLive] = useState<LiveCaption | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const liveRef = useRef<LiveCaption | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Language each other participant wants to read, by Daily session id
  const languagesRef = useRef<Map<string, LanguageCode>>(new Map());

  const setCaption = useCallback((caption: LiveCaption | null) => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    liveRef.current = caption;
    setLive(caption);
    if (caption) {
      clearTimerRef.current = setTimeout(() => {
        liveRef.current = null;
        setLive(null);
      }, CAPTION_HOLD_MS);
    }
  }, []);

  // Keeps the lines when the same person goes on talking
  const captionFor = useCallback(
    (speakerId: string, speaker: string): LiveCaption => {
      const current = liveRef.current;
      return current?.speakerId === speakerId
        ? current
        : { speakerId, speaker, lines: [], talking: false };
    },
    [],
  );

  const updateLine = useCallback(
    (id: string, change: Partial<CaptionLine>) => {
      const current = liveRef.current;
      if (!current?.lines.some((line) => line.id === id)) return;
      setCaption({
        ...current,
        lines: current.lines.map((line) =>
          line.id === id ? { ...line, ...change } : line,
        ),
      });
    },
    [setCaption],
  );

  const addEntry = useCallback((entry: TranscriptEntry) => {
    setEntries((prev) => [...prev.slice(-(MAX_ENTRIES - 1)), entry]);
  }, []);

  const send = useCallback(
    (message: Outgoing<CaptionMessage>, to = "*") => {
      if (!daily || !ready) return;
      daily.sendAppMessage({ kind: MESSAGE_KIND, ...message }, to);
    },
    [daily, ready],
  );

  const getMyId = useCallback(
    () => daily?.participants().local?.session_id ?? "local",
    [daily],
  );

  // What you are saying right now (changes as you speak)
  const publishPartial = useCallback(
    (text: string) => {
      const caption = captionFor(getMyId(), myName);
      setCaption({ ...caption, talking: true, partialText: text });
      send({ type: "partial", name: myName, text, lang: spokenLanguage });
    },
    [captionFor, getMyId, myName, setCaption, send, spokenLanguage],
  );

  // A finished piece of your speech: show and share it, then get and share
  // its translations
  const publishFinal = useCallback(
    async (text: string) => {
      const id = nanoid(12);
      const caption = captionFor(getMyId(), myName);
      setCaption({
        ...caption,
        lines: [...caption.lines, { id, text, translating: false }].slice(
          -MAX_LINES,
        ),
        talking: false,
        partialText: undefined,
      });
      addEntry({
        id,
        speaker: myName,
        original: text,
        translated: text,
        timestamp: new Date(),
      });
      send({ type: "final", id, name: myName, text, lang: spokenLanguage });

      // Saved in the transcript even when nobody needs a translation
      const targets = [...new Set(languagesRef.current.values())];
      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(roomId)}/captions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invite: inviteToken,
              id,
              text,
              language: spokenLanguage,
              targets,
              speakerName: myName,
              visitorId,
            }),
          },
        );
        if (!res.ok) {
          console.error("[Captions] translation request failed:", res.status);
          return;
        }
        const { translations } = (await res.json()) as {
          translations?: Record<string, string>;
        };
        if (translations && Object.keys(translations).length > 0) {
          send({ type: "translation", id, translations });
        }
      } catch (error) {
        console.error("[Captions] translation request failed:", error);
      }
    },
    [
      captionFor,
      getMyId,
      myName,
      setCaption,
      addEntry,
      send,
      spokenLanguage,
      roomId,
      inviteToken,
      visitorId,
    ],
  );

  useDailyEvent(
    "app-message",
    useCallback(
      (event) => {
        if (!event || !isCaptionMessage(event.data)) return;
        const message = event.data;
        const from = event.fromId;

        switch (message.type) {
          case "lang": {
            const lang = clean(message.lang, 8);
            if (isValidLanguageCode(lang)) languagesRef.current.set(from, lang);
            // Someone just joined: tell them which language you want
            if (message.ask) {
              send({ type: "lang", lang: preferredLanguage }, from);
            }
            break;
          }
          case "partial": {
            const text = clean(message.text, MAX_TEXT);
            if (!text) return;
            const sameLanguage = clean(message.lang, 8) === preferredLanguage;
            const caption = captionFor(from, clean(message.name, 60));
            setCaption({
              ...caption,
              talking: true,
              // Words in another language would only confuse
              partialText: sameLanguage ? text : undefined,
            });
            break;
          }
          case "final": {
            const text = clean(message.text, MAX_TEXT);
            const id = clean(message.id, 32);
            if (!text || !id) return;
            const name = clean(message.name, 60);
            const needsTranslation =
              clean(message.lang, 8) !== preferredLanguage;
            const caption = captionFor(from, name);
            setCaption({
              ...caption,
              lines: [
                ...caption.lines,
                { id, text, translating: needsTranslation },
              ].slice(-MAX_LINES),
              talking: false,
              partialText: undefined,
            });
            addEntry({
              id,
              speaker: name,
              original: text,
              translated: text,
              timestamp: new Date(),
            });
            if (needsTranslation) {
              // Translation lost or too slow: the original beats nothing
              setTimeout(() => {
                const line = liveRef.current?.lines.find((l) => l.id === id);
                if (line?.translating) updateLine(id, { translating: false });
              }, TRANSLATION_TIMEOUT_MS);
            }
            break;
          }
          case "translation": {
            const id = clean(message.id, 32);
            const text = clean(
              message.translations?.[preferredLanguage],
              MAX_TEXT,
            );
            if (!id || !text) return;
            setEntries((prev) =>
              prev.map((entry) =>
                entry.id === id ? { ...entry, translated: text } : entry,
              ),
            );
            updateLine(id, { text, translating: false });
            break;
          }
        }
      },
      [preferredLanguage, send, captionFor, setCaption, addEntry, updateLine],
    ),
  );

  // People who leave no longer need translations
  useDailyEvent(
    "participant-left",
    useCallback((event) => {
      const left = event?.participant?.session_id;
      if (left) languagesRef.current.delete(left);
    }, []),
  );

  // Announce the language you want, and ask the others for theirs
  useEffect(() => {
    if (ready) send({ type: "lang", lang: preferredLanguage, ask: true });
  }, [ready, preferredLanguage, send]);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  return { live, entries, publishPartial, publishFinal };
}

// What the agent panel shows as "speaking now"
export function liveTranscriptOf(
  caption: LiveCaption | null,
): LiveTranscript | null {
  return caption?.talking && caption.partialText
    ? { speaker: caption.speaker, text: caption.partialText }
    : null;
}
