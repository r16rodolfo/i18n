"use client";

import type { UiText } from "@/lib/ui-text";

// Everyone sees when the meeting is being recorded (cloud or someone's
// computer), top center of the call
export function RecordingIndicator({
  cloud,
  localBy,
  t,
}: {
  cloud: boolean;
  // Names of people recording on their computer ("" = you)
  localBy: string[];
  t: UiText;
}) {
  if (!cloud && localBy.length === 0) return null;
  const names = localBy.map((name) => name || t.recordingYou).join(", ");
  return (
    <output
      className="absolute left-1/2 top-6 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-medium text-white shadow-lg"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
      {cloud ? t.recordingCloud : t.recordingLocal(names)}
    </output>
  );
}
