"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DailyCall } from "@daily-co/daily-js";
import { useDailyEvent, useRecording } from "@daily-co/daily-react";

// Recording the meeting (team starts it, everyone is told):
// - in the cloud (Daily): video and original voices, kept by Daily and
//   downloaded from /custos. Started/stopped through our server.
// - on this computer: records this tab as you see and hear it (captions and
//   translated voice included) plus your microphone, and saves a .webm
//   file when it stops. Chrome/Edge on a computer.

const MESSAGE_KIND = "r16-recording";

interface RecordingMessage {
  kind: typeof MESSAGE_KIND;
  recording: boolean;
  name: string;
}

function isRecordingMessage(data: unknown): data is RecordingMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { kind?: unknown }).kind === MESSAGE_KIND
  );
}

export function canRecordLocally() {
  return (
    typeof window !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

function pickMimeType() {
  for (const type of [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

interface UseMeetingRecordingOptions {
  daily: DailyCall | null;
  ready: boolean;
  roomId: string;
  myName: string;
}

export function useMeetingRecording({
  daily,
  ready,
  roomId,
  myName,
}: UseMeetingRecordingOptions) {
  const cloud = useRecording();
  const [cloudBusy, setCloudBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localRecording, setLocalRecording] = useState(false);
  // Others recording on their computer, by Daily session id -> name
  const [othersLocal, setOthersLocal] = useState<Record<string, string>>({});
  const localRef = useRef<{
    recorder: MediaRecorder;
    stop: () => void;
  } | null>(null);

  const announce = useCallback(
    (recording: boolean, to = "*") => {
      if (!daily || !ready) return;
      daily.sendAppMessage({ kind: MESSAGE_KIND, recording, name: myName }, to);
    },
    [daily, ready, myName],
  );

  const cloudRequest = useCallback(
    async (action: "start" | "stop") => {
      setCloudBusy(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(roomId)}/recording`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Não foi possível falar com o Daily");
        }
      } catch {
        setError("Não foi possível falar com o Daily");
      } finally {
        setCloudBusy(false);
      }
    },
    [roomId],
  );

  const stopLocal = useCallback(() => {
    localRef.current?.stop();
  }, []);

  const startLocal = useCallback(async () => {
    if (!daily || localRef.current) return;
    setError(null);
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: true,
        // Chrome: offer this tab first and keep its sound
        preferCurrentTab: true,
        selfBrowserSurface: "include",
      } as DisplayMediaStreamOptions);
    } catch {
      // Cancelled in the browser's picker
      return;
    }

    // The tab's sound (everyone + translated voice) and your microphone
    const context = new AudioContext();
    const mix = context.createMediaStreamDestination();
    if (display.getAudioTracks().length > 0) {
      context
        .createMediaStreamSource(new MediaStream(display.getAudioTracks()))
        .connect(mix);
    }
    const mic = daily.participants().local?.tracks.audio.persistentTrack;
    if (mic) {
      context.createMediaStreamSource(new MediaStream([mic])).connect(mix);
    }

    const stream = new MediaStream([
      ...display.getVideoTracks(),
      ...mix.stream.getAudioTracks(),
    ]);
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      for (const track of display.getTracks()) track.stop();
      context.close().catch(() => {});
      const blob = new Blob(chunks, { type: mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(":", "h");
      link.href = url;
      link.download = `reuniao-${roomId}-${stamp}.webm`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      localRef.current = null;
      setLocalRecording(false);
      announce(false);
    };
    const stop = () => {
      if (recorder.state !== "inactive") recorder.stop();
    };
    // Stopped from the browser's own "Stop sharing" bar
    display.getVideoTracks()[0]?.addEventListener("ended", stop);

    localRef.current = { recorder, stop };
    recorder.start(1000);
    setLocalRecording(true);
    announce(true);
  }, [daily, roomId, announce]);

  // Others starting/stopping a recording on their computer
  useDailyEvent(
    "app-message",
    useCallback((event) => {
      if (!event || !isRecordingMessage(event.data)) return;
      const { recording, name } = event.data;
      const from = event.fromId;
      setOthersLocal((current) => {
        const next = { ...current };
        if (recording) next[from] = String(name ?? "").slice(0, 60);
        else delete next[from];
        return next;
      });
    }, []),
  );

  // Someone joined: tell them you are recording; someone left: forget them
  useDailyEvent(
    "participant-joined",
    useCallback(
      (event) => {
        const id = event?.participant?.session_id;
        if (id && localRef.current) announce(true, id);
      },
      [announce],
    ),
  );
  useDailyEvent(
    "participant-left",
    useCallback((event) => {
      const id = event?.participant?.session_id;
      if (!id) return;
      setOthersLocal((current) => {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    }, []),
  );

  // Leaving the call ends a recording on this computer (and saves it)
  useEffect(() => {
    return () => localRef.current?.stop();
  }, []);

  return {
    cloudRecording: cloud.isRecording,
    cloudBusy,
    startCloud: () => cloudRequest("start"),
    stopCloud: () => cloudRequest("stop"),
    localRecording,
    startLocal,
    stopLocal,
    othersRecordingLocally: Object.values(othersLocal),
    error,
    clearError: () => setError(null),
  };
}
