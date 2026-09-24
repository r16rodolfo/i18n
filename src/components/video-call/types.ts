import type { LanguageCode } from "@/lib/languages";
import type { TranslationProvider } from "@/lib/translation-providers";

export interface VideoCallProps {
  roomUrl: string;
  token: string;
  spokenLanguage: LanguageCode;
  preferredLanguage: LanguageCode;
  username: string;
  visitorId: string;
  roomId: string;
  translationProvider: TranslationProvider;
  // Guests: the invite token from their link. Team members: null.
  inviteToken: string | null;
  isTeamMember: boolean;
  // Guest link to share (team members only)
  invitePath: string | null;
}

export interface TranscriptEntry {
  id: string;
  speaker: string;
  original: string;
  translated: string;
  timestamp: Date;
}

export interface LiveTranscript {
  speaker: string;
  text: string;
}

export type TranscriptionStatus = "starting" | "active" | "error" | "stopped";
