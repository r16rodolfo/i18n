"use client";

import { useState } from "react";

import {
  Captions,
  CaptionsOff,
  Circle,
  Cloud,
  DoorOpen,
  Hand,
  Info,
  Laptop,
  Lock,
  LockOpen,
  MessageSquareText,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  PhoneOff,
  ShieldCheck,
  Square,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";

import { getLanguageFlag, type LanguageCode } from "@/lib/languages";
import { languageName, type UiLang, uiText } from "@/lib/ui-text";
import { cn } from "@/lib/utils";

import { LanguageSelector } from "@/components/language-selector";
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

// Team only: record the meeting in the cloud (Daily) or on this computer
export interface RecordControls {
  cloud: boolean;
  local: boolean;
  busy: boolean;
  canRecordLocally: boolean;
  error: string | null;
  onStartCloud: () => void;
  onStopCloud: () => void;
  onStartLocal: () => void;
  onStopLocal: () => void;
}

// Change the languages you speak and hear, during the call
export interface LanguageControls {
  spoken: LanguageCode;
  onChange: (spoken: LanguageCode, preferred: LanguageCode) => void;
}

// Share your screen (computers only). `busyWith` names someone else who is
// already sharing: only one screen at a time.
export interface ScreenShareToggle {
  sharing: boolean;
  busyWith: string | null;
  onToggle: () => void;
}

// Hear the others in your language (translated voice), each person decides,
// and how loud the translated and the original voices are (0 to 1)
export interface VoiceToggle {
  enabled: boolean;
  onToggle: () => void;
  translatedVolume: number;
  originalVolume: number;
  onVolumes: (translated: number, original: number) => void;
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
  screenShare?: ScreenShareToggle;
  record?: RecordControls;
  languages?: LanguageControls;
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
  screenShare,
  record,
  languages,
  transcriptToggle,
  roomControls,
  uiLang,
}: CallControlsProps) {
  const t = uiText(uiLang);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [recordMenuOpen, setRecordMenuOpen] = useState(false);

  return (
    <div className="shrink-0 bg-neutral-800/90 backdrop-blur-sm p-4 border-t border-white/5 relative">
      {/* Language indicator - absolute positioned so it doesn't affect centering */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2">
        {languages ? (
          <button
            type="button"
            onClick={() => setLanguageMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-white/70 hover:bg-white/10 hover:text-white cursor-pointer"
            title={t.changeLanguages}
            aria-expanded={languageMenuOpen}
          >
            <span>{getLanguageFlag(preferredLanguage)}</span>
            <span className="hidden sm:inline">
              {t.hearingIn(languageName(preferredLanguage, uiLang))}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-white/70">
            <span>{getLanguageFlag(preferredLanguage)}</span>
            <span className="hidden sm:inline">
              {t.hearingIn(languageName(preferredLanguage, uiLang))}
            </span>
          </div>
        )}
        {languages && languageMenuOpen && (
          <div className="absolute bottom-full left-0 z-50 mb-3 w-64 space-y-3 rounded-xl border border-white/10 bg-neutral-950/95 p-4 text-white shadow-2xl">
            <div className="space-y-1 text-neutral-900">
              <p className="text-xs text-white/60">{t.iSpeak}</p>
              <LanguageSelector
                value={languages.spoken}
                onChange={(lang) =>
                  // Hearing follows speaking unless they were set apart
                  languages.onChange(
                    lang,
                    preferredLanguage === languages.spoken
                      ? lang
                      : preferredLanguage,
                  )
                }
                uiLang={uiLang}
              />
            </div>
            <div className="space-y-1 text-neutral-900">
              <p className="text-xs text-white/60">{t.iHear}</p>
              <LanguageSelector
                value={preferredLanguage}
                onChange={(lang) => languages.onChange(languages.spoken, lang)}
                uiLang={uiLang}
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="w-full cursor-pointer"
              onClick={() => setLanguageMenuOpen(false)}
            >
              {t.done}
            </Button>
          </div>
        )}
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
        {screenShare && (
          <Button
            variant={screenShare.sharing ? "destructive" : "secondary"}
            size="icon"
            onClick={screenShare.onToggle}
            disabled={Boolean(screenShare.busyWith) && !screenShare.sharing}
            title={
              screenShare.sharing
                ? t.screenShareStop
                : screenShare.busyWith !== null
                  ? t.screenShareBusy(screenShare.busyWith)
                  : t.screenShare
            }
            aria-label={screenShare.sharing ? t.screenShareStop : t.screenShare}
            aria-pressed={screenShare.sharing}
            className="w-12 h-12 rounded-full"
          >
            {screenShare.sharing ? (
              <MonitorOff className="w-5 h-5" />
            ) : (
              <MonitorUp className="w-5 h-5" />
            )}
          </Button>
        )}
        {record && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setRecordMenuOpen((open) => !open)}
              className={cn(
                "p-2 rounded-lg transition-colors cursor-pointer hover:bg-white/10",
                record.cloud || record.local
                  ? "text-red-400 hover:text-red-300"
                  : "text-white/50 hover:text-white",
              )}
              title={
                record.cloud || record.local
                  ? "Gravando (clique para parar)"
                  : "Gravar a reunião"
              }
              aria-label="Gravar a reunião"
              aria-expanded={recordMenuOpen}
            >
              <Circle
                className={cn(
                  "w-5 h-5",
                  (record.cloud || record.local) &&
                    "fill-current animate-pulse",
                )}
              />
            </button>
            {recordMenuOpen && (
              <div className="absolute bottom-full right-0 z-50 mb-3 w-72 space-y-2 rounded-xl border border-white/10 bg-neutral-950/95 p-3 text-sm text-white shadow-2xl">
                <p className="px-1 text-xs text-white/60">
                  Todos na chamada veem que está sendo gravada.
                </p>
                <button
                  type="button"
                  disabled={record.busy}
                  onClick={
                    record.cloud ? record.onStopCloud : record.onStartCloud
                  }
                  className="flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-white/10 cursor-pointer disabled:opacity-50"
                >
                  {record.cloud ? (
                    <Square className="mt-0.5 h-4 w-4 shrink-0 fill-current text-red-400" />
                  ) : (
                    <Cloud className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span>
                    {record.cloud
                      ? "Parar a gravação na nuvem"
                      : "Gravar na nuvem"}
                    <span className="block text-xs text-white/50">
                      Vídeo e vozes originais, fica no Daily (baixe em Custos).
                      ~US$ 1 por hora.
                    </span>
                  </span>
                </button>
                {record.canRecordLocally && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecordMenuOpen(false);
                      if (record.local) record.onStopLocal();
                      else record.onStartLocal();
                    }}
                    className="flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-white/10 cursor-pointer"
                  >
                    {record.local ? (
                      <Square className="mt-0.5 h-4 w-4 shrink-0 fill-current text-red-400" />
                    ) : (
                      <Laptop className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>
                      {record.local
                        ? "Parar e salvar o arquivo"
                        : "Gravar no meu computador"}
                      <span className="block text-xs text-white/50">
                        Grava esta aba como você vê e ouve (com legendas e voz
                        traduzida). Escolha "Esta aba" e marque o áudio. Sem
                        custo.
                      </span>
                    </span>
                  </button>
                )}
                {record.error && (
                  <p className="px-1 text-xs text-red-400">{record.error}</p>
                )}
              </div>
            )}
          </div>
        )}
        {voiceToggle && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setVoiceMenuOpen((open) => !open)}
              aria-expanded={voiceMenuOpen}
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
            {voiceMenuOpen && (
              <div className="absolute bottom-full right-0 z-50 mb-3 w-72 space-y-4 rounded-xl border border-white/10 bg-neutral-950/95 p-4 text-sm text-white shadow-2xl">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span>{t.voiceHear}</span>
                  <input
                    type="checkbox"
                    checked={voiceToggle.enabled}
                    onChange={voiceToggle.onToggle}
                    className="h-4 w-4 cursor-pointer accent-emerald-500"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="flex justify-between text-white/70">
                    {t.voiceTranslatedVolume}
                    <span>
                      {Math.round(voiceToggle.translatedVolume * 100)}%
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(voiceToggle.translatedVolume * 100)}
                    disabled={!voiceToggle.enabled}
                    onChange={(event) =>
                      voiceToggle.onVolumes(
                        Number(event.target.value) / 100,
                        voiceToggle.originalVolume,
                      )
                    }
                    className="w-full cursor-pointer accent-emerald-500 disabled:opacity-40"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="flex justify-between text-white/70">
                    {t.voiceOriginalVolume}
                    <span>{Math.round(voiceToggle.originalVolume * 100)}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(voiceToggle.originalVolume * 100)}
                    disabled={!voiceToggle.enabled}
                    onChange={(event) =>
                      voiceToggle.onVolumes(
                        voiceToggle.translatedVolume,
                        Number(event.target.value) / 100,
                      )
                    }
                    className="w-full cursor-pointer accent-emerald-500 disabled:opacity-40"
                  />
                </label>
                <p className="text-xs text-white/50">{t.voiceHeadphones}</p>
              </div>
            )}
          </div>
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
