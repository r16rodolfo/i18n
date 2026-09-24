"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Languages, Loader2, Send, Sparkles, Users, X } from "lucide-react";

import type { UiLang, UiText } from "@/lib/ui-text";
import { uiText } from "@/lib/ui-text";
import { cn } from "@/lib/utils";

import type { LiveTranscript, TranscriptEntry } from "./types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface TranscriptSidebarProps {
  transcripts: TranscriptEntry[];
  liveTranscript: LiveTranscript | null;
  roomId: string;
  // The AI agent (questions about the meeting) is for the team only
  showAgent: boolean;
  uiLang: UiLang;
  onClose: () => void;
}

// Column on the right of the call: the meeting transcript in the reader's
// language, filterable by person, plus the AI agent for the team. Docked
// next to the videos so it never covers the captions.
export function TranscriptSidebar({
  transcripts,
  liveTranscript,
  roomId,
  showAgent,
  uiLang,
  onClose,
}: TranscriptSidebarProps) {
  const t = uiText(uiLang);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  // "há 5 s" labels keep moving even when nobody speaks
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  const speakers = useMemo(
    () => [...new Set(transcripts.map((entry) => entry.speaker))],
    [transcripts],
  );
  const visible = selectedSpeaker
    ? transcripts.filter((entry) => entry.speaker === selectedSpeaker)
    : transcripts;
  const showLive =
    liveTranscript &&
    (!selectedSpeaker || liveTranscript.speaker === selectedSpeaker);

  // Newest at the bottom, like a chat
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new lines
  useLayoutEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [visible.length, liveTranscript?.text]);

  return (
    <aside className="flex h-full w-full flex-col bg-neutral-950/95 text-white lg:border-l lg:border-white/10">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Languages className="h-4 w-4" />
          <span>{t.transcriptTitle}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          title={t.transcriptHide}
          aria-label={t.transcriptHide}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Speaker filter */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/5 px-4 py-2">
        <Users className="h-3.5 w-3.5 shrink-0 text-white/50" />
        <SpeakerTab
          label={t.allSpeakers}
          active={selectedSpeaker === null}
          onClick={() => setSelectedSpeaker(null)}
        />
        {speakers.map((speaker) => (
          <SpeakerTab
            key={speaker}
            label={speaker}
            active={selectedSpeaker === speaker}
            onClick={() => setSelectedSpeaker(speaker)}
          />
        ))}
      </div>

      {/* Transcript */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && !showLive ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Languages className="mb-2 h-8 w-8 text-white/20" />
            <p className="text-sm text-white/50">{t.waitingForSpeech}</p>
            <p className="mt-1 text-xs text-white/30">
              {t.transcriptEmptyHint}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {visible.map((entry) => (
              <div key={entry.id} className="px-4 py-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium text-blue-400">
                    {entry.speaker}
                  </span>
                  <span className="text-xs text-white/30">
                    {timeAgo(entry.timestamp, t)}
                  </span>
                </div>
                {/* Only text in the reader's language */}
                {entry.pending ? (
                  <p className="text-sm text-white/50 italic">
                    {t.translating}
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed">{entry.translated}</p>
                )}
              </div>
            ))}

            {showLive && liveTranscript && (
              <div className="bg-blue-500/10 px-4 py-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                  <span className="text-xs font-medium text-blue-400">
                    {liveTranscript.speaker}
                  </span>
                  <span className="text-[10px] text-blue-400/60">
                    {t.speaking}
                  </span>
                </div>
                <p
                  className={cn(
                    "text-sm",
                    liveTranscript.text ? "text-white/80" : "text-white/50",
                    "italic",
                  )}
                >
                  {liveTranscript.text || t.translating}
                </p>
              </div>
            )}
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {showAgent && (
        <AgentChat roomId={roomId} transcripts={transcripts} t={t} />
      )}
    </aside>
  );
}

function SpeakerTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs transition-colors",
        active ? "bg-white/10 text-white" : "text-white/50 hover:text-white",
      )}
    >
      {label}
    </button>
  );
}

// Team only: ask the AI agent about the meeting (streams the answer)
function AgentChat({
  roomId,
  transcripts,
  t,
}: {
  roomId: string;
  transcripts: TranscriptEntry[];
  t: UiText;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // AI SDK stream: "data: {...}" lines with text deltas
  const parseChunk = (chunk: string) => {
    let text = "";
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === "text-delta" && data.delta) text += data.delta;
      } catch {
        // Partial line: the rest comes in the next chunk
      }
    }
    return text;
  };

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    const history: ChatMessage[] = [
      ...messages,
      { role: "user", content: question },
    ];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`/api/agent/${roomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcripts, messages: history }),
      });
      const reader = res.ok ? res.body?.getReader() : null;
      if (!reader) throw new Error(`Agent error: ${res.status}`);

      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += parseChunk(decoder.decode(value));
        setMessages([...history, { role: "assistant", content: answer }]);
      }
    } catch (error) {
      console.error("[Agent] chat failed:", error);
      setMessages(history);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shrink-0 border-t border-white/10">
      {messages.length > 0 && (
        <div className="max-h-56 space-y-2 overflow-y-auto px-4 pt-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] text-white/40">
              <Sparkles className="h-3 w-3" />
              {t.agentTitle}
            </span>
            <button
              type="button"
              onClick={() => setMessages([])}
              className="cursor-pointer p-1 text-white/30 hover:text-white/60"
              aria-label={t.agentClear}
              title={t.agentClear}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {messages.map((message, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
              key={index}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs whitespace-pre-wrap",
                  message.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-white/10 text-white",
                )}
              >
                {message.content ||
                  (loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={ask} className="px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t.askAgent}
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              input.trim() && !loading
                ? "cursor-pointer text-blue-400 hover:bg-blue-500/20"
                : "text-white/30",
            )}
            aria-label={t.askAgent}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function timeAgo(date: Date, t: UiText): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return t.secondsAgo(seconds);
  return t.minutesAgo(Math.floor(seconds / 60));
}
