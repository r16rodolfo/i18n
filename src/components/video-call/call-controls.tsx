"use client";

import {
  Hand,
  Info,
  Mic,
  MicOff,
  PhoneOff,
  Video,
  VideoOff,
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
