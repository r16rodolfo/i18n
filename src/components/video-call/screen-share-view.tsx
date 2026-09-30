"use client";

import { useEffect, useRef } from "react";

import {
  useMediaTrack,
  useParticipantProperty,
  useScreenVideoTrack,
} from "@daily-co/daily-react";
import { MonitorUp } from "lucide-react";

import type { UiText } from "@/lib/ui-text";

// Someone else's shared screen, big in the middle of the call (with the
// sound of the shared tab, when they shared it)
export function ScreenShareView({
  sessionId,
  t,
}: {
  sessionId: string;
  t: UiText;
}) {
  const screenVideo = useScreenVideoTrack(sessionId);
  const screenAudio = useMediaTrack(sessionId, "screenAudio");
  const name = useParticipantProperty(sessionId, "user_name");
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const track = screenVideo.persistentTrack;
    if (videoRef.current && track) {
      videoRef.current.srcObject = new MediaStream([track]);
    }
  }, [screenVideo.persistentTrack]);

  useEffect(() => {
    const track = screenAudio.persistentTrack;
    if (audioRef.current && track) {
      audioRef.current.srcObject = new MediaStream([track]);
    }
  }, [screenAudio.persistentTrack]);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-contain"
      />
      {/* biome-ignore lint/a11y/useMediaCaption: sound of a shared tab */}
      <audio ref={audioRef} autoPlay playsInline />
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-sm text-white backdrop-blur-sm">
        <MonitorUp className="h-4 w-4" />
        {t.screenSharedBy(name || "")}
      </div>
    </div>
  );
}
