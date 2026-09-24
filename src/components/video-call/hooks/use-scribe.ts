"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LanguageCode } from "@/lib/languages";

// Transcribes YOUR microphone with ElevenLabs Scribe Realtime.
//
// The browser connects straight to ElevenLabs with a single-use token from
// /api/elevenlabs/token (the API key stays on the server). Audio is only
// sent between start() and stop(), so nobody pays for a muted mic.
//
// Scribe ends a phrase by itself after a short silence, and stop() pushes
// the last phrase out right away ("Terminei"). Cutting long phrases into
// pieces for the captions is done on the text (use-captions), so no word
// is ever cut in half.

const SCRIBE_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
// Formats Scribe accepts; the mic is sent at the AudioContext's own rate
const SUPPORTED_RATES = [8000, 16000, 22050, 24000, 44100, 48000];
const CHUNK_MS = 100;
// Microphone level (RMS) above which we count it as someone speaking
const VOICE_LEVEL = 0.02;
// Tokens are valid for 15 min; keep a fresh one ready to connect instantly
const TOKEN_MAX_AGE_MS = 12 * 60 * 1000;
// After stop(): how long to wait for the last phrase before closing
const FINAL_PHRASE_TIMEOUT_MS = 3000;

// Collects raw mic samples and hands them to the page in small batches
const WORKLET_SOURCE = `
class MicTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("mic-tap", MicTap);
`;

export type ScribeStatus = "idle" | "connecting" | "listening" | "error";

interface UseScribeOptions {
  enabled: boolean;
  roomId: string;
  inviteToken: string | null;
  language: LanguageCode;
  onPartial: (text: string) => void;
  onCommitted: (text: string) => void;
}

function toBase64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function useScribe({
  enabled,
  roomId,
  inviteToken,
  language,
  onPartial,
  onCommitted,
}: UseScribeOptions) {
  const [status, setStatus] = useState<ScribeStatus>("idle");

  // Latest callbacks without reconnecting when they change
  const onPartialRef = useRef(onPartial);
  const onCommittedRef = useRef(onCommitted);
  onPartialRef.current = onPartial;
  onCommittedRef.current = onCommitted;

  const micRef = useRef<{
    stream: MediaStream;
    context: AudioContext;
    node: AudioWorkletNode;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<{ token: string; at: number } | null>(null);

  // Whether mic audio should currently go to ElevenLabs
  const sendingRef = useRef(false);
  // Audio captured while the connection is still opening
  const pendingRef = useRef<string[]>([]);
  const batchRef = useRef<Float32Array[]>([]);
  const batchLengthRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/elevenlabs/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomId, invite: inviteToken }),
      });
      if (!res.ok) {
        console.error("[Scribe] token request failed:", res.status);
        return null;
      }
      const { token } = (await res.json()) as { token?: string };
      return token ?? null;
    } catch (error) {
      console.error("[Scribe] token request failed:", error);
      return null;
    }
  }, [roomId, inviteToken]);

  // Keep one unused token ready (they are consumed on connect)
  const prefetchToken = useCallback(async () => {
    const token = await fetchToken();
    if (token) tokenRef.current = { token, at: Date.now() };
  }, [fetchToken]);

  const takeToken = useCallback(async (): Promise<string | null> => {
    const cached = tokenRef.current;
    tokenRef.current = null;
    if (cached && Date.now() - cached.at < TOKEN_MAX_AGE_MS) {
      return cached.token;
    }
    return fetchToken();
  }, [fetchToken]);

  const sendAudio = useCallback((audioBase64: string, commit: boolean) => {
    const ws = wsRef.current;
    const context = micRef.current?.context;
    if (!ws || ws.readyState !== WebSocket.OPEN || !context) {
      if (audioBase64) pendingRef.current.push(audioBase64);
      return;
    }
    ws.send(
      JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: audioBase64,
        commit,
        sample_rate: context.sampleRate,
      }),
    );
  }, []);

  // Turns the collected samples into one audio message
  const flushBatch = useCallback(
    (commit: boolean) => {
      const parts = batchRef.current;
      const merged = new Float32Array(batchLengthRef.current);
      let offset = 0;
      for (const part of parts) {
        merged.set(part, offset);
        offset += part.length;
      }
      batchRef.current = [];
      batchLengthRef.current = 0;
      if (merged.length === 0 && !commit) return;
      sendAudio(merged.length ? toBase64(merged) : "", commit);
    },
    [sendAudio],
  );

  const openMic = useCallback(async () => {
    if (micRef.current) return micRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    let context = new AudioContext();
    if (!SUPPORTED_RATES.includes(context.sampleRate)) {
      await context.close();
      context = new AudioContext({ sampleRate: 48000 });
    }
    if (context.state === "suspended") {
      await context.resume().catch(() => {});
    }

    const moduleUrl = URL.createObjectURL(
      new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
    );
    await context.audioWorklet.addModule(moduleUrl);
    URL.revokeObjectURL(moduleUrl);

    const node = new AudioWorkletNode(context, "mic-tap");
    const samplesPerChunk = Math.round((context.sampleRate * CHUNK_MS) / 1000);

    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!sendingRef.current) return;
      const samples = event.data;

      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      if (Math.sqrt(sum / samples.length) > VOICE_LEVEL) {
        lastVoiceAtRef.current = Date.now();
      }

      batchRef.current.push(samples);
      batchLengthRef.current += samples.length;
      if (batchLengthRef.current >= samplesPerChunk) flushBatch(false);
    };

    context.createMediaStreamSource(stream).connect(node);
    micRef.current = { stream, context, node };
    return micRef.current;
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
    const token = await takeToken();
    // Refill the cache in the background for the next connection
    prefetchToken();
    if (!token) {
      setStatus("error");
      return;
    }
    const context = micRef.current?.context;
    if (!context) return;

    const params = new URLSearchParams({
      model_id: "scribe_v2_realtime",
      token,
      language_code: language,
      audio_format: `pcm_${context.sampleRate}`,
      commit_strategy: "vad",
      vad_silence_threshold_secs: "0.6",
    });
    const ws = new WebSocket(`${SCRIBE_URL}?${params}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setStatus("listening");
      for (const audio of pendingRef.current) sendAudio(audio, false);
      pendingRef.current = [];
      // stop() may have been called while the connection was opening
      if (!sendingRef.current) sendAudio("", true);
    };

    ws.onmessage = (event) => {
      let message: { message_type?: string; text?: string; error?: string };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const text = message.text?.trim() ?? "";

      switch (message.message_type) {
        case "session_started":
          break;
        case "partial_transcript":
          if (text) onPartialRef.current(text);
          break;
        case "committed_transcript":
          if (text) onCommittedRef.current(text);
          // The last phrase after stop() has arrived: nothing else to wait for
          if (!sendingRef.current && wsRef.current === ws) closeSocket();
          break;
        default:
          if (message.message_type?.includes("error")) {
            console.error("[Scribe]", message.message_type, message.error);
            setStatus("error");
          }
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      // Closed by ElevenLabs while still talking (e.g. session limit):
      // open a new connection and keep going
      if (sendingRef.current && event.code !== 1000) {
        console.warn("[Scribe] connection closed, reconnecting", event.code);
        connect();
        return;
      }
      setStatus((current) => (current === "error" ? current : "idle"));
    };
  }, [language, takeToken, prefetchToken, sendAudio, closeSocket]);

  // Start sending your mic to ElevenLabs
  const start = useCallback(async () => {
    if (!enabled || sendingRef.current) return;
    sendingRef.current = true;
    lastVoiceAtRef.current = Date.now();
    pendingRef.current = [];

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    try {
      await openMic();
    } catch (error) {
      console.error("[Scribe] microphone unavailable:", error);
      sendingRef.current = false;
      setStatus("error");
      return;
    }
    if (!sendingRef.current) return;

    // Reuse a connection that is still waiting for its last phrase
    if (wsRef.current) return;
    setStatus("connecting");
    await connect();
  }, [enabled, openMic, connect]);

  // Stop sending and push out the phrase in progress right away
  const stop = useCallback(() => {
    if (!sendingRef.current) return;
    sendingRef.current = false;
    flushBatch(true);

    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(closeSocket, FINAL_PHRASE_TIMEOUT_MS);
  }, [flushBatch, closeSocket]);

  // Milliseconds since your mic last picked up speech (while sending)
  const getSilenceMs = useCallback(
    () => Date.now() - lastVoiceAtRef.current,
    [],
  );

  // Have a token ready before the first "Falar"
  useEffect(() => {
    if (!enabled) return;
    prefetchToken();
    const timer = setInterval(prefetchToken, TOKEN_MAX_AGE_MS);
    return () => clearInterval(timer);
  }, [enabled, prefetchToken]);

  // Release the mic and the connection when leaving the call
  useEffect(() => {
    return () => {
      sendingRef.current = false;
      closeSocket();
      const mic = micRef.current;
      micRef.current = null;
      if (mic) {
        mic.node.port.onmessage = null;
        for (const track of mic.stream.getTracks()) track.stop();
        mic.context.close().catch(() => {});
      }
    };
  }, [closeSocket]);

  return { status, start, stop, getSilenceMs };
}
