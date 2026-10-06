import type { LanguageCode } from "@/lib/languages";
import type { TranslationProvider } from "@/lib/translation-providers";
import type { VoiceEngine, VoiceGender } from "@/lib/voice-options";

import type { EntryMode } from "@/db/schema";

export interface VideoCallProps {
  roomUrl: string;
  token: string;
  spokenLanguage: LanguageCode;
  preferredLanguage: LanguageCode;
  username: string;
  visitorId: string;
  roomId: string;
  translationProvider: TranslationProvider;
  // Translated voice engine of the meeting, and the voice you picked
  voiceEngine: VoiceEngine;
  voiceGender: VoiceGender;
  // Guests: the invite token from their link. Team members: null.
  inviteToken: string | null;
  isTeamMember: boolean;
  // Guest link to share (team members only)
  invitePath: string | null;
  // Lock and entry mode of the room (team members only)
  roomSettings: RoomSettings | null;
  // Change the languages during the call
  onChangeLanguages?: (spoken: LanguageCode, preferred: LanguageCode) => void;
}

export interface RoomSettings {
  locked: boolean;
  entryMode: EntryMode;
}

export interface TranscriptEntry {
  id: string;
  speaker: string;
  original: string;
  translated: string;
  timestamp: Date;
  // Said in another language and not translated yet (shown as "translating")
  pending?: boolean;
}

export interface LiveTranscript {
  speaker: string;
  text: string;
}

export type TranscriptionStatus = "starting" | "active" | "error" | "stopped";
