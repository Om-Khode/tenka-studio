"use client";

/**
 * Every device holding a credential, and the one control this list offers:
 * revoke, behind the same confirm-dialog pattern as DangerZone and
 * EnrollmentPanel rather than a new one invented for this file.
 *
 * Two daemon behaviours this list has to make sense of rather than hide:
 *
 * - **Re-pairing the same phone creates a second live row with the same
 *   label.** The label is not unique -- `deviceId` and `createdAt` are --
 *   so each row is keyed on `deviceId` and shows its own pairing date,
 *   which is what actually tells two "Pixel 8" rows apart.
 * - **Revoking the last device locks Studio out** until the daemon
 *   restarts and reissues a bootstrap token. The confirm dialog says so
 *   only when this really is the last row -- a warning on every revoke
 *   would train a person to stop reading it.
 *
 * Milestone 6b adds the raise control: `device.raises` (empty unless a
 * ceiling is currently lifted for this device) is shown inline as a badge,
 * and a "raise" button opens RaiseDeviceDialog for rows that hold something
 * some transport could ever raise. `transports` is optional and defaults
 * empty -- a caller that has not fetched `GET /v1/transports` yet (or never
 * will) still gets a working revoke list, just with the raise button doing
 * nothing until transports are known (`raisableTransportsFor` inside the
 * dialog then reports no candidates, which is the honest answer). The
 * authoritative revoke-a-raise control lives on RaiseBanner, not here --
 * this row only mints.
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RaiseDeviceDialog } from "@/components/settings/RaiseDeviceDialog";
import { apiSend, ApiError } from "@/services/http";
import { useToastStore } from "@/store/toast-store";
import { useAuthStore } from "@/store/auth-store";
import { useCountdown } from "@/hooks/useCountdown";
import { CAPABILITY_LABELS } from "@/lib/capability-labels";
import { isCapability } from "@/types/session";
import { formatDate } from "@/lib/format";
import { useLoopbackAdminGate } from "@/hooks/useLoopbackAdminGate";
import type { components } from "@/types/api";

type DevicePayload = components["schemas"]["DevicePayload"];
type TransportPayload = components["schemas"]["TransportPayload"];
type RaisePayload = components["schemas"]["RaisePayload"];

/**
 * Item 3: which transport a device was paired over. `pairedOn` is now a real,
 * required (but nullable) field on the generated `DevicePayload` --
 * `types/api.d.ts` was regenerated from the daemon's own `openapi.json` once
 * its side of Milestone 6b landed, so this reads it straight off the wire
 * type rather than through a defensive local widening.
 *
 * `null` both means a genuinely unknown origin: a device paired before the
 * daemon recorded this at all. That must read as "unknown", never as
 * "local" (the common case, but not a safe default to guess) and never as
 * blank (which would look like a rendering bug rather than an honest gap).
 * The `??` below also covers a payload from a daemon build old enough to
 * omit the key outright, even though the current schema no longer allows it.
 */
function pairedOnLabel(device: DevicePayload): string {
  return device.pairedOn ?? "unknown transport";
}

/** Seconds -> "Xh Ym" (or "Ym" under an hour), rounded down to the minute --
 * this badge is informational, not the banner's own countdown, so a coarse
 * reading is honest about the precision this list actually has. */
function formatRemaining(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** The enum's short label where this build knows the capability, the raw
 * wire string otherwise -- a daemon that grows a seventh capability must
 * still render a readable (if unprettified) chip, not crash. */
function grantLabel(grant: string): string {
  return isCapability(grant) ? CAPABILITY_LABELS[grant].label : grant;
}

/**
 * One raise, one countdown. Split out for the same rules-of-hooks reason
 * `RaiseBannerRow` is (`components/settings/RaiseBanner.tsx`): a device can
 * hold a variable number of live raises, and `useCountdown` cannot live
 * inside the `.map()` that renders them directly.
 *
 * Milestone 6b, live-test item 2: reaching zero asks the daemon again rather
 * than assuming the raise is gone (nothing server-side happens on expiry, so
 * there is no `invalidate` frame for this one) -- `onExpire` is wired to the
 * SAME `GET /v1/devices` refetch `DevicesPanel` already owns, not a second
 * network call. Renders nothing once its own countdown reaches zero, rather
 * than a stale "0m left" that has already outlived its truth.
 */
function RaiseBadge({ raise, onExpire }: { raise: RaisePayload; onExpire: () => void }) {
  const remaining = useCountdown(raise.expiresInSeconds, onExpire);

  if (remaining === null || remaining <= 0) return null;

  return (
    <span className="font-mono text-[10px] text-amber">
      raised on {raise.transport}: {raise.capabilities.map(grantLabel).join(", ")} ·{" "}
      {formatRemaining(remaining)} left
    </span>
  );
}

export interface DeviceListProps {
  devices: DevicePayload[];
  /** `GET /v1/transports`'s rows, for the raise dialog's transport picker.
   * Defaults empty: a caller that has not fetched them yet still renders a
   * working revoke list, with the raise button correctly reporting no
   * transport this device could be raised on. */
  transports?: TransportPayload[];
  /** Called when any row's raise countdown reaches zero. Wired by the caller
   * to its own existing `GET /v1/devices` refetch (`DevicesPanel`'s `retry`)
   * -- see `RaiseBadge`'s own doc for why this must be a real refetch rather
   * than a decision made here. Optional and a no-op by default so this
   * component's own unit tests, which pass a fixed `devices` prop and never
   * refetch, need not supply one. */
  onRaiseMaybeExpired?: () => void;
}

export function DeviceList({ devices, transports = [], onRaiseMaybeExpired }: DeviceListProps) {
  const [localDevices, setLocalDevices] = useState(devices);
  const [pending, setPending] = useState<DevicePayload | null>(null);
  const [raising, setRaising] = useState<DevicePayload | null>(null);
  // Same gate as PairDeviceDialog, same shared message -- revoke is one of
  // the three routes refused off-loopback / without system_control, and a
  // person should read that here, on the button, not discover it from a 403
  // after clicking through the confirm dialog.
  // `message`, not the loopback constant: the gate has two halves, and a
  // person at the keyboard with an observe-only device needs to read the one
  // that is actually stopping them.
  const { refused, message } = useLoopbackAdminGate();
  // Milestone 6b, live-test items 3 & 4: which row is THIS connection's own
  // device. `session` (not `granted`/`effective`) is the one field that
  // names the caller rather than what the caller may do.
  const selfDeviceId = useAuthStore((s) => s.session?.deviceId);

  // Keeps this in step with a parent that refetches GET /v1/devices (e.g.
  // after this list revokes one), without this component owning that fetch
  // itself -- the test renders it with a fixed `devices` prop and nothing
  // else.
  useEffect(() => setLocalDevices(devices), [devices]);

  const isLastDevice = localDevices.length === 1;
  const revokingSelf = pending !== null && pending.deviceId === selfDeviceId;

  async function confirmRevoke() {
    if (!pending) return;
    const label = pending.label;
    try {
      await apiSend("DELETE", `/v1/devices/${pending.deviceId}`);
      setLocalDevices((ds) => ds.filter((d) => d.deviceId !== pending.deviceId));
      useToastStore.getState().push({ ok: true, title: `Revoked ${label}` });
    } catch (err) {
      const denied = err instanceof ApiError && err.status === 403;
      useToastStore.getState().push({
        ok: false,
        title: denied ? "This device may not do that" : "Could not revoke that device",
        detail: denied
          ? "Revoking a device needs system control, at the keyboard."
          : err instanceof Error
            ? err.message
            : undefined,
      });
    } finally {
      setPending(null);
    }
  }

  /** Appends the freshly minted raise to that device's row -- an optimistic
   * write, not a refetch, mirroring confirmRevoke's own local filter above.
   * The banner (a separate poll of GET /v1/devices) is the surface that
   * would otherwise disagree with this row until its next tick; this keeps
   * the row that just minted the raise honest immediately. */
  function applyRaise(raise: RaisePayload) {
    setLocalDevices((ds) =>
      ds.map((d) => (d.deviceId === raise.deviceId ? { ...d, raises: [...d.raises, raise] } : d)),
    );
    useToastStore.getState().push({
      ok: true,
      title: "Ceiling raised",
      detail: `${raise.transport} · ${formatRemaining(raise.expiresInSeconds)} remaining`,
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-widest text-bone-subtle">
        paired devices
      </h2>

      {refused && message && <p className="text-xs text-amber">{message}</p>}

      {localDevices.length === 0 ? (
        <p className="text-xs text-bone-ghost">No device has paired yet.</p>
      ) : (
        <ul className="flex flex-col">
          {localDevices.map((device) => (
            <li
              key={device.deviceId}
              className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-sm text-bone">
                  {device.label}
                  {device.deviceId === selfDeviceId && (
                    // Milestone 6b, live-test item 4: unlabelled, REVOKE here
                    // ends the operator's own session and takes
                    // `SYSTEM_CONTROL` with it -- worth a glance before the
                    // click reaches the confirm dialog at all.
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-bone-ghost">
                      (this device)
                    </span>
                  )}
                </span>
                <span className="font-mono text-[10px] text-bone-ghost">
                  {device.grants.map(grantLabel).join(", ")}
                </span>
                <span className="font-mono text-[10px] text-bone-ghost">
                  paired {formatDate(device.createdAt)} via{" "}
                  <span className={device.pairedOn == null ? "italic" : undefined}>
                    {pairedOnLabel(device)}
                  </span>{" "}
                  · last seen {device.lastSeenAt ? formatDate(device.lastSeenAt) : "never"}
                </span>
                {/* Milestone 6b: a live raise is a fact about THIS device that
                    a person managing it needs to see without leaving this row
                    -- the authoritative revoke lives on RaiseBanner, which
                    this badge is deliberately not a second copy of. */}
                {device.raises.map((raise) => (
                  <RaiseBadge
                    key={raise.transport}
                    raise={raise}
                    onExpire={() => onRaiseMaybeExpired?.()}
                  />
                ))}
              </span>
              <span className="flex shrink-0 items-center gap-3 self-start sm:self-center">
                {/* Milestone 6b, live-test item 3: a raise widens only the
                    transport it names, and this row's own device is already
                    on `local`, whose ceiling carries everything a raise
                    could ever add -- offering RAISE here is inert by
                    construction, not merely redundant. Suppressed on the
                    session's own `deviceId`, generically -- never on a
                    label. */}
                {device.deviceId !== selfDeviceId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={refused}
                    title={refused ? (message ?? undefined) : undefined}
                    onClick={() => setRaising(device)}
                    className="p-0 font-mono text-[10px] uppercase tracking-wide text-bone-ghost hover:text-amber disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-bone-ghost"
                  >
                    raise
                  </Button>
                )}
                <button
                  type="button"
                  disabled={refused}
                  title={refused ? (message ?? undefined) : undefined}
                  onClick={() => setPending(device)}
                  className="font-mono text-[10px] uppercase tracking-wide text-bone-ghost hover:text-fail disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-bone-ghost"
                >
                  revoke
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        destructive
        title={pending ? `Revoke ${pending.label}?` : ""}
        body={
          // Milestone 6b, live-test item 4: naming the consequence, not just
          // confirming the click. There is no self-revocation guard on the
          // daemon (`revoke_device` accepts any id) -- this dialog is the
          // only place that consequence gets said before it happens.
          revokingSelf
            ? "This ends your own session right now, and takes admin access with it. She prints a fresh token on restart, but until then Studio is locked out from here."
            : pending && isLastDevice
              ? "This is the only paired device. Revoking it locks Studio out until she restarts and reissues a bootstrap token."
              : "That device loses its credential immediately. It has to be paired again to reconnect."
        }
        confirmLabel="revoke"
        onConfirm={() => void confirmRevoke()}
      />

      {raising && (
        <RaiseDeviceDialog
          open={raising !== null}
          onOpenChange={(open) => !open && setRaising(null)}
          device={raising}
          transports={transports}
          onRaised={applyRaise}
        />
      )}
    </Card>
  );
}
