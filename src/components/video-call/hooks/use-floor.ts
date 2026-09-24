"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DailyCall } from "@daily-co/daily-js";
import { useDailyEvent } from "@daily-co/daily-react";

// Floor control ("trava de fala"): only one person speaks at a time.
// Whoever clicks "Falar" gets the floor and everyone else's mic is closed
// until they click "Terminei" (or stay silent for a while).
//
// There is no server in the middle: every browser keeps its own copy of
// the state and they stay in sync through Daily app messages. The sender of
// a message is taken from Daily (fromId), never from the message itself.

const MESSAGE_KIND = "r16-floor";

export interface FloorHolder {
  sessionId: string;
  name: string;
  // When they took the floor; the earliest wins if two click at once
  since: number;
}

type FloorMessage =
  | { kind: typeof MESSAGE_KIND; type: "take"; name: string; since: number }
  | { kind: typeof MESSAGE_KIND; type: "release" }
  | { kind: typeof MESSAGE_KIND; type: "mode"; enabled: boolean }
  | { kind: typeof MESSAGE_KIND; type: "hello" }
  | {
      kind: typeof MESSAGE_KIND;
      type: "state";
      enabled: boolean;
      holder: FloorHolder | null;
    };

// Omit that keeps each variant of the union intact
type Outgoing<T> = T extends unknown ? Omit<T, "kind"> : never;

function isFloorMessage(data: unknown): data is FloorMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { kind?: unknown }).kind === MESSAGE_KIND
  );
}

// Who wins when two people claim the floor at the same moment
function wins(a: FloorHolder, b: FloorHolder): boolean {
  return (
    a.since < b.since || (a.since === b.since && a.sessionId < b.sessionId)
  );
}

interface UseFloorOptions {
  daily: DailyCall | null;
  // Turned on by default in translated meetings
  enabledByDefault: boolean;
  myName: string;
  // False until the call is joined (app messages need a joined call)
  ready: boolean;
}

export function useFloor({
  daily,
  enabledByDefault,
  myName,
  ready,
}: UseFloorOptions) {
  const [floorMode, setFloorModeState] = useState(enabledByDefault);
  const [holder, setHolder] = useState<FloorHolder | null>(null);
  const holderRef = useRef<FloorHolder | null>(null);
  const floorModeRef = useRef(enabledByDefault);

  const mySessionId = daily?.participants().local?.session_id ?? null;
  const iHold = Boolean(mySessionId && holder?.sessionId === mySessionId);

  const updateHolder = useCallback((next: FloorHolder | null) => {
    holderRef.current = next;
    setHolder(next);
  }, []);

  const send = useCallback(
    (message: Outgoing<FloorMessage>, to = "*") => {
      if (!daily || !ready) return;
      daily.sendAppMessage({ kind: MESSAGE_KIND, ...message }, to);
    },
    [daily, ready],
  );

  const take = useCallback(() => {
    const sessionId = daily?.participants().local?.session_id;
    if (!sessionId || !floorModeRef.current) return;
    // Someone else is talking: wait for them to finish
    if (holderRef.current && holderRef.current.sessionId !== sessionId) return;

    const mine = { sessionId, name: myName, since: Date.now() };
    updateHolder(mine);
    send({ type: "take", name: mine.name, since: mine.since });
  }, [daily, myName, send, updateHolder]);

  const release = useCallback(() => {
    const sessionId = daily?.participants().local?.session_id;
    if (!sessionId || holderRef.current?.sessionId !== sessionId) return;
    updateHolder(null);
    send({ type: "release" });
  }, [daily, send, updateHolder]);

  // Team members can turn the lock off (and back on) for everyone
  const setFloorMode = useCallback(
    (enabled: boolean) => {
      floorModeRef.current = enabled;
      setFloorModeState(enabled);
      if (!enabled) updateHolder(null);
      send({ type: "mode", enabled });
    },
    [send, updateHolder],
  );

  useDailyEvent(
    "app-message",
    useCallback(
      (event) => {
        if (!event || !isFloorMessage(event.data)) return;
        const message = event.data;
        const from = event.fromId;
        const current = holderRef.current;
        const mine = daily?.participants().local?.session_id;

        switch (message.type) {
          case "take": {
            if (typeof message.since !== "number") return;
            const claim: FloorHolder = {
              sessionId: from,
              name: String(message.name ?? "").slice(0, 60),
              since: message.since,
            };
            // I was already speaking and clicked first: tell them again
            if (current && current.sessionId === mine && wins(current, claim)) {
              send({ type: "take", name: current.name, since: current.since });
              return;
            }
            if (
              !current ||
              current.sessionId === from ||
              wins(claim, current)
            ) {
              updateHolder(claim);
            }
            break;
          }
          case "release":
            if (current?.sessionId === from) updateHolder(null);
            break;
          case "mode":
            floorModeRef.current = Boolean(message.enabled);
            setFloorModeState(floorModeRef.current);
            if (!floorModeRef.current) updateHolder(null);
            break;
          case "hello":
            // Someone just joined: tell them how things stand
            send(
              {
                type: "state",
                enabled: floorModeRef.current,
                holder: current,
              },
              from,
            );
            break;
          case "state": {
            floorModeRef.current = Boolean(message.enabled);
            setFloorModeState(floorModeRef.current);
            const theirs = message.holder;
            const stillHere =
              theirs && daily?.participants()[theirs.sessionId] !== undefined;
            if (theirs && stillHere && !current) updateHolder(theirs);
            break;
          }
        }
      },
      [daily, send, updateHolder],
    ),
  );

  // Whoever holds the floor leaving must not lock everyone else out
  useDailyEvent(
    "participant-left",
    useCallback(
      (event) => {
        const left = event?.participant?.session_id;
        if (left && holderRef.current?.sessionId === left) updateHolder(null);
      },
      [updateHolder],
    ),
  );

  // Ask the people already in the call for the current state
  useEffect(() => {
    if (ready) send({ type: "hello" });
  }, [ready, send]);

  return { floorMode, holder, iHold, take, release, setFloorMode };
}
