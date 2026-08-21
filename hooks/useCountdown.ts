"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A locally-ticking "seconds remaining" reading for a raise, per Milestone
 * 6b's live-test item 2: nothing happens server-side when a raise expires --
 * the store simply stops returning it, so there is no event the daemon could
 * emit and no `invalidate` frame to wait for (`lib/invalidate.ts` is the
 * server-announced half of refetching; this is the other half, for the one
 * change that announces nothing).
 *
 * `seconds` is the daemon's own answer -- `GET /v1/session`'s
 * `raiseExpiresInSeconds`, or a `RaisePayload`'s own `expiresInSeconds` --
 * recomputed fresh from a monotonic clock on every read, so it never drifts.
 * This hook never invents a fresher one: it only counts the LAST answer down,
 * locally, for display, and calls `onExpire` exactly once when it reaches
 * zero. `onExpire` must be a real refetch -- the daemon is still the only
 * authority on whether the raise is actually live, a dropped tunnel or the
 * kill switch can end one early with nothing to show for it, and a caller
 * that decided "reached zero" meant "gone" without asking again would be
 * wrong exactly that way.
 *
 * Resets to a fresh `seconds` whenever the caller passes one -- the refetch
 * `onExpire` triggered, an unrelated poll, or an `invalidate` frame landing --
 * and re-arms for the next expiry.
 */
export function useCountdown(seconds: number | null, onExpire: () => void): number | null {
  const [remaining, setRemaining] = useState(seconds);
  // Guards against firing onExpire more than once for the same `seconds`
  // value -- the effect below re-runs every tick, but only the tick that
  // first reaches <= 0 is the expiry.
  const firedRef = useRef(false);
  // Read at call time, not captured at mount: callers pass an inline arrow
  // that closes over their own latest state (e.g. a retry counter), and this
  // hook must not hold a stale one across renders the way a plain closure
  // over the constructor argument would.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    firedRef.current = false;
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        onExpireRef.current();
      }
      return;
    }
    const timer = setTimeout(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  return remaining;
}
