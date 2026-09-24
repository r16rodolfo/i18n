"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DailyCall } from "@daily-co/daily-js";
import { useDailyEvent } from "@daily-co/daily-react";
import { nanoid } from "nanoid";

import { isValidLanguageCode, type LanguageCode } from "@/lib/languages";

import { findCut, splitWords } from "../caption-pieces";
import type { LiveTranscript, TranscriptEntry } from "../types";

// Shares what each person says with everyone in the call, translated, like
// TV subtitles: while you talk, your words are cut into short pieces at
// punctuation, between whole words (caption-pieces.ts), and each piece is
// shown once it is translated, without being rewritten afterwards. The last
// two pieces stay on screen.
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
// Earlier pieces sent to the translator as context
const CONTEXT_PIECES = 6;

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
      // Soniox: already translated, no separate "translation" message
      translations?: Record<string, string>;
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

  // Original words of the last pieces (everyone's), for translation context
  const recentRef = useRef<string[]>([]);

  const addEntry = useCallback((entry: TranscriptEntry) => {
    recentRef.current = [
      ...recentRef.current,
      entry.original.slice(0, 500),
    ].slice(-CONTEXT_PIECES);
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

  // Words of the current phrase already sent out as pieces
  const sentWordsRef = useRef(0);

  // A finished piece of your speech: show and share it, then get and share
  // its translations. Soniox hands them over ready (`ready`): they go out
  // with the piece and the server only saves them.
  const emitPiece = useCallback(
    async (text: string, ready?: Record<string, string>) => {
      const id = nanoid(12);
      const hasReady = Boolean(ready && Object.keys(ready).length > 0);
      // Before this piece is added to the list
      const context = recentRef.current;
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
      send({
        type: "final",
        id,
        name: myName,
        text,
        lang: spokenLanguage,
        ...(hasReady ? { translations: ready } : {}),
      });

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
              context,
              speakerName: myName,
              visitorId,
              ...(ready ? { translations: ready } : {}),
            }),
          },
        );
        if (ready) return;
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

  // What you are saying right now (changes as you speak). Settled parts of
  // a long phrase go out as pieces without waiting for you to pause.
  const publishPartial = useCallback(
    (text: string) => {
      let unsent = splitWords(text).slice(sentWordsRef.current);
      const cut = findCut(unsent);
      if (cut > 0) {
        emitPiece(unsent.slice(0, cut).join(" "));
        sentWordsRef.current += cut;
        unsent = unsent.slice(cut);
      }

      const rest = unsent.join(" ");
      const caption = captionFor(getMyId(), myName);
      setCaption({ ...caption, talking: true, partialText: rest || undefined });
      if (rest) {
        send({
          type: "partial",
          name: myName,
          text: rest,
          lang: spokenLanguage,
        });
      }
    },
    [emitPiece, captionFor, getMyId, myName, setCaption, send, spokenLanguage],
  );

  // The phrase is over (you paused or clicked "Terminei"): what wasn't sent
  // yet becomes the last piece
  const publishFinal = useCallback(
    (text: string) => {
      const rest = splitWords(text).slice(sentWordsRef.current).join(" ");
      sentWordsRef.current = 0;
      if (rest) {
        emitPiece(rest);
        return;
      }
      const current = liveRef.current;
      if (current?.speakerId === getMyId()) {
        setCaption({ ...current, talking: false, partialText: undefined });
      }
    },
    [emitPiece, getMyId, setCaption],
  );

  // Soniox: what you are saying right now (Soniox decides the pieces)
  const showPartial = useCallback(
    (text: string) => {
      const caption = captionFor(getMyId(), myName);
      setCaption({ ...caption, talking: true, partialText: text });
      send({ type: "partial", name: myName, text, lang: spokenLanguage });
    },
    [captionFor, getMyId, myName, setCaption, send, spokenLanguage],
  );

  // Soniox: a finished piece, already translated
  const publishTranslatedPiece = useCallback(
    (original: string, translations: Record<string, string>) => {
      emitPiece(original, translations);
    },
    [emitPiece],
  );

  // The language most of the others read, if it isn't the one you speak
  const getTargetLanguage = useCallback((): LanguageCode | null => {
    const counts = new Map<LanguageCode, number>();
    for (const lang of languagesRef.current.values()) {
      if (lang !== spokenLanguage)
        counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
    let best: LanguageCode | null = null;
    for (const [lang, count] of counts) {
      if (!best || count > (counts.get(best) ?? 0)) best = lang;
    }
    return best;
  }, [spokenLanguage]);

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
            // Soniox pieces arrive already translated
            const ready = clean(
              message.translations?.[preferredLanguage],
              MAX_TEXT,
            );
            const needsTranslation =
              !ready && clean(message.lang, 8) !== preferredLanguage;
            const shown = ready || text;
            const caption = captionFor(from, name);
            setCaption({
              ...caption,
              lines: [
                ...caption.lines,
                { id, text: shown, translating: needsTranslation },
              ].slice(-MAX_LINES),
              talking: false,
              partialText: undefined,
            });
            addEntry({
              id,
              speaker: name,
              original: text,
              translated: shown,
              timestamp: new Date(),
              pending: needsTranslation,
            });
            if (needsTranslation) {
              // Translation lost or too slow: the original beats nothing
              setTimeout(() => {
                const line = liveRef.current?.lines.find((l) => l.id === id);
                if (line?.translating) updateLine(id, { translating: false });
                setEntries((prev) =>
                  prev.map((entry) =>
                    entry.id === id ? { ...entry, pending: false } : entry,
                  ),
                );
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
                entry.id === id
                  ? { ...entry, translated: text, pending: false }
                  : entry,
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

  return {
    live,
    entries,
    publishPartial,
    publishFinal,
    showPartial,
    publishTranslatedPiece,
    getTargetLanguage,
  };
}

// What the transcript panel shows as "speaking now" (empty text when they
// speak another language: the panel shows "translating" instead)
export function liveTranscriptOf(
  caption: LiveCaption | null,
): LiveTranscript | null {
  return caption?.talking
    ? { speaker: caption.speaker, text: caption.partialText ?? "" }
    : null;
}
