"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ArrowRight,
  Headphones,
  Hourglass,
  Languages,
  Loader2,
  type LucideIcon,
  Mic,
} from "lucide-react";

import { isValidLanguageCode, type LanguageCode } from "@/lib/languages";
import type { TranslationProvider } from "@/lib/translation-providers";
import { languageName, type UiLang, uiLangFor, uiText } from "@/lib/ui-text";
import { cn } from "@/lib/utils";
import {
  isVoiceEngine,
  isVoiceGender,
  type VoiceEngine,
  type VoiceGender,
} from "@/lib/voice-options";

import { LanguageFlag } from "@/components/flag";
import { LanguageSelector } from "@/components/language-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VideoCall } from "@/components/video-call";

import { useFingerprint } from "@/hooks/use-fingerprint";
import type { EntryMode } from "@/db/schema";

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

  const [username, setUsername] = useState("");
  const [spokenLanguage, setSpokenLanguage] =
    useState<LanguageCode>(defaultLanguage);
  const [preferredLanguage, setPreferredLanguage] =
    useState<LanguageCode>(defaultLanguage);
  // Language of this page: the team's is Portuguese; guests get their
  // browser's language (or Spanish), and can switch with the flags on top
  const [uiLang, setUiLang] = useState<UiLang>(isTeamMember ? "pt" : "es");
  const t = uiText(uiLang);
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

      if (!isTeamMember) {
        // The browser's language, e.g. "en-US" -> "en"
        const browser = (navigator.languages ?? [navigator.language])
          .map((tag) => tag.slice(0, 2).toLowerCase())
          .find(isValidLanguageCode);
        const storedUi = localStorage.getItem("uiLang");
        if (storedUi === "pt" || storedUi === "es" || storedUi === "en") {
          setUiLang(storedUi);
        } else if (browser) {
          setUiLang(uiLangFor(browser));
        }
        // First visit: start with the language they likely speak
        if (!storedSpoken && browser) {
          setSpokenLanguage(browser);
          setPreferredLanguage(browser);
        }
      }
    } catch {
      // Storage blocked (private mode): keep the defaults
    }
  }, [isTeamMember]);

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
        onChangeLanguages={(spoken, preferred) => {
          setSpokenLanguage(spoken);
          setPreferredLanguage(preferred);
          remember("spokenLanguage", spoken);
          remember("preferredLanguage", preferred);
        }}
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

  const pickGender = (gender: VoiceGender) => {
    setVoiceGender(gender);
    remember("voiceGender", gender);
  };

  // Show join form
  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
      <div className="w-full max-w-md px-6 py-10">
        {/* Language of this page */}
        <div className="mb-6 flex justify-end">
          <fieldset
            aria-label={t.pageLanguage}
            className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-1"
          >
            {(["pt", "es", "en"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => {
                  setUiLang(lang);
                  remember("uiLang", lang);
                }}
                aria-pressed={uiLang === lang}
                title={languageName(lang, lang)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors",
                  uiLang === lang
                    ? "bg-black text-white"
                    : "text-neutral-600 hover:bg-neutral-100",
                )}
              >
                <LanguageFlag code={lang} className="h-3" />
                {lang.toUpperCase()}
              </button>
            ))}
          </fieldset>
        </div>

        <div className="space-y-7">
          <div className="space-y-2 text-center">
            <p className="text-xs font-medium tracking-widest uppercase text-neutral-500">
              {t.joinEyebrow}
            </p>
            <h1 className="text-3xl font-light tracking-tight text-black">
              {t.joinTitle}
            </h1>
            <p className="text-neutral-600">{t.joinSubtitle}</p>
          </div>

          {/* How it works, in one glance */}
          <div className="flex items-start justify-center gap-2 text-center">
            <HowStep icon={Mic} label={t.stepSpeak} />
            <ArrowRight className="mt-3.5 h-4 w-4 shrink-0 text-neutral-300" />
            <HowStep icon={Languages} label={t.stepTranslate} />
            <ArrowRight className="mt-3.5 h-4 w-4 shrink-0 text-neutral-300" />
            <HowStep icon={Headphones} label={t.stepHear} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleJoin();
            }}
            className="space-y-5"
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
              <p className="flex items-center gap-2 text-sm font-medium text-black">
                <Mic className="h-4 w-4" />
                {t.iSpeak}
              </p>
              <LanguageSelector
                value={spokenLanguage}
                onChange={(lang) => {
                  setSpokenLanguage(lang);
                  remember("spokenLanguage", lang);
                  // Almost everyone hears in the language they speak: keep
                  // both together unless they were set apart on purpose
                  if (preferredLanguage === spokenLanguage) {
                    setPreferredLanguage(lang);
                    remember("preferredLanguage", lang);
                  }
                }}
                disabled={isJoining}
                uiLang={uiLang}
              />
            </div>

            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-black">
                <Headphones className="h-4 w-4" />
                {t.iHear}
              </p>
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
                  {(
                    [
                      { gender: "female", emoji: "👩", label: t.voiceFemale },
                      { gender: "male", emoji: "👨", label: t.voiceMale },
                    ] as const
                  ).map(({ gender, emoji, label }) => (
                    <button
                      key={gender}
                      type="button"
                      onClick={() => pickGender(gender)}
                      disabled={isJoining}
                      aria-pressed={voiceGender === gender}
                      className={cn(
                        "flex h-12 items-center justify-center gap-2 rounded-lg border text-sm cursor-pointer transition-colors",
                        voiceGender === gender
                          ? "border-black bg-black text-white"
                          : "border-neutral-300 bg-white text-black hover:border-neutral-500",
                      )}
                    >
                      <span className="text-lg" aria-hidden>
                        {emoji}
                      </span>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500">{t.voiceHint}</p>
              </fieldset>
            )}

            {/* What will happen, in big */}
            <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
              <p className="flex items-center gap-2 text-sm text-neutral-600">
                <Mic className="h-4 w-4 shrink-0 text-black" />
                {t.summarySpeak}
                <span className="flex items-center gap-1.5 font-semibold text-black">
                  <LanguageFlag code={spokenLanguage} />
                  {languageName(spokenLanguage, uiLang)}
                </span>
              </p>
              <p className="flex items-center gap-2 text-sm text-neutral-600">
                <Headphones className="h-4 w-4 shrink-0 text-black" />
                {t.summaryHear}
                <span className="flex items-center gap-1.5 font-semibold text-black">
                  <LanguageFlag code={preferredLanguage} />
                  {languageName(preferredLanguage, uiLang)}
                </span>
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 text-center">{error}</p>
            )}

            <Button
              type="submit"
              disabled={!username.trim() || isJoining || isLoadingFingerprint}
              className="h-11 w-full bg-black text-base text-white hover:bg-neutral-800 cursor-pointer"
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
        </div>
      </div>
    </div>
  );
}

// One step of the "how it works" picture on the join page
function HowStep({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex w-24 flex-col items-center gap-1.5">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-neutral-200">
        <Icon className="h-5 w-5 text-black" />
      </span>
      <span className="text-xs leading-tight text-neutral-600">{label}</span>
    </div>
  );
}
