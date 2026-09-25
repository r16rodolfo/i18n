"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { VoicePiece } from "./use-captions";

// Soniox/ElevenLabs voice: reads aloud the pieces translated into your
// language, one after the other, in the voice each speaker picked. Each
// piece is asked from the server as soon as it arrives (so the next one is
// ready while the current one plays) and played as its audio streams in.
// When pieces pile up, the next ones are read a little faster; very old
// ones are skipped (the captions still show them).

const MAX_WAITING = 4;

interface UseTtsVoiceOptions {
  enabled: boolean;
  roomId: string;
  inviteToken: string | null;
  visitorId: string;
  // The language you hear the others in
  language: string;
}

interface QueuedPiece {
  piece: VoicePiece;
  response: Promise<Response | null>;
}

export function useTtsVoice({
  enabled,
  roomId,
  inviteToken,
  visitorId,
  language,
}: UseTtsVoiceOptions) {
  const [speakingFor, setSpeakingFor] = useState<string | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<QueuedPiece[]>([]);
  const playingRef = useRef(false);
  // When the audio scheduled so far ends (AudioContext time)
  const endsAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const getContext = useCallback(() => {
    if (!contextRef.current) contextRef.current = new AudioContext();
    if (contextRef.current.state === "suspended") {
      contextRef.current.resume().catch(() => {});
    }
    return contextRef.current;
  }, []);

  // Plays one streamed answer: 16-bit PCM, mono, rate from X-Sample-Rate
  const playStream = useCallback(
    async (res: Response) => {
      const context = getContext();
      const rate = Number(res.headers.get("X-Sample-Rate")) || 24_000;
      const reader = res.body?.getReader();
      if (!reader) return;
      let leftover: Uint8Array | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        // Turned off meanwhile
        if (contextRef.current !== context) {
          reader.cancel().catch(() => {});
          return;
        }
        let bytes = value;
        if (leftover) {
          bytes = new Uint8Array(leftover.length + value.length);
          bytes.set(leftover);
          bytes.set(value, leftover.length);
          leftover = null;
        }
        const usable = bytes.length - (bytes.length % 2);
        if (usable < bytes.length) leftover = bytes.slice(usable);
        if (usable === 0) continue;
        const samples = new Int16Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + usable),
        );
        const buffer = context.createBuffer(1, samples.length, rate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
          channel[i] = samples[i] / 32768;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const startAt = Math.max(context.currentTime + 0.02, endsAtRef.current);
        source.start(startAt);
        endsAtRef.current = startAt + buffer.duration;
      }
    },
    [getContext],
  );

  const waitUntilPlayed = useCallback(async () => {
    const context = contextRef.current;
    if (!context) return;
    const remaining = endsAtRef.current - context.currentTime;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining * 1000));
    }
  }, []);

  const playQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    try {
      for (;;) {
        const next = queueRef.current.shift();
        if (!next) break;
        setSpeakingFor(next.piece.speakerId);
        const res = await next.response;
        if (res?.ok) {
          try {
            await playStream(res);
          } catch (error) {
            console.error("[Voice] playback failed:", error);
          }
        }
        // Whoever speaks next may be someone else
        if (queueRef.current[0]?.piece.speakerId !== next.piece.speakerId) {
          await waitUntilPlayed();
        }
      }
      await waitUntilPlayed();
    } finally {
      playingRef.current = false;
      if (queueRef.current.length > 0) {
        playQueue();
      } else {
        setSpeakingFor(null);
      }
    }
  }, [playStream, waitUntilPlayed]);

  const speak = useCallback(
    (piece: VoicePiece) => {
      if (!enabled) return;
      // Too far behind: drop the oldest waiting pieces
      while (queueRef.current.length >= MAX_WAITING) {
        queueRef.current.shift();
      }
      const waiting = queueRef.current.length;
      const speed = waiting >= 2 ? 1.25 : waiting === 1 ? 1.12 : 1;
      if (!abortRef.current) abortRef.current = new AbortController();
      const response = fetch(`/api/rooms/${encodeURIComponent(roomId)}/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          invite: inviteToken,
          visitorId,
          text: piece.text,
          language,
          gender: piece.gender,
          speed,
        }),
      }).catch((error) => {
        if ((error as Error).name !== "AbortError") {
          console.error("[Voice] request failed:", error);
        }
        return null;
      });
      queueRef.current.push({ piece, response });
      playQueue();
    },
    [enabled, roomId, inviteToken, visitorId, language, playQueue],
  );

  // Turned off (or leaving): stop at once
  useEffect(() => {
    if (enabled) return;
    queueRef.current = [];
    abortRef.current?.abort();
    abortRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    endsAtRef.current = 0;
    context?.close().catch(() => {});
    setSpeakingFor(null);
  }, [enabled]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      contextRef.current?.close().catch(() => {});
    };
  }, []);

  return { speak, speakingFor };
}
