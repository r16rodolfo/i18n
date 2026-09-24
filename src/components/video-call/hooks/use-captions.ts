"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DailyCall } from "@daily-co/daily-js";
import { useDailyEvent } from "@daily-co/daily-react";
import { nanoid } from "nanoid";

import { isValidLanguageCode, type LanguageCode } from "@/lib/languages";

import type { LiveTranscript, TranscriptEntry } from "../types";

// Shares what each person says with everyone in the call, translated.
//
// Each browser transcribes only its own mic. When a phrase is finished, the
// speaker's browser:
//   1. broadcasts the original text (Daily app message)
//   2. asks the server to translate it into the languages the others want
//      (the server also saves it in the meeting transcript)
//   3. broadcasts the translations
// While the person is still talking, the unfinished phrase is also
// translated about every second ("partial-translation"), so listeners can
// follow along instead of waiting for the pause.
// Everyone announces the language they want to hear when they join. Each
// person only ever sees text in their own language: while a phrase in
// another language is spoken or translated, a "translating" hint shows.

const MESSAGE_KIND = "r16-caption";
const MAX_TEXT = 2000;
const MAX_ENTRIES = 100;
// How long a finished phrase stays on screen
const CAPTION_HOLD_MS = 6000;
// If the translation doesn't come by then, show the original words
const TRANSLATION_TIMEOUT_MS = 5000;
// While talking: translate the unfinished phrase at most this often...
const PARTIAL_INTERVAL_MS = 1000;
// ...and only once it has a few words
const PARTIAL_MIN_WORDS = 3;

type CaptionMessage =
  | { kind: typeof MESSAGE_KIND; type: "lang"; lang: string; ask?: boolean }
  | {
      kind: typeof MESSAGE_KIND;
      type: "partial";
      id: string;
      name: string;
      text: string;
      lang: string;
    }
  | {
      kind: typeof MESSAGE_KIND;
      type: "partial-translation";
      id: string;
      // Newer requests win when answers arrive out of order
      seq: number;
      translations: Record<string, string>;
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

export interface LiveCaption extends LiveTranscript {
  speakerId: string;
  // Phrase id (the same while it is spoken and once it is finished)
  id?: string;
  // false while the phrase is still being spoken
  final: boolean;
  // Spoken in another language and not translated yet: `text` holds the
  // original words, which are not shown (only a "translating" hint)
  translating?: boolean;
  // `text` is a quick translation of the unfinished phrase; the final one
  // replaces it after the pause
  interim?: boolean;
  seq?: number;
}

interface UseCaptionsOptions {
  daily: DailyCall | null;
  ready: boolean;
  myName: string;
  // The language you speak (what your mic is transcribed in)
  spokenLanguage: LanguageCode;
  // The language you want to read/hear the others in
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
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Language each other participant wants to hear, by Daily session id
  const languagesRef = useRef<Map<string, LanguageCode>>(new Map());
  // Your phrase in progress: its id and the quick translations of it
  const phraseIdRef = useRef<string | null>(null);
  const partialRef = useRef({
    inFlight: false,
    lastAt: 0,
    lastText: "",
    seq: 0,
    pending: null as string | null,
    timer: null as ReturnType<typeof setTimeout> | null,
  });

  const show = useCallback((caption: LiveCaption) => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    liveRef.current = caption;
    setLive(caption);
    if (caption.final) {
      clearTimerRef.current = setTimeout(() => {
        liveRef.current = null;
        setLive(null);
      }, CAPTION_HOLD_MS);
    }
  }, []);

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

  // A translation of a phrase arrived: show it if it is in your language
  const applyTranslation = useCallback(
    (id: string, translations: Record<string, string>) => {
      const text = clean(translations[preferredLanguage], MAX_TEXT);
      if (!text) return;

      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, translated: text } : entry,
        ),
      );
      const current = liveRef.current;
      if (current?.id === id) {
        show({ ...current, text, translating: false, interim: false });
      }
    },
    [preferredLanguage, show],
  );

  // Asks the server to translate a phrase for the others
  const requestTranslations = useCallback(
    async (
      id: string,
      text: string,
      partial: boolean,
    ): Promise<Record<string, string> | null> => {
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
              partial,
            }),
          },
        );
        if (!res.ok) {
          console.error("[Captions] translation request failed:", res.status);
          return null;
        }
        const { translations } = (await res.json()) as {
          translations?: Record<string, string>;
        };
        return translations && Object.keys(translations).length > 0
          ? translations
          : null;
      } catch (error) {
        console.error("[Captions] translation request failed:", error);
        return null;
      }
    },
    [roomId, inviteToken, spokenLanguage, myName, visitorId],
  );

  // Quick translation of your unfinished phrase, at most once a second and
  // one request at a time (the newest text is used when it's free again)
  const translateInProgress = useCallback(() => {
    const state = partialRef.current;
    const id = phraseIdRef.current;
    const text = state.pending;
    if (!id || !text || state.inFlight) return;

    // Only worth it if someone reads another language
    const needed = [...languagesRef.current.values()].some(
      (lang) => lang !== spokenLanguage,
    );
    const words = text.split(/\s+/).filter(Boolean).length;
    if (!needed || words < PARTIAL_MIN_WORDS || text === state.lastText) {
      return;
    }

    const wait = state.lastAt + PARTIAL_INTERVAL_MS - Date.now();
    if (wait > 0) {
      if (!state.timer) {
        state.timer = setTimeout(() => {
          state.timer = null;
          translateInProgress();
        }, wait);
      }
      return;
    }

    state.inFlight = true;
    state.lastAt = Date.now();
    state.lastText = text;
    const seq = ++state.seq;
    requestTranslations(id, text, true).then((translations) => {
      state.inFlight = false;
      // The phrase may have finished meanwhile: the final translation wins
      if (translations && phraseIdRef.current === id) {
        send({ type: "partial-translation", id, seq, translations });
      }
      if (phraseIdRef.current === id) translateInProgress();
    });
  }, [spokenLanguage, requestTranslations, send]);

  // The phrase you are saying right now (changes as you speak)
  const publishPartial = useCallback(
    (text: string) => {
      if (!phraseIdRef.current) phraseIdRef.current = nanoid(12);
      const id = phraseIdRef.current;
      show({ id, speakerId: getMyId(), speaker: myName, text, final: false });
      send({ type: "partial", id, name: myName, text, lang: spokenLanguage });
      partialRef.current.pending = text;
      translateInProgress();
    },
    [getMyId, myName, show, send, spokenLanguage, translateInProgress],
  );

  // A finished phrase of yours: share it, then get and share translations
  const publishFinal = useCallback(
    async (text: string) => {
      // Same id as while it was being spoken, so listeners can match them
      const id = phraseIdRef.current ?? nanoid(12);
      phraseIdRef.current = null;
      const state = partialRef.current;
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      state.pending = null;
      state.lastText = "";

      show({ id, speakerId: getMyId(), speaker: myName, text, final: true });
      addEntry({
        id,
        speaker: myName,
        original: text,
        translated: text,
        timestamp: new Date(),
      });
      send({ type: "final", id, name: myName, text, lang: spokenLanguage });

      // Saved in the transcript even when nobody needs a translation
      const translations = await requestTranslations(id, text, false);
      if (translations) send({ type: "translation", id, translations });
    },
    [
      getMyId,
      myName,
      show,
      addEntry,
      send,
      spokenLanguage,
      requestTranslations,
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
            const id = clean(message.id, 32);
            const lang = clean(message.lang, 8);
            const foreign = Boolean(lang) && lang !== preferredLanguage;
            const current = liveRef.current;
            // Keep showing the quick translation until a newer one arrives
            if (foreign && id && current?.id === id && current.interim) return;
            show({
              id: id || undefined,
              speakerId: from,
              speaker: clean(message.name, 60),
              text,
              final: false,
              // Words in another language would only confuse: show that
              // they are speaking until the translation comes
              translating: foreign,
            });
            break;
          }
          case "partial-translation": {
            const id = clean(message.id, 32);
            const seq = Number(message.seq) || 0;
            const text = clean(
              message.translations?.[preferredLanguage],
              MAX_TEXT,
            );
            const current = liveRef.current;
            if (!id || !text || current?.id !== id) return;
            // Too late: the final translation is already on screen
            if (current.final && !current.translating && !current.interim) {
              return;
            }
            if (seq <= (current.seq ?? 0)) return;
            show({ ...current, text, translating: false, interim: true, seq });
            break;
          }
          case "final": {
            const text = clean(message.text, MAX_TEXT);
            const id = clean(message.id, 32);
            if (!text || !id) return;
            const name = clean(message.name, 60);
            // Already in your language: nothing to wait for
            const needsTranslation =
              clean(message.lang, 8) !== preferredLanguage;
            const current = liveRef.current;
            if (needsTranslation && current?.id === id && current.interim) {
              // Keep the quick translation until the final one arrives
              show({ ...current, final: true });
            } else {
              show({
                id,
                speakerId: from,
                speaker: name,
                text,
                final: true,
                translating: needsTranslation,
              });
            }
            addEntry({
              id,
              speaker: name,
              original: text,
              translated: text,
              timestamp: new Date(),
            });
            if (needsTranslation) {
              // Translation lost or too slow: the original beats nothing
              if (fallbackTimerRef.current) {
                clearTimeout(fallbackTimerRef.current);
              }
              fallbackTimerRef.current = setTimeout(() => {
                const current = liveRef.current;
                if (current?.id === id && current.translating) {
                  show({ ...current, translating: false });
                }
              }, TRANSLATION_TIMEOUT_MS);
            }
            break;
          }
          case "translation": {
            const id = clean(message.id, 32);
            if (
              id &&
              message.translations &&
              typeof message.translations === "object"
            ) {
              applyTranslation(id, message.translations);
            }
            break;
          }
        }
      },
      [preferredLanguage, send, show, addEntry, applyTranslation],
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
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  return { live, entries, publishPartial, publishFinal };
}
