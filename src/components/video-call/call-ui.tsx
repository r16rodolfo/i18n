"use client";

import { useCallback, useEffect, useState } from "react";

import {
  useDaily,
  useDailyEvent,
  useLocalParticipant,
  useParticipantIds,
} from "@daily-co/daily-react";
import { Loader2 } from "lucide-react";

import { uiLangFor, uiText } from "@/lib/ui-text";

import { AgentPanel } from "@/components/agent-panel";

import { CallControls } from "./call-controls";
import { EmailConfirmDialog } from "./email-confirm-dialog";
import { useIntentDetection } from "./hooks/use-intent-detection";
import { useTranscription } from "./hooks/use-transcription";
import { ParticipantTile } from "./participant-tile";
import { ShareModal } from "./share-modal";
import type { VideoCallProps } from "./types";

export function CallUI({
  roomUrl,
  token,
  spokenLanguage,
  preferredLanguage,
  username,
  roomId,
  translationProvider,
  inviteToken,
  isTeamMember,
  invitePath,
}: VideoCallProps) {
  const uiLang = uiLangFor(spokenLanguage);
  const t = uiText(uiLang);
  const daily = useDaily();
  const localParticipant = useLocalParticipant();
  const participantIds = useParticipantIds({ filter: "remote" });

  const [isJoining, setIsJoining] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // With Palabra, others are heard only through the translated voice.
  // Otherwise the original audio of each participant is played.
  const usePalabra = translationProvider === "palabra";

  const {
    transcripts,
    liveTranscript,
    currentTranslation,
    transcriptionStatus,
    startTranscription,
    stopTranscription,
    setMuted: setPalabraMuted,
    addRemoteTrack,
    removeRemoteTrack,
  } = useTranscription({
    spokenLanguage,
    preferredLanguage,
    username,
    roomId,
    inviteToken,
  });

  // The original voice is only turned down (never cut) while Palabra's
  // translated voice is really playing. While it starts, or if it fails,
  // everyone hears the original audio at full volume instead of silence.
  const translatedVoiceActive = usePalabra && transcriptionStatus === "active";
  const originalVolume = translatedVoiceActive ? 0.15 : 1;

  // Proactive intent detection for email actions (team only: the agent
  // routes spend OpenAI credits and can send e-mail)
  const { detectedEmail, dismissEmail } = useIntentDetection({
    roomId,
    transcripts,
    enabled: !isJoining && isTeamMember,
  });

  // Join call and start transcription
  useEffect(() => {
    if (!daily) return;

    const join = async () => {
      try {
        await daily.join({ url: roomUrl, token });

        // Disable auto-subscribe so we can control audio/video separately
        daily.setSubscribeToTracksAutomatically(false);

        // Subscribe to video + audio. Remote audio is played by the tiles,
        // unless Palabra is active (it plays the translated voice instead).
        daily.updateParticipants({
          "*": { setSubscribedTracks: { video: true, audio: true } },
        });

        if (usePalabra) {
          await startTranscription();
        }
        setIsJoining(false);
        if (invitePath) setShowShareModal(true);
      } catch (error) {
        console.error("[Daily] Failed to join:", error);
      }
    };

    join();

    return () => {
      const meetingState = daily.meetingState();
      if (meetingState === "joined-meeting") {
        stopTranscription();
        daily.leave();
      }
    };
  }, [
    daily,
    roomUrl,
    token,
    invitePath,
    usePalabra,
    startTranscription,
    stopTranscription,
  ]);

  // Feed remote audio tracks to Palabra for translation
  useDailyEvent("track-started", (event) => {
    if (!event) return;
    const { participant, track } = event;
    if (!participant || participant.local || !track || track.kind !== "audio")
      return;
    addRemoteTrack(participant.session_id, track);
  });

  // Clean up when remote tracks stop
  useDailyEvent("track-stopped", (event) => {
    if (!event) return;
    const { participant, track } = event;
    if (!participant || participant.local || !track || track.kind !== "audio")
      return;
    removeRemoteTrack(participant.session_id);
  });

  // Subscribe to audio for newly joined participants
  useDailyEvent("participant-joined", (event) => {
    const participant = event?.participant;
    if (!participant || participant.local) return;

    daily?.updateParticipant(participant.session_id, {
      setSubscribedTracks: { video: true, audio: true },
    });
  });

  // Clean up when participants leave
  useDailyEvent("participant-left", (event) => {
    const participant = event?.participant;
    if (!participant || participant.local) return;
    removeRemoteTrack(participant.session_id);
  });

  // Mic toggle - controls both Daily.co (voice to others) and Palabra (local transcription)
  const toggleMute = useCallback(() => {
    if (!daily) return;
    const newMutedState = !isMuted;
    daily.setLocalAudio(!newMutedState);
    setPalabraMuted(newMutedState);
    setIsMuted(newMutedState);
  }, [daily, isMuted, setPalabraMuted]);

  const toggleVideo = useCallback(() => {
    if (!daily) return;
    // isVideoOff=false means video is ON, so pass false to turn it OFF
    daily.setLocalVideo(isVideoOff);
    setIsVideoOff(!isVideoOff);
  }, [daily, isVideoOff]);

  const leaveCall = useCallback(() => {
    if (!daily) return;
    daily.leave();
    window.location.href = isTeamMember ? "/" : "/saiu";
  }, [daily, isTeamMember]);

  if (isJoining) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-white mx-auto" />
          <p className="text-white">{t.joiningCall}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-neutral-900 flex flex-col overflow-hidden">
      {/* Translation overlay */}
      {currentTranslation && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white px-6 py-3 rounded-lg max-w-xl text-center animate-fade-in">
          <p className="text-lg">{currentTranslation}</p>
        </div>
      )}

      {/* Video grid - takes remaining space */}
      <div className="flex-1 p-4 pb-0 overflow-hidden">
        <div
          className={`grid gap-4 h-full ${
            participantIds.length === 0
              ? "grid-cols-1"
              : participantIds.length === 1
                ? "grid-cols-2"
                : "grid-cols-2 grid-rows-2"
          }`}
        >
          {/* Local participant */}
          {localParticipant && (
            <ParticipantTile
              sessionId={localParticipant.session_id}
              username={username}
              isLocal
              preferredLanguage={preferredLanguage}
            />
          )}

          {/* Remote participants */}
          {participantIds.map((id) => (
            <ParticipantTile
              key={id}
              sessionId={id}
              originalVolume={originalVolume}
            />
          ))}
        </div>
      </div>

      {/* Floating agent panel (team only) */}
      {isTeamMember && (
        <AgentPanel
          preferredLanguage={preferredLanguage}
          transcripts={transcripts}
          liveTranscript={liveTranscript}
          transcriptionStatus={usePalabra ? transcriptionStatus : "stopped"}
          roomId={roomId}
        />
      )}

      {/* Controls */}
      <CallControls
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        preferredLanguage={preferredLanguage}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onLeave={leaveCall}
        onShowShare={invitePath ? () => setShowShareModal(true) : undefined}
        uiLang={uiLang}
      />

      {/* Share modal - shows when a team member joins */}
      {showShareModal && invitePath && (
        <ShareModal
          invitePath={invitePath}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Email intent confirmation dialog */}
      {isTeamMember && (
        <EmailConfirmDialog
          action={detectedEmail}
          roomId={roomId}
          onConfirm={dismissEmail}
          onDismiss={dismissEmail}
        />
      )}
    </div>
  );
}
