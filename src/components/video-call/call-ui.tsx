"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  useDaily,
  useDailyEvent,
  useLocalParticipant,
  useParticipantIds,
  useScreenShare,
} from "@daily-co/daily-react";
import { Loader2, MonitorUp } from "lucide-react";

import { uiLangFor, uiText } from "@/lib/ui-text";

import { CallControls } from "./call-controls";
import { CaptionsBar } from "./captions-bar";
import { EmailConfirmDialog } from "./email-confirm-dialog";
import { useCallDiagnostics } from "./hooks/use-call-diagnostics";
import { liveTranscriptOf, useCaptions } from "./hooks/use-captions";
import { useFloor } from "./hooks/use-floor";
import { useIntentDetection } from "./hooks/use-intent-detection";
import {
  canRecordLocally,
  useMeetingRecording,
} from "./hooks/use-meeting-recording";
import { useRoomEntry } from "./hooks/use-room-entry";
import { useScribe } from "./hooks/use-scribe";
import { useSoniox } from "./hooks/use-soniox";
import { useTranscription } from "./hooks/use-transcription";
import { useTtsVoice } from "./hooks/use-tts-voice";
import { useMeetingCost, useUsageMeter } from "./hooks/use-usage-meter";
import { MeetingCost } from "./meeting-cost";
import { OpenAIVoiceLink } from "./openai-voice";
import { ParticipantTile } from "./participant-tile";
import { RecordingIndicator } from "./recording-indicator";
import { ScreenShareView } from "./screen-share-view";
import { ShareModal } from "./share-modal";
import { TranscriptSidebar } from "./transcript-sidebar";
import type { VideoCallProps } from "./types";
import { WaitingGuests } from "./waiting-guests";

// Silence (in ms) after which whoever has the floor gives it back
const FLOOR_AUTO_RELEASE_MS = 8000;

export function CallUI({
  roomUrl,
  token,
  spokenLanguage,
  preferredLanguage,
  username,
  visitorId,
  roomId,
  translationProvider,
  voiceEngine,
  voiceGender,
  inviteToken,
  isTeamMember,
  invitePath,
  roomSettings,
  onChangeLanguages,
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
  // Captions under the video: each person turns them on/off (remembered)
  const [showCaptions, setShowCaptions] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("showCaptions") === "false") {
        setShowCaptions(false);
      }
    } catch {
      // Storage blocked: keep them on
    }
  }, []);
  // Transcript column: open on wide screens, closed on phones (it would
  // cover the videos there)
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  useEffect(() => {
    setTranscriptOpen(window.matchMedia("(min-width: 1024px)").matches);
  }, []);
  // Translated voice: each person turns it on/off (remembered, on at first)
  const [hearVoice, setHearVoice] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("hearVoice") === "false") setHearVoice(false);
    } catch {
      // Storage blocked: keep it on
    }
  }, []);
  // How loud the translated voice and the original voice (of people who
  // speak another language) are, while the translated voice is on
  const [voiceVolumes, setVoiceVolumes] = useState({
    translated: 1,
    original: 0.15,
  });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("voiceVolumes") ?? "null");
      if (
        typeof saved?.translated === "number" &&
        typeof saved?.original === "number"
      ) {
        setVoiceVolumes({
          translated: saved.translated,
          original: saved.original,
        });
      }
    } catch {
      // Storage blocked or invalid: keep the defaults
    }
  }, []);
  const changeVoiceVolumes = useCallback(
    (translated: number, original: number) => {
      const next = { translated, original };
      setVoiceVolumes(next);
      try {
        localStorage.setItem("voiceVolumes", JSON.stringify(next));
      } catch {
        // Storage blocked: only for this call
      }
    },
    [],
  );

  const toggleVoice = useCallback(() => {
    setHearVoice((current) => {
      try {
        localStorage.setItem("hearVoice", String(!current));
      } catch {
        // Storage blocked: only for this call
      }
      return !current;
    });
  }, []);

  const toggleCaptions = useCallback(() => {
    setShowCaptions((current) => {
      try {
        localStorage.setItem("showCaptions", String(!current));
      } catch {
        // Storage blocked: only for this call
      }
      return !current;
    });
  }, []);

  // With Palabra, others are heard only through the translated voice.
  // Otherwise the original audio of each participant is played.
  const usePalabra = translationProvider === "palabra";
  // With ElevenLabs or Soniox, each person's mic is transcribed, translated
  // and shared as captions; everyone hears the original voice
  const useElevenLabs = translationProvider === "elevenlabs";
  const useSonioxEngine = translationProvider === "soniox";
  const liveCaptions = useElevenLabs || useSonioxEngine;

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

  // Captions shared through Daily, floor control, your mic
  const inCall = !isJoining;
  // Translated voice read from the captions (Soniox/ElevenLabs) or made
  // straight from the speaker's audio (OpenAI)
  const hasVoice = liveCaptions && voiceEngine !== "none";
  const voiceOn = hasVoice && hearVoice && inCall;
  const ttsVoice = useTtsVoice({
    enabled:
      voiceOn && (voiceEngine === "soniox" || voiceEngine === "elevenlabs"),
    roomId,
    inviteToken,
    visitorId,
    language: preferredLanguage,
    engine: voiceEngine === "elevenlabs" ? "elevenlabs" : "soniox",
    volume: voiceVolumes.translated,
  });
  const captions = useCaptions({
    daily,
    ready: inCall && liveCaptions,
    myName: username,
    spokenLanguage,
    preferredLanguage,
    roomId,
    inviteToken,
    visitorId,
    myVoice: voiceGender,
    onVoicePiece: ttsVoice.speak,
  });
  const floor = useFloor({
    daily,
    // Off at the start (everyone's mic open, like any call); the team can
    // turn it on when people talk over each other. With it on by default,
    // guests who didn't click "Speak" were never heard.
    enabledByDefault: false,
    myName: username,
    ready: inCall && liveCaptions,
  });
  const scribe = useScribe({
    enabled: useElevenLabs,
    roomId,
    inviteToken,
    language: spokenLanguage,
    onPartial: captions.publishPartial,
    onCommitted: captions.publishFinal,
  });
  const soniox = useSoniox({
    enabled: useSonioxEngine,
    roomId,
    inviteToken,
    language: spokenLanguage,
    getTargetLanguage: captions.getTargetLanguage,
    targetLanguage: captions.targetLanguage,
    onPartial: captions.showPartial,
    onPiece: captions.publishTranslatedPiece,
  });
  // The engine that listens to your mic in this meeting
  const engine = useSonioxEngine ? soniox : scribe;
  const floorActive = liveCaptions && floor.floorMode;
  // The transcript panel: everyone in ElevenLabs meetings (in their own
  // language); the AI agent inside it stays team-only
  const showTranscriptPanel = isTeamMember || liveCaptions;
  // Is your mic open? With the floor control on, only while you have the
  // floor; otherwise it follows the mute button.
  const micOpen = floorActive ? floor.iHold : !isMuted;

  // What the agent panel and the e-mail detection read
  const callTranscripts = liveCaptions ? captions.entries : transcripts;
  // Only the phrase still being spoken: finished ones are already in the list
  const callLiveTranscript = liveCaptions
    ? liveTranscriptOf(captions.live)
    : liveTranscript;

  // OpenAI voice: one session per person who speaks another language
  const openAIVoiceOn = voiceOn && voiceEngine === "openai";
  const translatedSpeakers = participantIds.filter((id) => {
    const lang = captions.languages[id];
    return Boolean(lang) && lang !== preferredLanguage;
  });
  const [openAISpeaking, setOpenAISpeaking] = useState<Set<string>>(
    () => new Set(),
  );
  const [openAIConnected, setOpenAIConnected] = useState<Set<string>>(
    () => new Set(),
  );
  const updateSet = useCallback((set: Set<string>, id: string, on: boolean) => {
    if (set.has(id) === on) return set;
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  }, []);
  const onOpenAISpeaking = useCallback(
    (id: string, speaking: boolean) =>
      setOpenAISpeaking((set) => updateSet(set, id, speaking)),
    [updateSet],
  );
  const onOpenAIConnected = useCallback(
    (id: string, connected: boolean) =>
      setOpenAIConnected((set) => updateSet(set, id, connected)),
    [updateSet],
  );
  // The translated voice is playing for you right now
  const voiceSpeaking =
    voiceOn && (ttsVoice.speakingFor !== null || openAISpeaking.size > 0);
  // The original voice of someone is lowered only while their translation
  // is actually playing. If no translation comes (they speak your language
  // after all, or the translation fails) you keep hearing them normally.
  const volumeFor = (sessionId: string) =>
    voiceOn &&
    (ttsVoice.speakingFor === sessionId || openAISpeaking.has(sessionId))
      ? voiceVolumes.original
      : originalVolume;

  // Screen sharing (computers only; one screen at a time). Your own screen
  // isn't shown back to you, just a note that you are sharing it.
  const { screens, isSharingScreen, startScreenShare, stopScreenShare } =
    useScreenShare();
  const sharedScreen = screens.find((screen) => !screen.local) ?? null;
  const [canShareScreen, setCanShareScreen] = useState(false);
  useEffect(() => {
    setCanShareScreen(
      typeof navigator.mediaDevices?.getDisplayMedia === "function",
    );
  }, []);
  const sharedScreenOwner = sharedScreen
    ? (daily?.participants()[sharedScreen.session_id]?.user_name ?? "")
    : null;

  // Diagnostics: what happens in this browser, to find out afterwards why
  // someone wasn't heard or translated (read by us in the database)
  const diagnose = useCallDiagnostics({
    daily,
    enabled: inCall,
    roomId,
    inviteToken,
    visitorId,
    username,
  });
  useEffect(() => {
    if (!inCall) return;
    diagnose("joined", {
      provider: translationProvider,
      voice: voiceEngine,
      speaks: spokenLanguage,
      hears: preferredLanguage,
      team: isTeamMember,
      browser: navigator.userAgent.slice(0, 200),
    });
  }, [
    inCall,
    diagnose,
    translationProvider,
    voiceEngine,
    spokenLanguage,
    preferredLanguage,
    isTeamMember,
  ]);
  useEffect(() => {
    if (!inCall) return;
    const people: Record<string, { user_name?: string }> =
      daily?.participants() ?? {};
    diagnose("languages-known", {
      others: Object.entries(captions.languages).map(
        ([id, lang]) => `${people[id]?.user_name ?? id.slice(0, 6)}=${lang}`,
      ),
    });
  }, [inCall, daily, diagnose, captions.languages]);
  useEffect(() => {
    if (inCall) diagnose("mic-open", { open: micOpen });
  }, [inCall, diagnose, micOpen]);
  useEffect(() => {
    if (inCall) {
      diagnose("turn-taking", {
        on: floor.floorMode,
        holder: floor.holder?.name ?? null,
      });
    }
  }, [inCall, diagnose, floor.floorMode, floor.holder?.name]);
  useEffect(() => {
    if (inCall) diagnose("transcription", { status: engine.status });
  }, [inCall, diagnose, engine.status]);

  // Recording (team starts it; everyone sees it)
  const recording = useMeetingRecording({
    daily,
    ready: inCall,
    roomId,
    myName: username,
  });

  // Team only: lock/entry mode of the room and guests waiting to get in
  const roomEntry = useRoomEntry(
    roomId,
    roomSettings,
    isTeamMember && !isJoining,
  );

  // Cost estimate: everyone reports their time, the team sees the total
  useUsageMeter({
    enabled: inCall,
    roomId,
    inviteToken,
    visitorId,
    engine: useSonioxEngine
      ? "soniox"
      : useElevenLabs
        ? "elevenlabs"
        : usePalabra
          ? "palabra"
          : null,
    engineActive: liveCaptions ? micOpen : translatedVoiceActive,
    voiceStreams: openAIVoiceOn ? openAIConnected.size : 0,
    takeTtsSeconds: ttsVoice.takeAudioSeconds,
  });
  const meetingCost = useMeetingCost(roomId, isTeamMember && inCall);

  // Proactive intent detection for email actions (team only: the agent
  // routes spend OpenAI credits and can send e-mail)
  const { detectedEmail, dismissEmail } = useIntentDetection({
    roomId,
    transcripts: callTranscripts,
    enabled: !isJoining && isTeamMember,
  });

  // Palabra's start/stop change with the languages; read them through a ref
  // so switching languages mid-call never makes the effect below leave and
  // rejoin the call
  const transcriptionRef = useRef({ startTranscription, stopTranscription });
  transcriptionRef.current = { startTranscription, stopTranscription };

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
          "*": {
            setSubscribedTracks: {
              video: true,
              audio: true,
              screenVideo: true,
              screenAudio: true,
            },
          },
        });

        if (usePalabra) {
          await transcriptionRef.current.startTranscription();
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
        transcriptionRef.current.stopTranscription();
        daily.leave();
      }
    };
  }, [daily, roomUrl, token, invitePath, usePalabra]);

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
      setSubscribedTracks: {
        video: true,
        audio: true,
        screenVideo: true,
        screenAudio: true,
      },
    });
  });

  // Clean up when participants leave
  useDailyEvent("participant-left", (event) => {
    const participant = event?.participant;
    if (!participant || participant.local) return;
    removeRemoteTrack(participant.session_id);
  });

  // Open/close your mic in the call, and the ElevenLabs transcription with it
  const { start: startEngine, stop: stopEngine } = engine;
  useEffect(() => {
    if (!daily || isJoining) return;
    daily.setLocalAudio(micOpen);
    if (!liveCaptions) return;
    if (micOpen) startEngine();
    else stopEngine();
  }, [daily, isJoining, micOpen, liveCaptions, startEngine, stopEngine]);

  // You switched the language you speak while talking: restart the
  // transcription in the new language (it is set when a connection opens)
  const lastSpokenRef = useRef(spokenLanguage);
  useEffect(() => {
    if (lastSpokenRef.current === spokenLanguage) return;
    lastSpokenRef.current = spokenLanguage;
    if (!liveCaptions || !micOpen || isJoining) return;
    stopEngine();
    startEngine();
  }, [
    spokenLanguage,
    liveCaptions,
    micOpen,
    isJoining,
    stopEngine,
    startEngine,
  ]);

  // Give the floor back after a long silence, so nobody stays locked out
  const { iHold, release: releaseFloor } = floor;
  const { getSilenceMs } = engine;
  useEffect(() => {
    if (!floorActive || !iHold) return;
    const timer = setInterval(() => {
      if (getSilenceMs() > FLOOR_AUTO_RELEASE_MS) releaseFloor();
    }, 1000);
    return () => clearInterval(timer);
  }, [floorActive, iHold, getSilenceMs, releaseFloor]);

  // Mic toggle (when the floor control is off): Daily follows micOpen above;
  // Palabra transcribes its own copy of the mic
  const toggleMute = useCallback(() => {
    const newMutedState = !isMuted;
    setPalabraMuted(newMutedState);
    setIsMuted(newMutedState);
  }, [isMuted, setPalabraMuted]);

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

      <div className="relative flex min-h-0 flex-1">
        {/* Video grid - takes remaining space */}
        <div className="relative min-w-0 flex-1 p-4 pb-0 overflow-hidden flex flex-col gap-3">
          {sharedScreen && (
            <ScreenShareView sessionId={sharedScreen.session_id} t={t} />
          )}
          {isSharingScreen && !sharedScreen && (
            <div className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600/20 px-3 py-2 text-sm text-emerald-200">
              <MonitorUp className="h-4 w-4" />
              {t.screenSharingYou}
            </div>
          )}
          {/* Same element with or without a shared screen, so the tiles
              (and the audio they play) are never remounted */}
          <div
            className={
              sharedScreen
                ? "flex h-28 shrink-0 gap-3 overflow-x-auto [&>*]:aspect-video [&>*]:h-full [&>*]:shrink-0"
                : `grid gap-4 min-h-0 flex-1 ${
                    participantIds.length === 0
                      ? "grid-cols-1"
                      : participantIds.length === 1
                        ? "grid-cols-2"
                        : "grid-cols-2 grid-rows-2"
                  }`
            }
          >
            {/* Local participant */}
            {localParticipant && (
              <ParticipantTile
                sessionId={localParticipant.session_id}
                username={username}
                isLocal
                preferredLanguage={preferredLanguage}
                micOffLabel={t.micOff}
              />
            )}

            {/* Remote participants */}
            {participantIds.map((id) => (
              <ParticipantTile
                key={id}
                sessionId={id}
                originalVolume={volumeFor(id)}
                // The language they hear in (known once they announce it)
                preferredLanguage={captions.languages[id]}
                micOffLabel={t.micOff}
              />
            ))}
            {openAIVoiceOn &&
              translatedSpeakers.map((id) => (
                <OpenAIVoiceLink
                  key={`voice-${id}`}
                  sessionId={id}
                  roomId={roomId}
                  inviteToken={inviteToken}
                  language={preferredLanguage}
                  onSpeaking={onOpenAISpeaking}
                  onConnected={onOpenAIConnected}
                  volume={voiceVolumes.translated}
                />
              ))}
          </div>

          {isTeamMember && <MeetingCost cost={meetingCost} />}

          <RecordingIndicator
            cloud={recording.cloudRecording}
            localBy={[
              ...(recording.localRecording ? [""] : []),
              ...recording.othersRecordingLocally,
            ]}
            t={t}
          />

          {isTeamMember && (
            <WaitingGuests
              guests={roomEntry.waiting}
              onDecide={roomEntry.decide}
            />
          )}

          {liveCaptions && (
            <CaptionsBar
              caption={showCaptions ? captions.live : null}
              floorStatus={
                floorActive
                  ? {
                      iHold: floor.iHold,
                      holderName: floor.iHold
                        ? null
                        : (floor.holder?.name ?? null),
                    }
                  : null
              }
              hasError={engine.status === "error"}
              uiLang={uiLang}
            />
          )}
        </div>

        {/* Transcript column (+ AI agent for the team): docked on the right
          on wide screens, over the videos on phones */}
        {showTranscriptPanel && transcriptOpen && (
          <div className="absolute inset-0 z-50 lg:static lg:z-auto lg:w-96 lg:shrink-0">
            <TranscriptSidebar
              transcripts={callTranscripts}
              liveTranscript={callLiveTranscript}
              roomId={roomId}
              showAgent={isTeamMember}
              uiLang={uiLang}
              onClose={() => setTranscriptOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Controls */}
      <CallControls
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        preferredLanguage={preferredLanguage}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onLeave={leaveCall}
        onShowShare={invitePath ? () => setShowShareModal(true) : undefined}
        floor={
          floorActive
            ? {
                iHold: floor.iHold,
                otherHolderName: floor.iHold
                  ? null
                  : (floor.holder?.name ?? null),
                onTake: floor.take,
                onRelease: floor.release,
                waitForVoice: voiceSpeaking,
              }
            : undefined
        }
        roomControls={
          isTeamMember && roomEntry.settings
            ? {
                locked: roomEntry.settings.locked,
                approvalRequired: roomEntry.settings.entryMode === "approval",
                onToggleLock: () =>
                  roomEntry.updateSettings({
                    locked: !roomEntry.settings?.locked,
                  }),
                onToggleApproval: () =>
                  roomEntry.updateSettings({
                    entryMode:
                      roomEntry.settings?.entryMode === "approval"
                        ? "open"
                        : "approval",
                  }),
              }
            : undefined
        }
        transcriptToggle={
          showTranscriptPanel
            ? {
                open: transcriptOpen,
                onToggle: () => setTranscriptOpen((open) => !open),
              }
            : undefined
        }
        languages={
          onChangeLanguages && !usePalabra
            ? { spoken: spokenLanguage, onChange: onChangeLanguages }
            : undefined
        }
        record={
          isTeamMember
            ? {
                cloud: recording.cloudRecording,
                local: recording.localRecording,
                busy: recording.cloudBusy,
                canRecordLocally: canRecordLocally(),
                error: recording.error,
                onStartCloud: recording.startCloud,
                onStopCloud: recording.stopCloud,
                onStartLocal: recording.startLocal,
                onStopLocal: recording.stopLocal,
              }
            : undefined
        }
        screenShare={
          canShareScreen
            ? {
                sharing: isSharingScreen,
                busyWith: sharedScreenOwner,
                onToggle: () =>
                  isSharingScreen ? stopScreenShare() : startScreenShare(),
              }
            : undefined
        }
        voiceToggle={
          hasVoice
            ? {
                enabled: hearVoice,
                onToggle: toggleVoice,
                translatedVolume: voiceVolumes.translated,
                originalVolume: voiceVolumes.original,
                onVolumes: changeVoiceVolumes,
              }
            : undefined
        }
        captionsToggle={
          liveCaptions
            ? { enabled: showCaptions, onToggle: toggleCaptions }
            : undefined
        }
        floorToggle={
          liveCaptions && isTeamMember
            ? {
                enabled: floor.floorMode,
                onToggle: () => floor.setFloorMode(!floor.floorMode),
              }
            : undefined
        }
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
