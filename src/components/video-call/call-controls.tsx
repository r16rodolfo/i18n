"use client";

import {
  Captions,
  CaptionsOff,
  DoorOpen,
  Hand,
  Info,
  Lock,
  LockOpen,
  MessageSquareText,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";

import { getLanguageFlag, type LanguageCode } from "@/lib/languages";
import { languageName, type UiLang, uiText } from "@/lib/ui-text";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

// Floor control ("trava de fala"): replaces the mic button while it is on
export interface FloorControls {
  iHold: boolean;
  // Someone else who has the floor, if any
  otherHolderName: string | null;
  onTake: () => void;
  onRelease: () => void;
  // The translated voice of the last speaker is still playing for you:
  // wait before talking, or you would talk over it
  waitForVoice?: boolean;
}

// Hear the others in your language (translated voice), each person decides
export interface VoiceToggle {
  enabled: boolean;
  onToggle: () => void;
}

// Show/hide the captions under the video (each person decides for themselves)
export interface CaptionsToggle {
  enabled: boolean;
  onToggle: () => void;
}

// Team only: lock the room (no new guests) and choose how guests get in
export interface RoomControls {
  locked: boolean;
  approvalRequired: boolean;
  onToggleLock: () => void;
  onToggleApproval: () => void;
}

// Open/close the transcript column
export interface TranscriptToggle {
  open: boolean;
  onToggle: () => void;
}

// Team only: turn the floor control on/off for everyone
export interface FloorToggle {
  enabled: boolean;
  onToggle: () => void;
}

interface CallControlsProps {
  isMuted: boolean;
  isVideoOff: boolean;
  preferredLanguage: LanguageCode;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onLeave: () => void;
  // Omitted for guests: only the team shares the invite link
  onShowShare?: () => void;
  floor?: FloorControls;
  floorToggle?: FloorToggle;
  captionsToggle?: CaptionsToggle;
  voiceToggle?: VoiceToggle;
  transcriptToggle?: TranscriptToggle;
  roomControls?: RoomControls;
  uiLang: UiLang;
}

export function CallControls({
  isMuted,
  isVideoOff,
  preferredLanguage,
  onToggleMute,
  onToggleVideo,
  onLeave,
  onShowShare,
  floor,
  floorToggle,
  captionsToggle,
  voiceToggle,
  transcriptToggle,
  roomControls,
  uiLang,
}: CallControlsProps) {
  const t = uiText(uiLang);

  return (
    <div className="shrink-0 bg-neutral-800/90 backdrop-blur-sm p-4 border-t border-white/5 relative">
      {/* Language indicator - absolute positioned so it doesn't affect centering */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 text-sm flex items-center gap-2">
        <span>{getLanguageFlag(preferredLanguage)}</span>
        <span className="hidden sm:inline">
          {t.hearingIn(languageName(preferredLanguage, uiLang))}
        </span>
      </div>

      {/* Centered controls */}
      <div className="flex items-center justify-center gap-4">
        {floor ? (
          <FloorButton floor={floor} uiLang={uiLang} />
        ) : (
          <Button
            variant={isMuted ? "destructive" : "secondary"}
            size="icon"
            onClick={onToggleMute}
            title={isMuted ? t.unmute : t.mute}
            aria-label={isMuted ? t.unmute : t.mute}
            className="w-12 h-12 rounded-full"
          >
            {isMuted ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </Button>
        )}

        <Button
          variant={isVideoOff ? "destructive" : "secondary"}
          size="icon"
          onClick={onToggleVideo}
          title={isVideoOff ? t.cameraOn : t.cameraOff}
          aria-label={isVideoOff ? t.cameraOn : t.cameraOff}
          className="w-12 h-12 rounded-full"
        >
          {isVideoOff ? (
            <VideoOff className="w-5 h-5" />
          ) : (
            <Video className="w-5 h-5" />
          )}
        </Button>

        <Button
          variant="destructive"
          size="icon"
          onClick={onLeave}
          title={t.leave}
          aria-label={t.leave}
          className="w-12 h-12 rounded-full"
        >
          <PhoneOff className="w-5 h-5" />
        </Button>
      </div>

      {/* Team buttons - absolute positioned on the right */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {captionsToggle && (
          <button
            type="button"
            onClick={captionsToggle.onToggle}
            className={cn(
              "p-2 rounded-lg transition-colors cursor-pointer hover:bg-white/10",
              captionsToggle.enabled
                ? "text-white hover:text-white"
                : "text-white/50 hover:text-white",
            )}
            title={captionsToggle.enabled ? t.captionsHide : t.captionsShow}
            aria-label={
              captionsToggle.enabled ? t.captionsHide : t.captionsShow
            }
            aria-pressed={captionsToggle.enabled}
          >
            {captionsToggle.enabled ? (
              <Captions className="w-5 h-5" />
            ) : (
              <CaptionsOff className="w-5 h-5" />
            )}
          </button>
        )}
        {voiceToggle && (
          <button
            type="button"
            onClick={voiceToggle.onToggle}
            className={cn(
              "p-2 rounded-lg transition-colors cursor-pointer hover:bg-white/10",
              voiceToggle.enabled
                ? "text-white hover:text-white"
                : "text-white/50 hover:text-white",
            )}
            title={voiceToggle.enabled ? t.voiceOn : t.voiceOff}
            aria-label={voiceToggle.enabled ? t.voiceOn : t.voiceOff}
            aria-pressed={voiceToggle.enabled}
          >
            {voiceToggle.enabled ? (
              <Volume2 className="w-5 h-5" />
            ) : (
              <VolumeX className="w-5 h-5" />
            )}
          </button>
        )}
        {roomControls && (
          <>
            <button
              type="button"
              onClick={roomControls.onToggleApproval}
              className={cn(
                "p-2 rounded-lg transition-colors cursor-pointer hover:bg-white/10",
                roomControls.approvalRequired
                  ? "text-emerald-400 hover:text-emerald-300"
                  : "text-white/50 hover:text-white",
              )}
              title={
                roomControls.approvalRequired
                  ? "Entrada com autorização (clique para deixar entrar direto)"
                  : "Entrada direta (clique para exigir autorização)"
              }
              aria-label="Entrada com autorização"
              aria-pressed={roomControls.approvalRequired}
            >
              {roomControls.approvalRequired ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <DoorOpen className="w-5 h-5" />
              )}
            </button>
            <button
              type="button"
              onClick={roomControls.onToggleLock}
              className={cn(
                "p-2 rounded-lg transition-colors cursor-pointer hover:bg-white/10",
                roomControls.locked
                  ? "text-amber-400 hover:text-amber-300"
                  : "text-white/50 hover:text-white",
              )}
              title={
                roomControls.locked
                  ? "Sala trancada: ninguém novo entra (clique para destrancar)"
                  : "Trancar sala: o convite para de funcionar para quem ainda não entrou"
              }
              aria-label="Trancar sala"
              aria-pressed={roomControls.locked}
            >
              {roomControls.locked ? (
                <Lock className="w-5 h-5" />
              ) : (
                <LockOpen className="w-5 h-5" />
              )}
            </button>
          </>
        )}
        {transcriptToggle && (
          <button
            type="button"
            onClick={transcriptToggle.onToggle}
            className={cn(
              "p-2 rounded-lg transition-colors cursor-pointer hover:bg-white/10",
              transcriptToggle.open
                ? "text-white hover:text-white"
                : "text-white/50 hover:text-white",
            )}
            title={transcriptToggle.open ? t.transcriptHide : t.transcriptShow}
            aria-label={
              transcriptToggle.open ? t.transcriptHide : t.transcriptShow
            }
            aria-pressed={transcriptToggle.open}
          >
            <MessageSquareText className="w-5 h-5" />
          </button>
        )}
        {floorToggle && (
          <button
            type="button"
            onClick={floorToggle.onToggle}
            className={cn(
              "p-2 rounded-lg transition-colors cursor-pointer hover:bg-white/10",
              floorToggle.enabled
                ? "text-emerald-400 hover:text-emerald-300"
                : "text-white/50 hover:text-white",
            )}
            title={floorToggle.enabled ? t.floorLockOn : t.floorLockOff}
            aria-label={floorToggle.enabled ? t.floorLockOn : t.floorLockOff}
            aria-pressed={floorToggle.enabled}
          >
            <Hand className="w-5 h-5" />
          </button>
        )}
        {onShowShare && (
          <button
            type="button"
            onClick={onShowShare}
            className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title={t.shareLink}
            aria-label={t.shareLink}
          >
            <Info className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

function FloorButton({
  floor,
  uiLang,
}: {
  floor: FloorControls;
  uiLang: UiLang;
}) {
  const t = uiText(uiLang);

  if (floor.iHold) {
    return (
      <Button
        variant="destructive"
        onClick={floor.onRelease}
        className="h-12 rounded-full px-6 gap-2 text-base cursor-pointer"
      >
        <MicOff className="w-5 h-5" />
        {t.floorRelease}
      </Button>
    );
  }

  if (floor.otherHolderName) {
    return (
      <Button
        variant="secondary"
        disabled
        className="h-12 rounded-full px-6 gap-2 text-base max-w-64"
      >
        <MicOff className="w-5 h-5 shrink-0" />
        <span className="truncate">{t.floorBusy(floor.otherHolderName)}</span>
      </Button>
    );
  }

  if (floor.waitForVoice) {
    return (
      <Button
        variant="secondary"
        disabled
        className="h-12 rounded-full px-6 gap-2 text-base"
      >
        <Volume2 className="w-5 h-5 shrink-0 animate-pulse" />
        {t.floorWaitVoice}
      </Button>
    );
  }

  return (
    <Button
      onClick={floor.onTake}
      className="h-12 rounded-full px-6 gap-2 text-base bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
    >
      <Mic className="w-5 h-5" />
      {t.floorTake}
    </Button>
  );
}
