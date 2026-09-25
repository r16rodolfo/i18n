"use client";

import { useEffect, useRef, useState } from "react";

import { useMediaTrack } from "@daily-co/daily-react";

// OpenAI voice: for one person who speaks another language, their call
// audio goes to an OpenAI translation session (WebRTC) and comes back as
// speech in your language, in a voice that follows theirs. One session per
// such person, open while you have the translated voice on. Renders only a
// hidden audio element.

// After the last translated words, how long the voice counts as playing
const SPEAKING_HOLD_MS = 1500;
const RETRY_MS = 5000;

interface OpenAIVoiceLinkProps {
  sessionId: string;
  roomId: string;
  inviteToken: string | null;
  // The language you hear the others in
  language: string;
  onSpeaking: (sessionId: string, speaking: boolean) => void;
  onConnected: (sessionId: string, connected: boolean) => void;
}

export function OpenAIVoiceLink({
  sessionId,
  roomId,
  inviteToken,
  language,
  onSpeaking,
  onConnected,
}: OpenAIVoiceLinkProps) {
  const { persistentTrack } = useMediaTrack(sessionId, "audio");
  const audioRef = useRef<HTMLAudioElement>(null);
  const senderRef = useRef<RTCRtpSender | null>(null);
  const trackRef = useRef<MediaStreamTrack | undefined>(persistentTrack);
  // Bumped to open a new session after a failure
  const [attempt, setAttempt] = useState(0);
  const hasTrack = Boolean(persistentTrack);

  const callbacks = useRef({ onSpeaking, onConnected });
  useEffect(() => {
    callbacks.current = { onSpeaking, onConnected };
  }, [onSpeaking, onConnected]);

  // The same person may get a new audio track (e.g. after a reconnect)
  useEffect(() => {
    trackRef.current = persistentTrack;
    if (persistentTrack && senderRef.current) {
      senderRef.current.replaceTrack(persistentTrack).catch(() => {});
    }
  }, [persistentTrack]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` reopens the session after a failure
  useEffect(() => {
    const track = trackRef.current;
    if (!hasTrack || !track) return;

    let stopped = false;
    let speakingTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const pc = new RTCPeerConnection();

    const setSpeaking = (speaking: boolean) =>
      callbacks.current.onSpeaking(sessionId, speaking);
    const retry = () => {
      if (stopped || retryTimer) return;
      callbacks.current.onConnected(sessionId, false);
      retryTimer = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    };

    const start = async () => {
      senderRef.current = pc.addTrack(track, new MediaStream([track]));
      pc.ontrack = ({ streams }) => {
        if (audioRef.current) audioRef.current.srcObject = streams[0];
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          callbacks.current.onConnected(sessionId, true);
        }
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          retry();
        }
      };
      const events = pc.createDataChannel("oai-events");
      events.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(String(data));
          if (event.type === "session.output_transcript.delta") {
            setSpeaking(true);
            if (speakingTimer) clearTimeout(speakingTimer);
            speakingTimer = setTimeout(
              () => setSpeaking(false),
              SPEAKING_HOLD_MS,
            );
          }
          if (event.type === "error") {
            console.error("[Voice] OpenAI:", event.error ?? event);
          }
        } catch {
          // Not JSON: ignore
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const secretRes = await fetch(
        `/api/rooms/${encodeURIComponent(roomId)}/voice-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invite: inviteToken, language }),
        },
      );
      if (!secretRes.ok) throw new Error(`secret ${secretRes.status}`);
      const { clientSecret } = (await secretRes.json()) as {
        clientSecret: string;
      };
      if (stopped) return;

      const sdpRes = await fetch(
        "https://api.openai.com/v1/realtime/translations/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        },
      );
      if (!sdpRes.ok) throw new Error(`sdp ${sdpRes.status}`);
      const answer = await sdpRes.text();
      if (stopped) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    };

    start().catch((error) => {
      if (stopped) return;
      console.error("[Voice] OpenAI session failed:", error);
      retry();
    });

    return () => {
      stopped = true;
      if (speakingTimer) clearTimeout(speakingTimer);
      if (retryTimer) clearTimeout(retryTimer);
      senderRef.current = null;
      pc.close();
      callbacks.current.onSpeaking(sessionId, false);
      callbacks.current.onConnected(sessionId, false);
    };
  }, [sessionId, roomId, inviteToken, language, hasTrack, attempt]);

  // biome-ignore lint/a11y/useMediaCaption: translated speech, the captions are on screen
  return <audio ref={audioRef} autoPlay className="hidden" />;
}
