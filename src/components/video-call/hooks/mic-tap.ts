"use client";

// Reads your microphone as raw samples, for the live transcription services
// (ElevenLabs, Soniox). Separate from the call's own mic track, so muting in
// the call and sending to a service can be controlled independently.

// Collects raw mic samples and hands them to the page
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

// Sample rates the services accept; other devices are resampled to 48 kHz
const SUPPORTED_RATES = [8000, 16000, 22050, 24000, 44100, 48000];

export interface MicTap {
  sampleRate: number;
  close: () => void;
}

export async function openMicTap(
  onSamples: (samples: Float32Array) => void,
): Promise<MicTap> {
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
  node.port.onmessage = (event: MessageEvent<Float32Array>) =>
    onSamples(event.data);
  context.createMediaStreamSource(stream).connect(node);

  return {
    sampleRate: context.sampleRate,
    close: () => {
      node.port.onmessage = null;
      for (const track of stream.getTracks()) track.stop();
      context.close().catch(() => {});
    },
  };
}

// Float samples (-1..1) to 16-bit little-endian PCM
export function toPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

// Microphone level (RMS) above which we count it as someone speaking
export const VOICE_LEVEL = 0.02;

export function isVoice(samples: Float32Array): boolean {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length) > VOICE_LEVEL;
}
