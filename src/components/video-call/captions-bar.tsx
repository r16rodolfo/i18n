"use client";

import { Mic } from "lucide-react";

import type { UiLang } from "@/lib/ui-text";
import { uiText } from "@/lib/ui-text";
import { cn } from "@/lib/utils";

import type { LiveCaption } from "./hooks/use-captions";

interface CaptionsBarProps {
  caption: LiveCaption | null;
  // Floor control status line; null when the floor control is off
  floorStatus: { iHold: boolean; holderName: string | null } | null;
  hasError: boolean;
  // Leave room at the bottom for the team's "Show Agent" button
  raised: boolean;
  uiLang: UiLang;
}

// Subtitle area at the bottom of the video: who has the floor and what is
// being said right now.
export function CaptionsBar({
  caption,
  floorStatus,
  hasError,
  raised,
  uiLang,
}: CaptionsBarProps) {
  const t = uiText(uiLang);

  const status = hasError
    ? t.captionsError
    : floorStatus?.iHold
      ? t.floorYouHold
      : floorStatus?.holderName
        ? t.floorHolder(floorStatus.holderName)
        : floorStatus
          ? t.floorFree
          : null;

  if (!status && !caption) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-40 flex flex-col items-center gap-2 px-4",
        raised ? "bottom-16" : "bottom-4",
      )}
    >
      {status && (
        <p
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm backdrop-blur-sm",
            hasError
              ? "bg-red-600/90 text-white"
              : floorStatus?.iHold
                ? "bg-emerald-600/90 text-white"
                : "bg-black/60 text-white/80",
          )}
        >
          {!hasError && (floorStatus?.iHold || floorStatus?.holderName) && (
            <Mic className="h-3.5 w-3.5" />
          )}
          {status}
        </p>
      )}

      {caption && (
        <div
          aria-live="polite"
          className="max-w-3xl rounded-xl bg-black/75 px-5 py-3 text-center backdrop-blur-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-white/50">
            {caption.speaker}
          </p>
          {/* Finished pieces (older one dimmer); only your language shows */}
          {caption.lines.map((line, index) =>
            line.translating ? (
              <TranslatingHint key={line.id} label={t.translating} />
            ) : (
              <p
                key={line.id}
                className={cn(
                  "text-lg leading-snug",
                  index === caption.lines.length - 1
                    ? "text-white"
                    : "text-white/55",
                )}
              >
                {line.text}
              </p>
            ),
          )}

          {/* What is being said right now */}
          {caption.talking &&
            (caption.partialText ? (
              <p className="text-lg leading-snug text-white/70 italic">
                {caption.partialText}
              </p>
            ) : (
              !caption.lines.some((line) => line.translating) && (
                <TranslatingHint label={t.translating} />
              )
            ))}
        </div>
      )}
    </div>
  );
}

function TranslatingHint({ label }: { label: string }) {
  return (
    <p className="flex items-center justify-center gap-2 text-base leading-snug text-white/60 italic">
      <span className="flex gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" />
      </span>
      {label}
    </p>
  );
}
