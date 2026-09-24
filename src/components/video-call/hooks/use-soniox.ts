"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LanguageCode } from "@/lib/languages";

import { isVoice, type MicTap, openMicTap, toPcm16 } from "./mic-tap";

// Transcribes AND translates YOUR microphone with Soniox, in one connection.
//
// The browser connects straight to Soniox with a temporary key from
// /api/soniox/token (the real key stays on the server). Audio is only sent
// between start() and stop(), so nobody pays for a muted mic. Soniox sends
// the translation in short finished pieces while you keep talking; each one
// is handed to onPiece together with the original words it came from.

const SONIOX_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
const MODEL = "stt-rt-v5";
const CHUNK_MS = 100;
// Temporary keys last 5 minutes; keep a fresh one ready to connect instantly
const KEY_MAX_AGE_MS = 4 * 60 * 1000;
// A piece is complete once no more of its translation arrives for this long
const PIECE_SETTLE_MS = 150;
// Without translation (everyone speaks your language): wait a bit longer
const PIECE_SETTLE_NO_TRANSLATION_MS = 700;
// After stop(): how long to wait for the last piece before closing
const FINAL_PIECE_TIMEOUT_MS = 4000;

export type SonioxStatus = "idle" | "connecting" | "listening" | "error";

interface SonioxToken {
  text: string;
  is_final: boolean;
  translation_status?: "original" | "translation" | "none";
}

interface UseSonioxOptions {
  enabled: boolean;
  roomId: string;
  inviteToken: string | null;
  language: LanguageCode;
  // The language the others read, when it differs from yours
  getTargetLanguage: () => LanguageCode | null;
  // What you are saying right now (not finished yet)
  onPartial: (text: string) => void;
  // A finished piece: your words and their translation (if any)
  onPiece: (original: string, translations: Record<string, string>) => void;
}

// Markers Soniox puts in the text (end of an utterance, finalization)
const isMarker = (text: string) => text === "<end>" || text === "<fin>";

export function useSoniox({
  enabled,
  roomId,
  inviteToken,
  language,
  getTargetLanguage,
  onPartial,
  onPiece,
}: UseSonioxOptions) {
  const [status, setStatus] = useState<SonioxStatus>("idle");

  // Latest callbacks without reconnecting when they change
  const onPartialRef = useRef(onPartial);
  const onPieceRef = useRef(onPiece);
  const getTargetRef = useRef(getTargetLanguage);
  onPartialRef.current = onPartial;
  onPieceRef.current = onPiece;
  getTargetRef.current = getTargetLanguage;

  const micRef = useRef<MicTap | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const keyRef = useRef<{ key: string; at: number } | null>(null);

  // Whether mic audio should currently go to Soniox
  const sendingRef = useRef(false);
  // Audio captured while the connection is still opening
  const pendingRef = useRef<ArrayBuffer[]>([]);
  const batchRef = useRef<Float32Array[]>([]);
  const batchLengthRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The piece being assembled from Soniox's finished words
  const pieceRef = useRef({
    original: "",
    translation: "",
    target: null as LanguageCode | null,
    timer: null as ReturnType<typeof setTimeout> | null,
  });

  const fetchKey = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/soniox/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomId, invite: inviteToken }),
      });
      if (!res.ok) {
        console.error("[Soniox] key request failed:", res.status);
        return null;
      }
      const { apiKey } = (await res.json()) as { apiKey?: string };
      return apiKey ?? null;
    } catch (error) {
      console.error("[Soniox] key request failed:", error);
      return null;
    }
  }, [roomId, inviteToken]);

  // Keep one unused key ready (each one works for a single connection)
  const prefetchKey = useCallback(async () => {
    const key = await fetchKey();
    if (key) keyRef.current = { key, at: Date.now() };
  }, [fetchKey]);

  const takeKey = useCallback(async (): Promise<string | null> => {
    const cached = keyRef.current;
    keyRef.current = null;
    if (cached && Date.now() - cached.at < KEY_MAX_AGE_MS) return cached.key;
    return fetchKey();
  }, [fetchKey]);

  // Hands the finished piece to the page
  const emitPiece = useCallback(() => {
    const piece = pieceRef.current;
    if (piece.timer) clearTimeout(piece.timer);
    piece.timer = null;
    const original = piece.original.trim();
    const translation = piece.translation.trim();
    piece.original = "";
    piece.translation = "";
    if (!original && !translation) return;
    onPieceRef.current(
      original || translation,
      piece.target && translation ? { [piece.target]: translation } : {},
    );
  }, []);

  const scheduleEmit = useCallback(
    (delay: number) => {
      const piece = pieceRef.current;
      if (piece.timer) clearTimeout(piece.timer);
      piece.timer = setTimeout(emitPiece, delay);
    },
    [emitPiece],
  );

  const sendAudio = useCallback((pcm: ArrayBuffer) => {
    const ws = wsRef.current;
    // Until the connection is open (the settings go first, in onopen)
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pendingRef.current.push(pcm);
      return;
    }
    ws.send(pcm);
  }, []);

  // Turns the collected samples into one audio message
  const flushBatch = useCallback(() => {
    const merged = new Float32Array(batchLengthRef.current);
    let offset = 0;
    for (const part of batchRef.current) {
      merged.set(part, offset);
      offset += part.length;
    }
    batchRef.current = [];
    batchLengthRef.current = 0;
    if (merged.length) sendAudio(toPcm16(merged).buffer as ArrayBuffer);
  }, [sendAudio]);

  const openMic = useCallback(async () => {
    if (micRef.current) return micRef.current;

    let samplesPerChunk = 0;
    const mic = await openMicTap((samples) => {
      if (!sendingRef.current) return;
      if (isVoice(samples)) lastVoiceAtRef.current = Date.now();

      batchRef.current.push(samples);
      batchLengthRef.current += samples.length;
      if (batchLengthRef.current >= samplesPerChunk) flushBatch();
    });
    samplesPerChunk = Math.round((mic.sampleRate * CHUNK_MS) / 1000);
    micRef.current = mic;
    return mic;
  }, [flushBatch]);

  const closeSocket = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
  }, []);

  const connect = useCallback(async () => {
    const key = await takeKey();
    // Refill the cache in the background for the next connection
    prefetchKey();
    if (!key) {
      setStatus("error");
      return;
    }
    const mic = micRef.current;
    if (!mic) return;

    // Translate into the others' language, decided when you start talking
    const target = getTargetRef.current();
    pieceRef.current.target = target && target !== language ? target : null;

    const ws = new WebSocket(SONIOX_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      ws.send(
        JSON.stringify({
          api_key: key,
          model: MODEL,
          audio_format: "pcm_s16le",
          sample_rate: mic.sampleRate,
          num_channels: 1,
          language_hints: [language],
          enable_endpoint_detection: true,
          ...(pieceRef.current.target
            ? {
                translation: {
                  type: "one_way",
                  target_language: pieceRef.current.target,
                },
              }
            : {}),
        }),
      );
      setStatus("listening");
      for (const pcm of pendingRef.current) ws.send(pcm);
      pendingRef.current = [];
      // stop() may have been called while the connection was opening
      if (!sendingRef.current) ws.send("");
    };

    ws.onmessage = (event) => {
      let message: {
        tokens?: SonioxToken[];
        error_code?: number;
        error_message?: string;
        finished?: boolean;
      };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.error_code) {
        console.error(
          "[Soniox]",
          message.error_code,
          message.error_message ?? "",
        );
        setStatus("error");
        return;
      }

      const piece = pieceRef.current;
      let liveOriginal = "";
      let newTranslation = false;
      let utteranceEnded = false;
      for (const token of message.tokens ?? []) {
        if (isMarker(token.text)) {
          utteranceEnded = true;
          continue;
        }
        if (token.translation_status === "translation") {
          if (token.is_final) {
            piece.translation += token.text;
            newTranslation = true;
          }
        } else if (token.is_final) {
          piece.original += token.text;
        } else {
          liveOriginal += token.text;
        }
      }

      const speaking = (piece.original + liveOriginal).trim();
      if (speaking) onPartialRef.current(speaking);

      if (piece.target) {
        // The translation of a piece comes in one go: close it shortly after
        if (newTranslation) scheduleEmit(PIECE_SETTLE_MS);
      } else if (utteranceEnded) {
        emitPiece();
      } else if (piece.original.trim()) {
        scheduleEmit(PIECE_SETTLE_NO_TRANSLATION_MS);
      }

      if (message.finished) {
        emitPiece();
        if (wsRef.current === ws) closeSocket();
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      // Closed by Soniox while still talking: open a new connection
      if (sendingRef.current && event.code !== 1000) {
        console.warn("[Soniox] connection closed, reconnecting", event.code);
        connect();
        return;
      }
      emitPiece();
      setStatus((current) => (current === "error" ? current : "idle"));
    };
  }, [language, takeKey, prefetchKey, scheduleEmit, emitPiece, closeSocket]);

  // Start sending your mic to Soniox
  const start = useCallback(async () => {
    if (!enabled || sendingRef.current) return;
    sendingRef.current = true;
    lastVoiceAtRef.current = Date.now();
    pendingRef.current = [];

    try {
      await openMic();
    } catch (error) {
      console.error("[Soniox] microphone unavailable:", error);
      sendingRef.current = false;
      setStatus("error");
      return;
    }
    if (!sendingRef.current) return;

    // The previous turn's connection is still closing: keep what it already
    // finished and start a new one
    if (wsRef.current) {
      emitPiece();
      closeSocket();
    }
    setStatus("connecting");
    await connect();
  }, [enabled, openMic, connect, emitPiece, closeSocket]);

  // Stop sending: Soniox finishes the last words, then the connection closes
  const stop = useCallback(() => {
    if (!sendingRef.current) return;
    sendingRef.current = false;
    flushBatch();

    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send("");
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      emitPiece();
      closeSocket();
    }, FINAL_PIECE_TIMEOUT_MS);
  }, [flushBatch, emitPiece, closeSocket]);

  // Milliseconds since your mic last picked up speech (while sending)
  const getSilenceMs = useCallback(
    () => Date.now() - lastVoiceAtRef.current,
    [],
  );

  // Have a key ready before the first "Falar"
  useEffect(() => {
    if (!enabled) return;
    prefetchKey();
    const timer = setInterval(prefetchKey, KEY_MAX_AGE_MS);
    return () => clearInterval(timer);
  }, [enabled, prefetchKey]);

  // Release the mic and the connection when leaving the call
  useEffect(() => {
    return () => {
      sendingRef.current = false;
      closeSocket();
      micRef.current?.close();
      micRef.current = null;
    };
  }, [closeSocket]);

  return { status, start, stop, getSilenceMs };
}
