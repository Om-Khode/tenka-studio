"use client";

/**
 * Every ceiling raise live right now, for RaiseBanner (spec §3.6: "a 7-day
 * window is not something to hold in your head").
 *
 * There is no dedicated route for this and none is coming -- spec §3.4 is
 * explicit that no route enumerates raises on their own, so this is not
 * something a future task forgot to add. `GET /v1/devices` already carries
 * each device's live raises (`DevicePayload.raises`), and it is loopback +
 * `system_control` admin-gated exactly like minting one (`routes/devices.py`).
 * So this hook reads that route, the same one DevicesPanel already polls
 * once per mount, and flattens it into rows the banner can render without
 * knowing about devices at all.
 *
 * **Gated on the loopback-admin precondition, and fails closed on it.** A
 * non-admin or non-loopback session (a phone on the tailnet, a funnel guest)
 * gets an empty list and issues no request at all -- there is nothing to show
 * it anyway (it cannot see other devices' raises, by design), and firing a
 * request certain to 403 on every page of the live tree would be the same
 * mistake DevicesPanel's own doc already argues against.
 *
 * **Polled, not pushed.** Spec §3.6's own amendment: expiry is announced only
 * from read paths, and a raise that dies from a dropped tunnel or the kill
 * switch leaves no event at all. Client-side polling is the only clock this
 * banner has. The cadence is coarse (30s) rather than telemetry's 5s
 * (hooks/useLiveTelemetry.ts) because a raise's own window is minutes to
 * days, not seconds -- a 30-second-old countdown is still accurate to the
 * minute anywhere in that range, and every tick against this route is a real
 * admin-gated request across the whole live tree, not a dashboard card.
 *
 * One shared loop for however many components mount this (today, just
 * RaiseBanner, but the refcounted shape is `useLiveTelemetry`'s and this
 * mirrors it rather than inventing a second one), so a second mount cannot
 * double the request rate the way it once did there before that hook's own
 * fix.
 */
import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "@/services/http";
import { useLoopbackAdminGate } from "@/hooks/useLoopbackAdminGate";
import { useToastStore } from "@/store/toast-store";
import type { components } from "@/types/api";

type DevicePayload = components["schemas"]["DevicePayload"];

export interface RaiseRow {
  deviceId: string;
  deviceLabel: string;
  transport: string;
  capabilities: string[];
  expiresInSeconds: number;
  reason: string;
}

const POLL_MS = 30_000;

let subscribers = 0;
let pollTimeout: ReturnType<typeof setTimeout> | null = null;
let generation = 0;

/** Module-level rather than component state: the poll loop is shared, so its
 * result has to live somewhere every subscriber can read without owning the
 * fetch itself. A tiny hand-rolled subject rather than pulling in a store for
 * one array -- see the file's own doc on why this mirrors useLiveTelemetry's
 * refcounted shape rather than a zustand slice. */
let rows: RaiseRow[] = [];
const listeners = new Set<(rows: RaiseRow[]) => void>();

function publish(next: RaiseRow[]): void {
  rows = next;
  for (const listener of listeners) listener(next);
}

function toRows(devices: DevicePayload[]): RaiseRow[] {
  const out: RaiseRow[] = [];
  for (const device of devices) {
    for (const raise of device.raises) {
      out.push({
        deviceId: device.deviceId,
        deviceLabel: device.label,
        transport: raise.transport,
        capabilities: raise.capabilities,
        expiresInSeconds: raise.expiresInSeconds,
        reason: raise.reason,
      });
    }
  }
  return out;
}

async function poll(gen: number): Promise<void> {
  try {
    const result = await apiGet<{ devices: DevicePayload[] }>("/v1/devices");
    if (gen !== generation) return;
    publish(toRows(result.devices));
  } catch {
    // A transient miss keeps the last known rows on screen -- a banner that
    // vanishes because one poll dropped would read as "the raise ended",
    // which may well be false. Nothing to do here beyond leaving `rows` alone.
  } finally {
    if (gen === generation) pollTimeout = setTimeout(() => void poll(gen), POLL_MS);
  }
}

/**
 * Forces the next poll now rather than waiting out the rest of the 30s
 * cadence, then reschedules from this moment -- for a row whose local
 * countdown (`hooks/useCountdown.ts`) just reached zero. A raise's expiry is
 * announced by nothing (this file's own doc, and spec §3.6's amendment), so
 * a banner that only ever re-read on the fixed 30s tick could show a lapsed
 * raise for up to half a minute after its own countdown already said zero.
 * A no-op while nothing is subscribed -- there is no poll loop to nudge.
 */
export function refreshLiveRaises(): void {
  if (subscribers === 0) return;
  if (pollTimeout !== null) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
  void poll(generation);
}

/** Test-only: drops the shared loop so one test's poll cannot outlive it. */
export function __resetLiveRaisesForTests(): void {
  subscribers = 0;
  generation += 1;
  if (pollTimeout !== null) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
  rows = [];
}

export interface LiveRaises {
  rows: RaiseRow[];
  /** Drops every raise a device holds, on every transport it holds one on --
   * `DELETE /v1/devices/{id}/raise`, the same undo `revoke_device_raise`
   * documents. Optimistic: removes the rows locally rather than waiting for
   * the next poll, the same shape DeviceList's own revoke uses. */
  revoke: (deviceId: string) => Promise<void>;
}

export function useLiveRaises(): LiveRaises {
  const { known, refused } = useLoopbackAdminGate();
  const canSee = known && !refused;
  const [snapshot, setSnapshot] = useState<RaiseRow[]>(rows);

  useEffect(() => {
    if (!canSee) {
      setSnapshot([]);
      return;
    }
    const listener = (next: RaiseRow[]) => setSnapshot(next);
    listeners.add(listener);
    setSnapshot(rows);

    subscribers += 1;
    if (subscribers === 1) {
      generation += 1;
      void poll(generation);
    }

    return () => {
      listeners.delete(listener);
      subscribers -= 1;
      if (subscribers === 0) {
        generation += 1;
        if (pollTimeout !== null) {
          clearTimeout(pollTimeout);
          pollTimeout = null;
        }
        publish([]);
      }
    };
  }, [canSee]);

  async function revoke(deviceId: string): Promise<void> {
    try {
      await apiSend("DELETE", `/v1/devices/${deviceId}/raise`);
      publish(rows.filter((r) => r.deviceId !== deviceId));
    } catch (err) {
      const denied = err instanceof ApiError && err.status === 403;
      useToastStore.getState().push({
        ok: false,
        title: denied ? "This device may not do that" : "Could not revoke that raise",
        detail: denied
          ? "Revoking a raise needs system control, at the keyboard."
          : err instanceof Error
            ? err.message
            : undefined,
      });
    }
  }

  return { rows: snapshot, revoke };
}
