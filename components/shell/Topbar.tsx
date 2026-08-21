"use client";

import Link from "next/link";
import { useDemoStore } from "@/store/demo-engine";
import { ConnectionBadge } from "@/components/live/ConnectionBadge";
import { cn } from "@/lib/utils";
import type { RepoMode } from "@/services/repo-registry";

/**
 * `mode` is a prop (Milestone 5b Task 9), not a hardcoded "demo mode" label
 * -- app/demo/layout.tsx passes "demo", app/app/layout.tsx passes "live".
 *
 * The mode badge is where connection state belongs in the live tree (Task
 * 10), so live renders ConnectionBadge in its place rather than a static
 * "live mode" label that stays green while the daemon is gone. Demo has no
 * connection to report and keeps the plain badge.
 *
 * The ESC-hold abort button targets demo-engine's own scripted task slot,
 * which has no live counterpart -- aborting a real turn is the composer's
 * stop button, which calls ChatRepo.abort() -> `POST /v1/abort` and is
 * already wired. So it is not rendered at all in live mode rather than
 * rendered permanently disabled: a disabled control implies some state in
 * which it becomes available, and there is none. Same ruling the live "new
 * chat" button got, for the same reason.
 *
 * The action is read through getState() at click time rather than subscribed
 * to: this component renders in BOTH trees, and a subscription would have
 * every live route holding a demo-engine subscription for an action it can
 * never call.
 *
 * Fix round 2, Defect 2a: `SessionCapabilities` used to render here as a
 * third live-mode control (badge / capabilities / reconnect). Three controls
 * plus the breadcrumb do not fit at 720 CSS px -- `RECONNECT` clipped to
 * `RECONNE` and the page gained a horizontal scrollbar, which then let the
 * whole shell slide sideways. It moved to Settings, next to the devices &
 * pairing heading (`app/app/settings/page.tsx`'s `DevicesPanel`) -- session
 * information's existing home, and a natural one for "what THIS session may
 * do" specifically. This bar keeps only what needs to be glanced at on every
 * route: the connection state and the way back to `/connect`.
 */
export function Topbar({
  breadcrumb,
  isDashboard,
  mode,
}: {
  breadcrumb: string;
  isDashboard: boolean;
  mode: RepoMode;
}) {
  const canAbort = isDashboard && mode === "demo";

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-8 lg:py-5">
      <span className="truncate font-mono text-xs uppercase tracking-wide text-bone-subtle">
        {breadcrumb}
      </span>
      {/* shrink-0 on the cluster, truncate on the breadcrumb: at 390px one of
          the two has to give, and it must be the label rather than the
          controls -- "STUDIO / COMM…" is still legible, half a reconnect
          button is not. */}
      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] uppercase tracking-wide lg:gap-3">
        {mode === "live" ? (
          <>
            <ConnectionBadge />
            {/*
              The shell's way back to the connect screen, and the only one:
              the live tree is reachable with a token she has stopped
              accepting, and a device whose token lost a capability is refused
              per-route with nothing on screen offering a new one. A 401 or a
              1008 close now routes here on its own, but neither covers a user
              who simply wants to re-pair, or a 403 that leaves the session
              technically valid and practically useless.

              Rendered unconditionally rather than only while the connection
              is down, because the case it exists for is precisely the one
              where nothing looks wrong from here: the socket is a separate
              credential path from the HTTP routes, and an affordance that
              appears only when the badge already says something is broken is
              absent in exactly the state that needs it.
            */}
            <Link
              href="/connect"
              className="rounded-md border border-border px-3 py-1.5 text-bone-subtle transition-colors hover:border-border-strong hover:text-bone"
            >
              reconnect
            </Link>
          </>
        ) : (
          /* The word "mode" is the first thing to go at 390px: the badge, the
             abort button and the breadcrumb cannot all have their full width,
             and a dot plus "demo" says the same thing. */
          <span
            data-testid="mode-badge"
            className="rounded-md border border-amber/40 px-2 py-1.5 text-amber lg:px-3"
          >
            ● demo<span className="hidden lg:inline"> mode</span>
          </span>
        )}
        {/*
          "⌘K search" was here: a bare <span> with no handler and no key
          binding, in both trees. It looked like a control, and pressing ⌘K
          did nothing -- the same shape as the personality field and the
          regenerate button this milestone already treated as blockers. Build
          it and put it back; until then it is chrome pretending to be a
          feature. The per-page searches (conversations, memory, files) are
          real and unaffected.
        */}
        {mode === "demo" && (
          <button
            onClick={() => useDemoStore.getState().abortCurrentTask()}
            disabled={!canAbort}
            className={cn(
              "rounded-md border border-fail/40 px-2 py-1.5 text-fail transition-colors hover:bg-fail/10 lg:px-3",
              !canAbort && "cursor-not-allowed opacity-40 hover:bg-transparent",
            )}
          >
            {/* The keyboard hint is desktop-only for the obvious reason: there
                is no ESC key to hold on a phone, so at that width it is a
                label for a gesture the reader does not have. */}
            <span className="hidden lg:inline">esc-hold · </span>abort
          </button>
        )}
      </div>
    </header>
  );
}
