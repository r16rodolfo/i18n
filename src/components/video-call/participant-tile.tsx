"use client";

import { useEffect, useRef } from "react";

import {
  useAudioTrack,
  useParticipantProperty,
  useVideoTrack,
} from "@daily-co/daily-react";
import { MicOff } from "lucide-react";

import type { LanguageCode } from "@/lib/languages";

import { LanguageFlag } from "@/components/flag";

interface ParticipantTileProps {
  sessionId: string;
  username?: string;
  isLocal?: boolean;
  preferredLanguage?: LanguageCode;
  /**
   * Volume of this participant's original voice, 0 to 1. Lowered (not cut)
   * while a translated voice plays, like a live interpreter.
   */
  originalVolume?: number;
  // Accessible label of the "microphone off" icon
  micOffLabel?: string;
}

export function ParticipantTile({
  sessionId,
  username,
  isLocal,
  preferredLanguage,
  originalVolume = 1,
  micOffLabel = "Microphone off",
}: ParticipantTileProps) {
  // Remote people: their name in the call (was showing a code)
  const callName = useParticipantProperty(sessionId, "user_name");
  const name = username || callName || sessionId.slice(0, 6);
  const videoTrack = useVideoTrack(sessionId);
  const audioTrack = useAudioTrack(sessionId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const track = videoTrack?.persistentTrack;
    if (!video || !track) return;
    video.srcObject = new MediaStream([track]);
  }, [videoTrack?.persistentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    const track = audioTrack?.persistentTrack;
    if (!audio || !track) return;
    audio.srcObject = new MediaStream([track]);
  }, [audioTrack?.persistentTrack]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = originalVolume;
  }, [originalVolume]);

  return (
    <div className="relative bg-neutral-800 rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-cover"
      />

      {/* Always mounted for remote participants: Chrome only feeds a remote
          WebRTC track into Web Audio (the translator's input) while a media
          element is playing it. Loudness is controlled with originalVolume. */}
      {!isLocal && (
        // biome-ignore lint/a11y/useMediaCaption: live call audio, captions are shown separately
        <audio ref={audioRef} autoPlay playsInline />
      )}

      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg text-white text-sm">
        {name}
        {isLocal && " (You)"}
        {preferredLanguage && (
          <LanguageFlag code={preferredLanguage} className="ml-1.5 h-3" />
        )}
        {audioTrack?.isOff && (
          <MicOff
            className="ml-1.5 inline h-3.5 w-3.5 text-red-400"
            aria-label={micOffLabel}
          />
        )}
      </div>

      {videoTrack?.isOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          <div className="w-20 h-20 rounded-full bg-neutral-700 flex items-center justify-center text-white text-3xl font-light">
            {(name || "U")[0].toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
