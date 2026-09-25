import type { VoiceGender } from "@/lib/voice-options";

// Reads a translated caption aloud, on the server (the keys never reach the
// browser). Both engines stream raw audio as it is generated: 16-bit PCM,
// mono, 24 kHz, so the listener starts hearing it before the end.

export const TTS_SAMPLE_RATE = 24_000;

export interface SpeechRequest {
  text: string;
  language: string;
  gender: VoiceGender;
  // 1 = normal; a little faster when the listener is falling behind
  speed: number;
}

export interface SpeechStream {
  audio: ReadableStream<Uint8Array>;
  // Resolves when generation ends, with how many audio bytes came out
  done: Promise<{ audioBytes: number }>;
}

const SONIOX_VOICES: Record<VoiceGender, string> = {
  female: process.env.SONIOX_VOICE_FEMALE || "Maya",
  male: process.env.SONIOX_VOICE_MALE || "Adrian",
};

// Premade multilingual ElevenLabs voices (can be swapped for voices from
// the account's library through the environment)
const ELEVENLABS_VOICES: Record<VoiceGender, string> = {
  female: process.env.ELEVENLABS_VOICE_FEMALE || "EXAVITQu4vr4xnSDxMaL",
  male: process.env.ELEVENLABS_VOICE_MALE || "TX3LPaxmHKxFdv7VOQHJ",
};

export function sonioxSpeech(request: SpeechRequest): SpeechStream {
  let finish: (result: { audioBytes: number }) => void = () => {};
  const done = new Promise<{ audioBytes: number }>((resolve) => {
    finish = resolve;
  });
  let audioBytes = 0;
  let socket: WebSocket | null = null;

  const audio = new ReadableStream<Uint8Array>({
    start(controller) {
      const streamId = "s1";
      let closed = false;
      const end = (error?: unknown) => {
        if (closed) return;
        closed = true;
        if (error) controller.error(error);
        else controller.close();
        socket?.close();
        finish({ audioBytes });
      };

      socket = new WebSocket("wss://tts-rt.soniox.com/tts-websocket");
      const timeout = setTimeout(
        () => end(new Error("Soniox TTS timed out")),
        30_000,
      );
      socket.onopen = () => {
        socket?.send(
          JSON.stringify({
            api_key: process.env.SONIOX_API_KEY,
            model: "tts-rt-v2",
            language: request.language,
            voice: SONIOX_VOICES[request.gender],
            audio_format: "pcm_s16le",
            sample_rate: TTS_SAMPLE_RATE,
            speed: request.speed,
            stream_id: streamId,
          }),
        );
        socket?.send(
          JSON.stringify({
            text: request.text,
            text_end: true,
            stream_id: streamId,
          }),
        );
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data));
        if (message.error_code || message.error_message) {
          clearTimeout(timeout);
          end(new Error(`Soniox TTS: ${message.error_message}`));
          return;
        }
        if (message.audio) {
          const chunk = Buffer.from(message.audio, "base64");
          audioBytes += chunk.length;
          controller.enqueue(new Uint8Array(chunk));
        }
        if (message.terminated || message.audio_end) {
          clearTimeout(timeout);
          end();
        }
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        end(new Error("Soniox TTS connection failed"));
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        end();
      };
    },
    cancel() {
      socket?.close();
      finish({ audioBytes });
    },
  });

  return { audio, done };
}

export async function elevenLabsSpeech(
  request: SpeechRequest,
): Promise<SpeechStream | null> {
  const voice = ELEVENLABS_VOICES[request.gender];
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=pcm_${TTS_SAMPLE_RATE}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: request.text,
        model_id: "eleven_flash_v2_5",
        language_code: request.language,
        voice_settings: {
          speed: Math.min(1.2, request.speed),
        },
      }),
    },
  );
  if (!res.ok || !res.body) {
    console.error(
      "[tts] ElevenLabs failed:",
      res.status,
      await res.text().catch(() => ""),
    );
    return null;
  }

  let finish: (result: { audioBytes: number }) => void = () => {};
  const done = new Promise<{ audioBytes: number }>((resolve) => {
    finish = resolve;
  });
  let audioBytes = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      audioBytes += chunk.length;
      controller.enqueue(chunk);
    },
    flush() {
      finish({ audioBytes });
    },
  });
  return { audio: res.body.pipeThrough(counter), done };
}
