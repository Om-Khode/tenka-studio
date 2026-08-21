"use client";

/**
 * Persistent while any ceiling raise is live: device, capabilities, transport
 * and time remaining, with a revoke control. Mounted once in app/app/layout.tsx
 * (see that file), so it renders above every route in the live tree -- spec
 * §3.6 exists because a 7-day window is not something to hold in your head,
 * and a banner that only showed on the settings page would defeat that the
 * moment a person navigated to Chat.
 *
 * Renders nothing for any session that cannot see a raise at all
 * (`useLiveRaises` fails closed on the loopback-admin precondition) -- which
 * is also every device paired over tailnet or funnel, since neither holds
 * `system_control` on the loopback listener. That is not a gap: those
 * sessions could not revoke anything anyway (spec §3.4, `require_admin`), and
 * showing a banner that names another device's raise to a session that
 * cannot act on it would be disclosure with no matching control.
 */
import { useLiveRaises, refreshLiveRaises, type RaiseRow } from "@/hooks/useLiveRaises";
import { useCountdown } from "@/hooks/useCountdown";
import { CAPABILITY_LABELS } from "@/lib/capability-labels";
import { isCapability } from "@/types/session";

function grantLabel(capability: string): string {
  return isCapability(capability) ? CAPABILITY_LABELS[capability].label : capability;
}

/** Seconds -> "Xd Yh" / "Xh Ym" / "Ym" -- the coarsest unit that still says
 * something, since a raise can span minutes or span a week (spec §3.3's
 * seven-day cap) and a banner showing days doesn't need minute precision. */
function formatRemaining(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * One row, one countdown. Split out of `RaiseBanner` itself because
 * `useCountdown` is a hook: `rows.map()` renders a variable number of these,
 * and calling a hook inside that loop directly (rather than once per mounted
 * component) would break the rules of hooks the moment the row count changed
 * between renders.
 *
 * Milestone 6b, live-test item 2: this used to render `row.expiresInSeconds`
 * straight off the last 30s poll, which is honest until the raise actually
 * lapses and then stays wrong for up to half a minute -- and on reload, wrong
 * forever, since nothing re-polled at all. The countdown below is local
 * display only; reaching zero asks the daemon again (`refreshLiveRaises()`)
 * rather than deciding the raise is gone, and until that answer lands this
 * row renders nothing rather than a claim ("0m left") that has already
 * outlived its own truth.
 */
function RaiseBannerRow({
  row,
  revoke,
}: {
  row: RaiseRow;
  /** Passed down from the single `useLiveRaises()` call in `RaiseBanner`,
   * rather than each row calling the hook itself -- that hook's subscriber
   * count IS the shared poll's refcount (this file's own doc), and one
   * subscriber per row would inflate it with every raise minted. */
  revoke: (deviceId: string) => Promise<void>;
}) {
  const remaining = useCountdown(row.expiresInSeconds, refreshLiveRaises);

  if (remaining === null || remaining <= 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="text-bone">
        <span className="font-mono uppercase tracking-wide text-amber">raised</span>{" "}
        {row.deviceLabel} can now use{" "}
        <span className="font-mono">{row.capabilities.map(grantLabel).join(", ")}</span> on{" "}
        <span className="font-mono">{row.transport}</span> -- {formatRemaining(remaining)} left
      </span>
      <button
        type="button"
        onClick={() => void revoke(row.deviceId)}
        className="font-mono text-[10px] uppercase tracking-wide text-bone-ghost hover:text-fail"
      >
        revoke
      </button>
    </div>
  );
}

export function RaiseBanner() {
  const { rows, revoke } = useLiveRaises();

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-amber/40 bg-amber/5 px-4 py-2 lg:px-8">
      {rows.map((row) => (
        <RaiseBannerRow key={`${row.deviceId}-${row.transport}`} row={row} revoke={revoke} />
      ))}
    </div>
  );
}
