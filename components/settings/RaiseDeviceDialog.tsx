"use client";

/**
 * Lifts one device's ceiling on one transport, for a while: `POST
 * /v1/devices/{id}/raise`. Opened from a row in DeviceList, never standalone
 * -- it needs that row's own `DevicePayload` to know what this device holds
 * and `GET /v1/transports`'s response to know what each transport may ever
 * carry under a raise.
 *
 * Three narrowings this dialog enforces on top of what the daemon enforces
 * anyway, so a person sees the real boundary rather than discovering it from
 * a 403/409 after submitting (the same argument PairDeviceDialog's own doc
 * makes about its checkboxes):
 *
 * 1. **The transport picker only offers a transport with a non-empty
 *    `raisable` that also intersects this device's own `grants`.** Spec
 *    §3.1: a raise cannot manufacture a grant, and `policy.py` spells
 *    `raisable` out as an explicit literal per transport -- `tailnet` today,
 *    nothing else, and this dialog reads that from the wire rather than
 *    assuming which name it is.
 * 2. **The capability checkboxes are `raisable ∩ grants` for the CHOSEN
 *    transport**, recomputed on every change -- ticking a transport whose
 *    raisable set does not include a capability this device holds must not
 *    leave that box looking selectable.
 * 3. **A transport that is not currently running is shown, not hidden**
 *    (the operator may want to start it first), but disables submission
 *    with a reason -- the daemon's own 409 for the same precondition
 *    (spec §3.4), surfaced before the click rather than after it.
 *
 * `minutes` is bounded below only, echoing `RaiseRequest`'s own shape: the
 * upper bound is the daemon's seven-day clamp, not a client-side refusal, so
 * this dialog states the cap as a hint rather than enforcing a second copy of
 * it that could drift from `RaiseStore.grant()`.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";
import { apiSend, ApiError } from "@/services/http";
import { CAPABILITY_LABELS } from "@/lib/capability-labels";
import { isCapability } from "@/types/session";
import type { components } from "@/types/api";

type DevicePayload = components["schemas"]["DevicePayload"];
type TransportPayload = components["schemas"]["TransportPayload"];
type RaisePayload = components["schemas"]["RaisePayload"];

const DEFAULT_MINUTES = 60;
/** Spec §3.3's hard cap, stated here only as a hint -- the daemon clamps to
 * it rather than refusing a longer request, and this dialog must not carry a
 * second copy of the number that could drift from RaiseStore.grant()'s. */
const SEVEN_DAYS_HINT = "7 days";

function grantLabel(capability: string): string {
  return isCapability(capability) ? CAPABILITY_LABELS[capability].label : capability;
}

/** The transports this device's own grants could ever be raised on, in
 * principle -- independent of whether any of them happen to be running right
 * now. Empty on a device holding nothing any transport's `raisable` names, or
 * when every transport's `raisable` is empty (funnel and local by
 * construction -- see policy.py). */
function raisableTransportsFor(device: DevicePayload, transports: TransportPayload[]): TransportPayload[] {
  const grants = new Set(device.grants);
  return transports.filter((t) => t.raisable.length > 0 && t.raisable.some((c) => grants.has(c)));
}

export interface RaiseDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: DevicePayload;
  transports: TransportPayload[];
  onRaised: (raise: RaisePayload) => void;
}

export function RaiseDeviceDialog({
  open,
  onOpenChange,
  device,
  transports,
  onRaised,
}: RaiseDeviceDialogProps) {
  const candidates = raisableTransportsFor(device, transports);

  const [transportName, setTransportName] = useState(candidates[0]?.name ?? "");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [reason, setReason] = useState("");
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed every time this opens for a (possibly different) device/candidate
  // set, rather than carrying the previous row's picks into this one.
  useEffect(() => {
    if (!open) return;
    setTransportName(candidates[0]?.name ?? "");
    setSelected({});
    setMinutes(DEFAULT_MINUTES);
    setReason("");
    setError(null);
    // candidates is derived fresh from props every render; keying on the
    // device id and the transport count is enough to catch "opened again".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, device.deviceId]);

  const transport = transports.find((t) => t.name === transportName);
  const grants = new Set(device.grants);
  const raisableHere = transport ? transport.raisable.filter((c) => grants.has(c)) : [];
  const anySelected = raisableHere.some((c) => selected[c]);
  const running = transport?.running ?? false;

  async function submit() {
    if (!transport) return;
    setMinting(true);
    setError(null);
    try {
      const capabilities = raisableHere.filter((c) => selected[c]);
      const raise = await apiSend<RaisePayload>("POST", `/v1/devices/${device.deviceId}/raise`, {
        transport: transport.name,
        capabilities,
        minutes,
        reason,
      });
      onRaised(raise);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("This device may not carry that on this transport, or was never issued it.");
      } else if (err instanceof ApiError && err.status === 409) {
        setError("That transport is not running.");
      } else if (err instanceof ApiError && err.status === 404) {
        setError("That device is gone.");
      } else {
        setError(err instanceof Error ? err.message : "Could not raise that ceiling.");
      }
    } finally {
      setMinting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="font-display text-lg font-bold text-bone">
          Raise {device.label}&apos;s ceiling
        </DialogTitle>

        {candidates.length === 0 ? (
          <p className="mt-2 text-sm text-bone-dim">
            No transport can ever carry more for this device. Either it holds nothing any
            transport is vetted to raise, or every transport it could be raised on is unraisable
            by design (a public tunnel stays capped no matter what this device holds).
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-bone-ghost">
                transport
              </span>
              <Select
                label="Transport to raise on"
                value={transportName}
                onValueChange={setTransportName}
                options={candidates.map((t) => ({ value: t.name, label: t.name }))}
              />
              {!running && (
                <p className="text-xs text-amber">
                  This transport is not running. Start it on the Transports screen first.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-bone-ghost">
                capabilities to raise
              </span>
              <ul className="flex flex-col gap-1.5">
                {raisableHere.map((cap) => (
                  <li key={cap} className="flex items-center gap-2">
                    <input
                      id={`raise-${cap}`}
                      type="checkbox"
                      checked={Boolean(selected[cap])}
                      onChange={(e) => setSelected((s) => ({ ...s, [cap]: e.target.checked }))}
                    />
                    <label htmlFor={`raise-${cap}`} className="text-xs text-bone">
                      {grantLabel(cap)}
                    </label>
                  </li>
                ))}
                {raisableHere.length === 0 && (
                  <li className="text-xs text-bone-ghost">
                    This device holds none of what that transport may ever raise.
                  </li>
                )}
              </ul>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="raise-minutes"
                className="font-mono text-[10px] uppercase tracking-widest text-bone-ghost"
              >
                minutes (capped at {SEVEN_DAYS_HINT})
              </label>
              <input
                id="raise-minutes"
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
                className="w-32 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm text-bone focus:border-border-strong focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="raise-reason"
                className="font-mono text-[10px] uppercase tracking-widest text-bone-ghost"
              >
                reason
              </label>
              <input
                id="raise-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="why, so a week from now this still makes sense"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-bone focus:border-border-strong focus:outline-none"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-fail">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            cancel
          </Button>
          {candidates.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              disabled={!transport || !running || !anySelected || !reason.trim() || minting}
              onClick={() => void submit()}
            >
              {minting ? "raising…" : "raise"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
