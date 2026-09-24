"use client";

import { useEffect, useState } from "react";

import { ArrowRight, Loader2 } from "lucide-react";

import type { LanguageCode } from "@/lib/languages";
import type { TranslationProvider } from "@/lib/translation-providers";
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
}

export function RoomClient({
  roomId,
  inviteToken,
  isTeamMember,
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
  const [isJoining, setIsJoining] = useState(false);
  const [joined, setJoined] = useState<{
    roomUrl: string;
    token: string;
    translationProvider: TranslationProvider;
    invitePath: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load name and language preferences from localStorage on mount
  useEffect(() => {
    try {
      const storedName = localStorage.getItem("username");
      const storedSpoken = localStorage.getItem("spokenLanguage");
      const storedPreferred = localStorage.getItem("preferredLanguage");
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

  const handleJoin = async () => {
    if (!visitorId || !username.trim()) return;

    setIsJoining(true);
    setError(null);
    remember("username", username.trim());

    try {
      const res = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId,
          username: username.trim(),
          preferredLanguage,
          inviteToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(res.status === 403 ? t.invalidLink : t.joinFailed);
      }

      setJoined({
        roomUrl: data.roomUrl,
        token: data.token,
        translationProvider: data.translationProvider ?? "none",
        invitePath: data.invitePath ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.joinFailed);
    } finally {
      setIsJoining(false);
    }
  };

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
        inviteToken={inviteToken}
        isTeamMember={isTeamMember}
        invitePath={joined.invitePath}
      />
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
