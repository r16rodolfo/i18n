"use client";

import type { VoiceGender } from "@/lib/voice-options";

// Soniox voice, straight from the listener's browser: one connection kept
// open for the whole call (a new connection costs ~0.6 s; with it open,
// the first sound of a sentence comes in ~0.3 s instead of ~1 s through
// our server). The browser uses a temporary key limited to voice, from
// /api/soniox/token. Each sentence is its own stream on that connection
// (up to 5 at once), so the next one is generated while one plays.

const TTS_URL = "wss://tts-rt.soniox.com/tts-websocket";
export const SONIOX_TTS_SAMPLE_RATE = 24_000;
const KEEPALIVE_MS = 20_000;
const CONNECT_TIMEOUT_MS = 5000;

interface KeyInfo {
  apiKey: string;
  expiresAt: number;
  voices: Record<VoiceGender, string>;
}

export interface SonioxSpeechRequest {
  text: string;
  language: string;
  gender: VoiceGender;
  speed: number;
}

export class SonioxVoiceClient {
  private key: KeyInfo | null = null;
  private keyRequest: Promise<KeyInfo | null> | null = null;
  private socket: WebSocket | null = null;
  private opening: Promise<WebSocket | null> | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private streams = new Map<
    string,
    ReadableStreamDefaultController<Uint8Array>
  >();
  private nextId = 0;
  private closed = false;
  // Seconds of speech received, not yet reported for the cost estimate
  private audioSeconds = 0;

  constructor(
    private roomId: string,
    private inviteToken: string | null,
  ) {}

  // Gets the key and opens the connection before the first sentence
  warm() {
    this.connect().catch(() => {});
  }

  takeAudioSeconds() {
    const seconds = this.audioSeconds;
    this.audioSeconds = 0;
    return seconds;
  }

  close() {
    this.closed = true;
    if (this.keepalive) clearInterval(this.keepalive);
    this.socket?.close();
    this.socket = null;
    this.endAllStreams();
  }

  // The spoken sentence as a stream of 16-bit PCM audio (24 kHz, mono)
  async speak(request: SonioxSpeechRequest): Promise<Response | null> {
    const [key, socket] = await Promise.all([this.getKey(), this.connect()]);
    if (!key || !socket || socket.readyState !== WebSocket.OPEN) return null;

    const streamId = `s${++this.nextId}`;
    const audio = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.streams.set(streamId, controller);
      },
      cancel: () => {
        this.streams.delete(streamId);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ stream_id: streamId, cancel: true }));
        }
      },
    });
    socket.send(
      JSON.stringify({
        api_key: key.apiKey,
        model: "tts-rt-v2",
        language: request.language,
        voice: key.voices[request.gender],
        audio_format: "pcm_s16le",
        sample_rate: SONIOX_TTS_SAMPLE_RATE,
        speed: request.speed,
        stream_id: streamId,
      }),
    );
    socket.send(
      JSON.stringify({
        text: request.text,
        text_end: true,
        stream_id: streamId,
      }),
    );
    return new Response(audio, {
      headers: { "X-Sample-Rate": String(SONIOX_TTS_SAMPLE_RATE) },
    });
  }

  private async getKey(): Promise<KeyInfo | null> {
    // Renew a minute before it expires
    if (this.key && this.key.expiresAt - Date.now() > 60_000) return this.key;
    if (!this.keyRequest) {
      this.keyRequest = fetch("/api/soniox/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: this.roomId,
          invite: this.inviteToken,
          purpose: "tts",
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            console.error("[Voice] Soniox key request failed:", res.status);
            return null;
          }
          this.key = (await res.json()) as KeyInfo;
          return this.key;
        })
        .catch((error) => {
          console.error("[Voice] Soniox key request failed:", error);
          return null;
        })
        .finally(() => {
          this.keyRequest = null;
        });
    }
    return this.keyRequest;
  }

  private connect(): Promise<WebSocket | null> {
    if (this.closed) return Promise.resolve(null);
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.socket);
    }
    if (this.opening) return this.opening;

    this.opening = new Promise<WebSocket | null>((resolve) => {
      const socket = new WebSocket(TTS_URL);
      const timeout = setTimeout(() => {
        socket.close();
        resolve(null);
      }, CONNECT_TIMEOUT_MS);
      socket.onopen = () => {
        clearTimeout(timeout);
        this.socket = socket;
        if (this.keepalive) clearInterval(this.keepalive);
        // Needed while no sentence is being read
        this.keepalive = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ keep_alive: true }));
          }
        }, KEEPALIVE_MS);
        resolve(socket);
      };
      socket.onmessage = (event) => this.handleMessage(String(event.data));
      socket.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (this.socket === socket) {
          this.socket = null;
          if (this.keepalive) clearInterval(this.keepalive);
          this.keepalive = null;
          this.endAllStreams();
          // Soniox closes connections that stay idle for 3 minutes: open a
          // new one so the next sentence doesn't wait for it
          if (!this.closed) setTimeout(() => this.warm(), 1000);
        }
        resolve(null);
      };
    }).finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private handleMessage(data: string) {
    let message: {
      stream_id?: string;
      audio?: string;
      terminated?: boolean;
      error_message?: string;
    };
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    const controller = message.stream_id
      ? this.streams.get(message.stream_id)
      : undefined;
    if (message.error_message) {
      console.error("[Voice] Soniox:", message.error_message);
    }
    if (!controller || !message.stream_id) return;
    if (message.audio) {
      const binary = atob(message.audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      this.audioSeconds += bytes.length / 2 / SONIOX_TTS_SAMPLE_RATE;
      controller.enqueue(bytes);
    }
    if (message.terminated) {
      this.streams.delete(message.stream_id);
      controller.close();
    }
  }

  private endAllStreams() {
    for (const controller of this.streams.values()) {
      try {
        controller.close();
      } catch {
        // Already closed
      }
    }
    this.streams.clear();
  }
}
