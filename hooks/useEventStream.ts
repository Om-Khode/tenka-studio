"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { eventSocketUrl } from "@/services/http";
import { revokeSession } from "@/services/token";
import { emitInvalidate, onInvalidate } from "@/lib/invalidate";
import { useAuthStore } from "@/store/auth-store";
import { useChatStore } from "@/store/chat-store";
import { useSystemStore } from "@/store/system-store";
import type { TelemetrySnapshot } from "@/types/system";

/**
 * One socket for the whole live tree (milestone 5b, Task 10).
 *
 * Not one `EventSource` per concern: `EventSource` cannot set an
 * Authorization header, aborting a turn needs a client-to-server direction,
 * and one socket is one reconnect story rather than five. The daemon's own
 * `assistant/io/api/events.py` opens with the same three reasons.
 *
 * Three frame types have a producer today. `telemetry` carries exactly
 * `GET /v1/telemetry`'s key set (the daemon builds both from
 * `telemetry_body()`), so it lands in the SAME system-store slice the polled
 * HTTP snapshot seeds -- one value, two sources, never two copies where the
 * card reads the stale one. `status` carries `phase`, `detail`,
 * `cursorFollows`, `step` and `tier`; there is no `task_step` frame and never
 * will be, and `toast` is reserved-and-unproduced, so nothing here waits on
 * either. `invalidate` (Milestone 6b) carries only `resource` -- no payload,
 * by design -- and is dispatched through `lib/invalidate.ts` rather than
 * acted on here directly, since `devices` and `transports` are refetched by
 * component-local state this hook has no reach into. `session` is the one
 * resource this hook CAN act on directly (`store/auth-store.ts` is a global
 * singleton), and does, below.
 */

/**
 * Backoff bounds. The first retry lands within half a second -- a daemon
 * restarted by hand should not leave the badge red for ten -- and a daemon
 * that is off for the afternoon is retried twice a minute rather than
 * hammered.
 */
const BASE_RETRY_MS = 500;
const MAX_RETRY_MS = 30_000;

/**
 * The two close codes the daemon chooses on purpose, verified in
 * `assistant/io/api/app.py`'s `/v1/events` handler (four `close()` calls, two
 * codes between them).
 *
 * 1008 is "not this device": a handshake carrying no credential the daemon
 * recognises, or one whose grants do not include `Capability.OBSERVE`
 * (`app.py:439`) -- the capability the live stream is gated on since 6a split
 * the old `CHAT` member into `observe` and `recall`, matching the
 * `require(Capability.OBSERVE)` on /v1/status and /v1/telemetry. The handler
 * closes before `accept()` in both cases. Neither becomes true by waiting, so retrying a
 * 1008 is an infinite loop that renders as "reconnecting" forever, which is
 * indistinguishable from a daemon that is simply switched off.
 *
 * 1013 is the shared rate-limit budget saying "later", which time alone
 * clears. It is NOT an auth failure and must keep retrying -- just not at the
 * speed that spent the budget.
 */
const WS_CLOSE_UNAUTHORIZED = 1008;
const WS_CLOSE_THROTTLED = 1013;

/**
 * Floor for the retry window after a 1013. Above the 500ms first step, well
 * under the 30s ceiling: a throttled client that came back in 250ms would
 * only spend the budget it is waiting on.
 */
const THROTTLED_MIN_RETRY_MS = 5_000;

/**
 * How long a terminal phase has to hold before a pending live turn is
 * settled. Not a cosmetic delay: `StatusPhase.IDLE` is published by
 * individual handlers as they finish their own step (six call sites in
 * `assistant/actions/da_handlers.py` alone), so the first IDLE after a send
 * is NOT reliably the turn's end -- another phase usually follows it and the
 * reply is persisted later still. A quiet window turns "she went idle" into
 * "she stayed idle", which is the only end-of-turn signal this wire actually
 * carries: no frame names a conversation or a turn id, so there is nothing
 * more precise to match on. Settling early would refetch a conversation that
 * does not yet contain her reply and unblock the composer over an empty
 * bubble.
 */
export const SETTLE_QUIET_MS = 600;

/**
 * The phases that can end a turn. `DONE` has no producer in `assistant/`
 * today and is matched anyway -- it is a declared member of
 * `status_broadcaster.StatusPhase`, so a handler gaining it later must not
 * silently strand every live turn as pending. Compared case-insensitively:
 * the broadcaster's own phases are upper-case (`IDLE`, `STOPPED`) while the
 * connect-time frame `app.py` synthesises uses a lower-case `"connected"`,
 * and this set should not depend on which of the two conventions a future
 * phase follows.
 */
const TERMINAL_PHASES = new Set(["IDLE", "DONE", "STOPPED"]);

/**
 * `throttled` and `unauthorized` are close-code states, not new lifecycles:
 * both used to arrive as an unlabelled `reconnecting`, so being rate-limited
 * and having a token she refuses both read as "the daemon went away".
 */
export type ConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "throttled"
  | "unauthorized"
  | "closed";

/** A `status` frame, after validation. `v` and `ts` are dropped: nothing
 * renders them, and the daemon sends `v: null` on the connect-time frame
 * anyway, so branching on it would only teach callers to expect a version
 * that is not always there. */
export interface StatusFrame {
  phase: string;
  detail: string;
  cursorFollows: boolean | null;
  /** `[n, total]`, or null when the phase is not a stepped one. */
  step: [number, number] | null;
  tier: string | null;
}

interface EventStreamState {
  connection: ConnectionState;
  /** The last `status` frame, whatever it said. Null before the first one. */
  activity: StatusFrame | null;
  setConnection: (connection: ConnectionState) => void;
  setActivity: (activity: StatusFrame) => void;
  reset: () => void;
}

/**
 * Lives here rather than in `store/`: this is the socket's own state, written
 * by exactly one owner (the effect below) and dead the moment that effect
 * unmounts. A slice under `store/` would advertise a domain other code may
 * write to, which this is not. Telemetry is the opposite case and lives in
 * `store/system-store.ts` precisely because it has two writers.
 */
export const useEventStreamStore = create<EventStreamState>()((set) => ({
  connection: "closed",
  activity: null,
  setConnection: (connection) => set({ connection }),
  setActivity: (activity) => set({ activity }),
  reset: () => set({ connection: "closed", activity: null }),
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Full jitter over the upper half of the capped delay. Without the jitter,
 * every tab open against a daemon that just went down retries in the same
 * millisecond, forever -- and the retry that matters (the one after the
 * daemon comes back) is the one they all collide on.
 *
 * Exported for its own test: the reconnect test can only observe that *a*
 * timer fired, not what shape the sequence has.
 */
export function retryDelay(attempt: number): number {
  const capped = Math.min(BASE_RETRY_MS * 2 ** attempt, MAX_RETRY_MS);
  return capped / 2 + Math.random() * (capped / 2);
}

function readStatusFrame(frame: Record<string, unknown>): StatusFrame | null {
  if (typeof frame.phase !== "string") return null;

  let step: [number, number] | null = null;
  if (Array.isArray(frame.step)) {
    if (
      frame.step.length !== 2 ||
      typeof frame.step[0] !== "number" ||
      typeof frame.step[1] !== "number"
    ) {
      return null;
    }
    step = [frame.step[0], frame.step[1]];
  } else if (frame.step !== null && frame.step !== undefined) {
    return null;
  }

  // `detail`/`cursorFollows`/`tier` are documented as "unknown -> null", so a
  // missing one is not a malformed frame -- only a present one of the wrong
  // type would be, and that degrades to the same absent value rather than
  // dropping a frame whose `phase` (the part anything acts on) is fine.
  return {
    phase: frame.phase,
    detail: typeof frame.detail === "string" ? frame.detail : "",
    cursorFollows: typeof frame.cursorFollows === "boolean" ? frame.cursorFollows : null,
    step,
    tier: typeof frame.tier === "string" ? frame.tier : null,
  };
}

/**
 * Every field is required on the wire (`TelemetryPayload`, `openapi.json`),
 * so a frame missing one is malformed and dropped whole. Filling a gap with
 * a zero would put a confident "0% CPU" on the dashboard -- the same lie
 * `batteryPercent: null` exists to avoid.
 */
function readTelemetryFrame(frame: Record<string, unknown>): TelemetrySnapshot | null {
  const { cpuPercent, ramPercent, batteryPercent, activeModel, uptimeSeconds } = frame;
  if (typeof cpuPercent !== "number" || typeof ramPercent !== "number") return null;
  if (batteryPercent !== null && typeof batteryPercent !== "number") return null;
  if (typeof activeModel !== "string" || typeof uptimeSeconds !== "number") return null;
  return { cpuPercent, ramPercent, batteryPercent, activeModel, uptimeSeconds };
}

/**
 * Opens the socket while `enabled`, and keeps it open across daemon
 * restarts. Mounted once, in `app/app/layout.tsx`, gated on the same
 * `authorized` flag that gates the shell -- connecting without a token would
 * just be a 1008 close and an immediate retry loop.
 */
export function useEventStream(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    // Reset on every successful open, so a daemon that drops once an hour
    // never accumulates its way to the 30s ceiling.
    let attempt = 0;

    // The one resource this hook can refetch itself: `store/auth-store.ts`
    // is a module singleton, so there is no component to reach into the way
    // `devices` and `transports` need `lib/invalidate.ts`'s subscribers for.
    // `probe()` re-runs `GET /v1/session`, which is what drives both the
    // capability view and the raise countdown's own source of truth.
    const unsubscribeSessionInvalidate = onInvalidate("session", () => {
      void useAuthStore.getState().probe();
    });

    function handleStatus(frame: StatusFrame): void {
      useEventStreamStore.getState().setActivity(frame);

      // Any new phase re-opens the question of whether she is finished, so a
      // pending settle is cancelled first -- including by another terminal
      // phase, which re-arms below with a fresh window.
      clearTimeout(settleTimer);
      if (!TERMINAL_PHASES.has(frame.phase.toUpperCase())) return;

      const liveTurn = useChatStore.getState().liveTurn;
      if (!liveTurn) return;
      // The TURN's id, not the conversation's. This timer lives in the
      // effect's closure, so nothing outside this hook can clear it: stopping
      // a turn inside the quiet window and sending again leaves it armed, and
      // it then fires against the turn AFTER the one it was armed for. Live
      // mode has one pane, so `conversationId` -- what this used to capture --
      // is the same string for every turn ever sent and let that through.
      const { turnId } = liveTurn;
      settleTimer = setTimeout(() => {
        // The store re-checks that this turn is still the pending one, so a
        // turn that was stopped, superseded, or never the one this window
        // belonged to is a no-op rather than a stray refetch.
        void useChatStore.getState().settleLiveTurn(turnId);
      }, SETTLE_QUIET_MS);
    }

    function handleFrame(data: unknown): void {
      // Binary frames are not part of this contract; nothing sends one.
      if (typeof data !== "string") return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return; // Malformed: dropped, socket untouched.
      }
      if (!isRecord(parsed)) return;

      if (parsed.type === "telemetry") {
        const snapshot = readTelemetryFrame(parsed);
        if (snapshot) useSystemStore.getState().setTelemetry(snapshot);
        return;
      }
      if (parsed.type === "status") {
        const frame = readStatusFrame(parsed);
        if (frame) handleStatus(frame);
        return;
      }
      if (parsed.type === "invalidate") {
        // No payload to validate beyond the resource name itself -- the
        // daemon's contract is deliberately these three fields and nothing
        // else. An unrecognised (or malformed) resource is dropped by
        // emitInvalidate() itself, not here, so this branch can never throw.
        if (typeof parsed.resource === "string") emitInvalidate(parsed.resource);
        return;
      }

      // Unknown type: ignored on purpose. The daemon already emits `error`
      // and `ack` frames this client has no use for, and it may learn more
      // before Studio is redeployed. Closing the socket over one unread
      // message would cost every other live pane its feed.
    }

    function scheduleReconnect(
      state: ConnectionState = "reconnecting",
      minDelayMs = 0,
    ): void {
      if (disposed) return;
      useEventStreamStore.getState().setConnection(state);
      const delay = Math.max(retryDelay(attempt), minDelayMs);
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    }

    function connect(): void {
      if (disposed) return;
      useEventStreamStore
        .getState()
        .setConnection(attempt === 0 ? "connecting" : "reconnecting");

      let opening: WebSocket;
      try {
        // No credential in this url, and none this hook could add: the
        // httpOnly cookie rides the handshake on its own (6a Task 13 deleted
        // the `?access_token=` the daemon had already stopped reading).
        opening = new WebSocket(eventSocketUrl());
      } catch {
        // Only a malformed url reaches here; a refused connection surfaces
        // through onclose instead. Retried either way rather than left dead,
        // since the url is rebuilt from scratch on every attempt.
        scheduleReconnect();
        return;
      }

      socket = opening;
      opening.onopen = () => {
        attempt = 0;
        useEventStreamStore.getState().setConnection("open");
      };
      opening.onmessage = (event: MessageEvent) => handleFrame(event.data);
      // A close always follows an error, so the reconnect is scheduled from
      // one place. Nothing is logged here for the reason above.
      opening.onerror = () => {};
      // `event?.code`, not `event.code`: a close event is guaranteed by the
      // browser but not by every WebSocket stand-in, and one that arrives
      // without it must degrade to the unlabelled retry this handler always
      // did -- not to a TypeError that takes the reconnect loop down with it.
      opening.onclose = (event: CloseEvent) => {
        if (disposed) return;
        socket = null;

        // She refused this device, not this connection. Retrying cannot fix
        // a credential she does not recognise or one whose grants never
        // carried OBSERVE, so the loop stops here and the session is
        // revoked -- which wakes the shell's listener and puts the user on the
        // connect screen instead of in front of five panes that each report
        // their own failure.
        if (event?.code === WS_CLOSE_UNAUTHORIZED) {
          // Every other exit from this effect clears the settle timer; this one
          // must too. It currently survives only because revokeSession() wakes
          // the shell synchronously and the resulting cleanup lands well inside
          // SETTLE_QUIET_MS -- true of today's single caller, not of the hook.
          // A caller that does not subscribe to onSessionRevoked would fire a
          // settle against the credential just cleared and toast "Lost her
          // reply" for a reply that exists.
          clearTimeout(settleTimer);
          useEventStreamStore.getState().setConnection("unauthorized");
          revokeSession();
          return;
        }

        // Throttling is temporary and is NOT an auth failure -- retried, but
        // no faster than the floor, and named so the badge stops reporting a
        // rate limit as a daemon that went away.
        if (event?.code === WS_CLOSE_THROTTLED) {
          scheduleReconnect("throttled", THROTTLED_MIN_RETRY_MS);
          return;
        }

        scheduleReconnect();
      };
    }

    connect();

    return () => {
      disposed = true;
      unsubscribeSessionInvalidate();
      clearTimeout(retryTimer);
      clearTimeout(settleTimer);
      if (socket) {
        // Detached before closing: our own teardown must not look like the
        // daemon dropping and schedule a reconnect against an unmounted tree.
        socket.onclose = null;
        socket.close();
        socket = null;
      }
      useEventStreamStore.getState().reset();
    };
  }, [enabled]);
}
