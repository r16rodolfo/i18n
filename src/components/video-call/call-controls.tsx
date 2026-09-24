"use client";

import { Info, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";

import { getLanguageFlag, type LanguageCode } from "@/lib/languages";
import { languageName, type UiLang, uiText } from "@/lib/ui-text";

import { Button } from "@/components/ui/button";

interface CallControlsProps {
  isMuted: boolean;
  isVideoOff: boolean;
  preferredLanguage: LanguageCode;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onLeave: () => void;
  // Omitted for guests: only the team shares the invite link
  onShowShare?: () => void;
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

      {/* Share info button - absolute positioned on the right */}
      {onShowShare && (
        <button
          type="button"
          onClick={onShowShare}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          title={t.shareLink}
          aria-label={t.shareLink}
        >
          <Info className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
