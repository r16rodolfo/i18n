"use client";

import { useEffect, useRef } from "react";

import { useAudioTrack, useVideoTrack } from "@daily-co/daily-react";

import { getLanguageFlag, type LanguageCode } from "@/lib/languages";

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
}

export function ParticipantTile({
  sessionId,
  username,
  isLocal,
  preferredLanguage,
  originalVolume = 1,
}: ParticipantTileProps) {
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
        {username || sessionId.slice(0, 6)}
        {isLocal && " (You)"}
        {preferredLanguage && ` ${getLanguageFlag(preferredLanguage)}`}
      </div>

      {videoTrack?.isOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          <div className="w-20 h-20 rounded-full bg-neutral-700 flex items-center justify-center text-white text-3xl font-light">
            {(username || "U")[0].toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
