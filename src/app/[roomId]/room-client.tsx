"use client";

import { useCallback, useEffect, useState } from "react";

import { ArrowRight, Hourglass, Loader2 } from "lucide-react";

import type { EntryMode } from "@/db/schema";
import type { LanguageCode } from "@/lib/languages";
import type { TranslationProvider } from "@/lib/translation-providers";
import {
  isVoiceEngine,
  isVoiceGender,
  type VoiceEngine,
  type VoiceGender,
} from "@/lib/voice-options";
import { languageName, type UiLang, uiText } from "@/lib/ui-text";

import { LanguageSelector } from "@/components/language-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VideoCall } from "@/components/video-call";

import { useFingerprint } from "@/hooks/use-fingerprint";

interface RoomClientProps {
  roomId: string;
  // Guests: the token from their invite link. Team members: null.
  inviteToken: string | null;
  isTeamMember: boolean;
  // Ask which voice reads your speech in translation (female/male)
  askVoice: boolean;
}

export function RoomClient({
  roomId,
  inviteToken,
  isTeamMember,
  askVoice,
}: RoomClientProps) {
  const { visitorId, isLoading: isLoadingFingerprint } = useFingerprint();

  // The R16 team speaks Portuguese; guests are Paraguayan clients.
  const defaultLanguage: LanguageCode = isTeamMember ? "pt" : "es";
  const uiLang: UiLang = isTeamMember ? "pt" : "es";
  const t = uiText(uiLang);

  const [username, setUsername] = useState("");
  const [spokenLanguage, setSpokenLanguage] =
    useState<LanguageCode>(defaultLanguage);
  const [preferredLanguage, setPreferredLanguage] =
    useState<LanguageCode>(defaultLanguage);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("female");
  const [isJoining, setIsJoining] = useState(false);
  const [joined, setJoined] = useState<{
    roomUrl: string;
    token: string;
    translationProvider: TranslationProvider;
    voiceEngine: VoiceEngine;
    invitePath: string | null;
    roomSettings: { locked: boolean; entryMode: EntryMode } | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Waiting room: the ticket while a team member decides
  const [waitingRequestId, setWaitingRequestId] = useState<string | null>(null);

  // Load name and language preferences from localStorage on mount
  useEffect(() => {
    try {
      const storedName = localStorage.getItem("username");
      const storedSpoken = localStorage.getItem("spokenLanguage");
      const storedPreferred = localStorage.getItem("preferredLanguage");
      const storedVoice = localStorage.getItem("voiceGender");
      if (isVoiceGender(storedVoice)) setVoiceGender(storedVoice);
      if (storedName) setUsername(storedName);
      if (storedSpoken) setSpokenLanguage(storedSpoken as LanguageCode);
      if (storedPreferred)
        setPreferredLanguage(storedPreferred as LanguageCode);
    } catch {
      // Storage blocked (private mode): keep the defaults
    }
  }, []);

  const remember = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage blocked: nothing to do
    }
  };

  // Asks to get in. Guests of an "approval" room get a waiting ticket
  // first (202) and ask again with it until they are let in or refused.
  const requestEntry = useCallback(
    async (requestId: string | null) => {
      if (!visitorId || !username.trim()) return;

      try {
        const res = await fetch(`/api/rooms/${roomId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitorId,
            username: username.trim(),
            preferredLanguage,
            inviteToken,
            requestId,
          }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 202) {
          setWaitingRequestId(data.requestId);
          return;
        }
        setWaitingRequestId(null);
        if (!res.ok) {
          throw new Error(
            data.reason === "locked"
              ? t.roomLocked
              : data.reason === "denied"
                ? t.entryDenied
                : res.status === 403
                  ? t.invalidLink
                  : t.joinFailed,
          );
        }

        setJoined({
          roomUrl: data.roomUrl,
          token: data.token,
          translationProvider: data.translationProvider ?? "none",
          voiceEngine: isVoiceEngine(data.voiceEngine)
            ? data.voiceEngine
            : "none",
          invitePath: data.invitePath ?? null,
          roomSettings: data.roomSettings ?? null,
        });
      } catch (err) {
        setWaitingRequestId(null);
        setError(err instanceof Error ? err.message : t.joinFailed);
      }
    },
    [visitorId, username, roomId, preferredLanguage, inviteToken, t],
  );

  const handleJoin = async () => {
    if (!visitorId || !username.trim()) return;

    setIsJoining(true);
    setError(null);
    remember("username", username.trim());
    await requestEntry(null);
    setIsJoining(false);
  };

  // While waiting, check every 2 s whether a team member decided
  useEffect(() => {
    if (!waitingRequestId) return;
    const timer = setInterval(() => requestEntry(waitingRequestId), 2000);
    return () => clearInterval(timer);
  }, [waitingRequestId, requestEntry]);

  // Show video call when joined
  if (joined && visitorId) {
    return (
      <VideoCall
        roomUrl={joined.roomUrl}
        token={joined.token}
        spokenLanguage={spokenLanguage}
        preferredLanguage={preferredLanguage}
        username={username.trim()}
        visitorId={visitorId}
        roomId={roomId}
        translationProvider={joined.translationProvider}
        voiceEngine={joined.voiceEngine}
        voiceGender={voiceGender}
        inviteToken={inviteToken}
        isTeamMember={isTeamMember}
        invitePath={joined.invitePath}
        roomSettings={joined.roomSettings}
      />
    );
  }

  // Waiting room
  if (waitingRequestId) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <Hourglass className="w-8 h-8 text-neutral-500 mx-auto animate-pulse" />
          <h1 className="text-2xl font-light text-black">{t.waitingTitle}</h1>
          <p className="text-neutral-600">{t.waitingText}</p>
          <Button
            variant="outline"
            onClick={() => setWaitingRequestId(null)}
            className="cursor-pointer"
          >
            {t.waitingCancel}
          </Button>
        </div>
      </div>
    );
  }

  // Show join form
  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <p className="text-xs font-medium tracking-widest uppercase text-neutral-500">
              {t.joinEyebrow}
            </p>
            <h1 className="text-3xl font-light tracking-tight text-black">
              {t.joinTitle}
            </h1>
            <p className="text-neutral-600">{t.joinSubtitle}</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleJoin();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="text-sm font-medium text-black"
              >
                {t.yourName}
              </label>
              <Input
                id="username"
                type="text"
                placeholder={t.yourNamePlaceholder}
                value={username}
                maxLength={60}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-white"
                disabled={isJoining || isLoadingFingerprint}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-black">
                {t.iSpeak}
              </label>
              <LanguageSelector
                value={spokenLanguage}
                onChange={(lang) => {
                  setSpokenLanguage(lang);
                  remember("spokenLanguage", lang);
                }}
                disabled={isJoining}
                uiLang={uiLang}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-black">
                {t.iHear}
              </label>
              <LanguageSelector
                value={preferredLanguage}
                onChange={(lang) => {
                  setPreferredLanguage(lang);
                  remember("preferredLanguage", lang);
                }}
                disabled={isJoining}
                uiLang={uiLang}
              />
            </div>

            {askVoice && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-black">
                  {t.yourVoice}
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["female", "male"] as const).map((gender) => (
                    <button
                      key={gender}
                      type="button"
                      onClick={() => {
                        setVoiceGender(gender);
                        remember("voiceGender", gender);
                      }}
                      disabled={isJoining}
                      aria-pressed={voiceGender === gender}
                      className={`h-10 rounded-md border text-sm cursor-pointer transition-colors ${
                        voiceGender === gender
                          ? "border-black bg-black text-white"
                          : "border-neutral-300 bg-white text-black hover:border-neutral-500"
                      }`}
                    >
                      {gender === "female" ? t.voiceFemale : t.voiceMale}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {error && (
              <p className="text-sm text-red-600 text-center">{error}</p>
            )}

            <Button
              type="submit"
              disabled={!username.trim() || isJoining || isLoadingFingerprint}
              className="w-full bg-black text-white hover:bg-neutral-800 cursor-pointer"
            >
              {isJoining || isLoadingFingerprint ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isLoadingFingerprint ? t.loading : t.joining}
                </>
              ) : (
                <>
                  {t.joinCall}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          <p className="text-xs text-center text-neutral-500">
            {t.summary(
              languageName(spokenLanguage, uiLang),
              languageName(preferredLanguage, uiLang),
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
