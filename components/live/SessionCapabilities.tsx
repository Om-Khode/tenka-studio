"use client";

/**
 * What THIS session may do, and why -- the three-state distinction
 * `SessionPayload`'s own docstring argues for (issued / effective / raised),
 * rendered somewhere every paired device can see regardless of which
 * transport it is on.
 *
 * This is the missing surface a fix round caught: `types/session.ts` and
 * `services/http.ts` already carried `raised`/`raiseExpiresInSeconds` off the
 * wire, but nothing rendered them. `GET /v1/session` is deliberately NOT
 * admin-gated (Task 11) -- any paired device, on any transport, can read its
 * own state -- and that is exactly what makes this component necessary
 * rather than redundant with RaiseBanner: the banner polls admin-only
 * `GET /v1/devices` and correctly cannot see anything off the loopback
 * listener, so a device raised over tailnet had no way to see that it was
 * raised at all. This component needs no extra network call -- the session
 * probe already ran (`store/auth-store.ts`) -- so it costs nothing to mount
 * everywhere.
 *
 * Opened from a small Topbar button rather than shown inline in the bar
 * itself: seven rows do not fit beside the connection badge and the
 * reconnect link, and this is read occasionally ("am I raised right now?"),
 * not glanced at on every render the way the connection badge is.
 *
 * Reuses `lib/refusal.ts`'s `capabilityState()` -- the single place session
 * state already becomes rendered copy -- rather than a second, parallel
 * three-state mapping living in this file.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/store/auth-store";
import { CAPABILITIES } from "@/types/session";
import { CAPABILITY_LABELS } from "@/lib/capability-labels";
import { capabilityState } from "@/lib/refusal";
import { cn } from "@/lib/utils";

/** One row's tone and label -- the whole reason this exists as a small table
 * rather than three prose paragraphs: a person scanning it needs to tell
 * "granted" from "raised" from "refused" at a glance, not read every line. */
const TONE: Record<ReturnType<typeof capabilityState>["kind"], string> = {
  granted: "text-bone-dim",
  raised: "text-amber",
  refused: "text-bone-ghost",
};

const STATUS_WORD: Record<ReturnType<typeof capabilityState>["kind"], string> = {
  granted: "granted",
  raised: "raised",
  refused: "refused",
};

export function SessionCapabilities() {
  const [open, setOpen] = useState(false);
  const session = useAuthStore((s) => s.session);

  // Nothing to show without a session -- the demo tree never probes, and the
  // live tree's own gate (app/app/layout.tsx) never renders past `unknown`.
  if (!session) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Milestone 6b fix round 3, live-test item 5: this button used to
        // inherit its font size from Topbar's own wrapping `<div>` (`font-mono
        // text-[11px] uppercase tracking-wide`, Topbar's cluster around
        // ConnectionBadge/reconnect) before fix round 2 moved it here, next to
        // a `text-[10px]` heading with no such wrapper. The move carried the
        // border/padding but not the ambient text-size classes, so it fell
        // back to the page's default body size -- visibly larger than every
        // other control at this level, on both viewports (neither class below
        // is breakpoint-scoped). Restated explicitly here rather than relying
        // on whatever happens to wrap it next.
        className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-bone-subtle transition-colors hover:border-border-strong hover:text-bone"
      >
        capabilities
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="font-display text-lg font-bold text-bone">
            What this device may do
          </DialogTitle>
          <ul className="mt-3 flex flex-col gap-2">
            {CAPABILITIES.map((cap) => {
              const state = capabilityState(session, cap);
              const copy = CAPABILITY_LABELS[cap];
              return (
                <li key={cap} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs uppercase tracking-wide text-bone">
                      {copy.label}
                    </span>
                    <span
                      className={cn("font-mono text-[10px] uppercase tracking-wide", TONE[state.kind])}
                    >
                      {STATUS_WORD[state.kind]}
                    </span>
                  </div>
                  {state.kind !== "granted" && (
                    <p className="text-xs text-bone-dim">{state.message}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
