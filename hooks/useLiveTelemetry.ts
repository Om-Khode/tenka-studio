"use client";

import { useEffect } from "react";
import { getRepos } from "@/services/repo-registry";
import { useSystemStore, selectTelemetryStale } from "@/store/system-store";
import type { TelemetrySnapshot } from "@/types/system";
import type { LoadStatus } from "@/types/action";

export interface LiveTelemetry {
  status: LoadStatus;
  data: TelemetrySnapshot | null;
  /**
   * The reading is still on screen but has stopped being refreshed. Callers
   * must visibly qualify it rather than drop it -- a five-minute-old CPU
   * figure is worth showing WITH its age, and worth nothing without.
   */
  stale: boolean;
  /** Epoch ms of that reading, for the "last seen" label. */
  at: number | null;
}

/** Refresh cadence for the polled snapshot. Slower than the daemon's own 2s
 * socket sampler on purpose: once hooks/useEventStream.ts is connected this
 * poll is the redundant half, kept only so a closed socket still leaves the
 * meters moving rather than frozen at whatever the last frame said. */
const POLL_MS = 5000;

/**
 * The HTTP half of telemetry (milestone 5b, Task 10). `GET /v1/telemetry` is
 * a snapshot, not a feed: this hook seeds the system-store slice with one and
 * keeps re-seeding it, while `telemetry` socket frames write the SAME slice
 * from the other side. Its callers read `{ status, data }` without knowing
 * which of the two produced the value -- which is the whole point of there
 * being one slice (see `SystemState.telemetry`'s own doc). Before that slice
 * existed this hook held the reading in local React state, which would have
 * left socket frames updating something no card was rendering.
 */
/**
 * One loop for the whole app, not one per mount.
 *
 * /app mounts this hook TWICE (LiveSystemMetersCard and LiveActiveModelCard
 * both read the same slice), and each mount used to run its own poll. That
 * doubled the request rate against the daemon's limiter, and -- worse -- made
 * `telemetryMisses` climb by 2 every 5s, so `TELEMETRY_STALE_AFTER_MISSES = 3`
 * fired at ~7.5s rather than the ~15s its own doc claims. The threshold's
 * meaning silently changed with the number of components rendering it, which is
 * not a threshold. Refcounted here so the cadence is a property of the app, not
 * of the current dashboard layout.
 */
let subscribers = 0;
let pollTimeout: ReturnType<typeof setTimeout> | null = null;
/**
 * Bumped on every start and every stop, so a fetch still in flight when the
 * last subscriber leaves cannot schedule the next tick into a loop a remount
 * has since started -- which would leave two loops running and put the cadence
 * straight back where it was.
 */
let generation = 0;

async function poll(gen: number): Promise<void> {
  if (useSystemStore.getState().telemetryStatus === "idle") {
    useSystemStore.setState({ telemetryStatus: "loading" });
  }
  // Captured BEFORE the await: this is when the reading was asked for, and it
  // is the only sequencing information that exists (TelemetryPayload carries no
  // timestamp, on either transport). A poll issued here and resolving three
  // seconds later must not overwrite a socket frame that arrived in between --
  // see setTelemetry's own doc in store/system-store.ts.
  const issuedAt = Date.now();
  try {
    const snapshot = await getRepos().system.getTelemetry();
    if (gen !== generation) return;
    useSystemStore.getState().setTelemetry(snapshot, issuedAt);
  } catch {
    // A transient failure keeps whatever the last good reading was -- from
    // either transport -- rather than blanking it; only a slice nothing has
    // ever written reaches the error branch. Each failure does count though,
    // and after TELEMETRY_STALE_AFTER_MISSES of them the slice reports itself
    // stale so the card stops presenting an old number as a current one.
    if (gen !== generation) return;
    useSystemStore.getState().markTelemetryUnavailable();
  } finally {
    if (gen === generation) pollTimeout = setTimeout(() => void poll(gen), POLL_MS);
  }
}

/** Test-only: drops the shared loop so one test's poll cannot outlive it. */
export function __resetTelemetryPollForTests(): void {
  subscribers = 0;
  generation += 1;
  if (pollTimeout !== null) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
}

export function useLiveTelemetry(): LiveTelemetry {
  const status = useSystemStore((s) => s.telemetryStatus);
  const data = useSystemStore((s) => s.telemetry);
  const stale = useSystemStore(selectTelemetryStale);
  const at = useSystemStore((s) => s.telemetryAt);

  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) {
      generation += 1;
      void poll(generation);
    }

    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        // Invalidates any in-flight fetch as well as the pending timer, so
        // nothing from the old loop can write or reschedule after this.
        generation += 1;
        if (pollTimeout !== null) {
          clearTimeout(pollTimeout);
          pollTimeout = null;
        }
      }
    };
  }, []);

  return { status, data, stale, at };
}
