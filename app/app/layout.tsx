"use client";

import { useEffect } from "react";
import { notFound, usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { BottomNav } from "@/components/shell/BottomNav";
import { Topbar } from "@/components/shell/Topbar";
import { SHELL, MAIN } from "@/components/shell/shell-classes";
import { Toaster } from "@/components/ui/Toaster";
import { RaiseBanner } from "@/components/settings/RaiseBanner";
import { useChatHydration } from "@/hooks/useChatHydration";
import { useEventStream } from "@/hooks/useEventStream";
import { useFileHydration } from "@/hooks/useFileHydration";
import { useMemoryHydration } from "@/hooks/useMemoryHydration";
import { useMemoryStore } from "@/store/memory-store";
import { switchMode, resetLiveSession } from "@/services/persist";
import { liveRepoBundle } from "@/services/repos/http";
import { onSessionRevoked } from "@/services/token";
import { initAuth, useAuthStore } from "@/store/auth-store";
import { isPublicDemoBuild } from "@/services/deployment";

/**
 * Deliberately NOT under `/app`. The connect screen is the one page a user
 * with no token has to be able to reach, and this layout's whole job is to
 * render nothing until a token exists -- so a connect route nested beneath
 * it was unreachable by construction: the redirect below navigated to it,
 * Next.js kept this layout mounted across that navigation, `authorized` was
 * still false, and the gate returned null over the very page that was
 * supposed to fix it. The alternative -- exempting one pathname inside the
 * gate -- would leave every future addition to this layout (a hook, a fetch,
 * a chrome element) silently applying to a page that has no session, and
 * would be one forgotten `if` away from the same blank screen. A sibling
 * route cannot regress that way.
 */
const CONNECT_ROUTE = "/connect";

const TITLES: Record<string, string> = {
  "/app": "DASHBOARD",
  "/app/chat": "CHAT",
  "/app/commands": "COMMANDS",
  "/app/files": "FILES",
  "/app/memory": "MEMORY",
  "/app/settings": "SETTINGS",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Before switchMode() below, deliberately, and not merely first for tidiness.
  // A public HTTPS deployment cannot reach a visitor's http://127.0.0.1 daemon
  // -- mixed content, with Private Network Access on top of it -- so the live
  // tree is absent from that build rather than shipped as a dead end.
  // switchMode() binds the HTTP repo bundle to module-singleton stores on every
  // render; a build that can never reach a daemon must never bind it, which is
  // what app/demo-only-gate.test.tsx pins by asserting getRepoMode() is still
  // "demo" after this returns.
  if (isPublicDemoBuild()) notFound();

  // Zustand stores are module singletons and cannot read React context, so
  // this binds the live bundle imperatively, synchronously, as the very
  // first thing this component does -- before useRouter/useState below, and
  // therefore before any hydration hook or store action anywhere in the
  // tree can run. Mirrors app/demo/layout.tsx's configureRepos() call
  // exactly, except switchMode() (services/persist.ts) also resets every
  // store on an actual mode transition, so a demo -> /app SPA navigation in
  // one session cannot leave a demo dataset sitting in memory under live
  // chrome. Called on every render, same as demo's call -- idempotent once
  // getRepoMode() already reads "live".
  switchMode("live", liveRepoBundle);

  const router = useRouter();
  const pathname = usePathname();

  // The gate. `unknown` until the probe below lands, and `unknown` renders
  // nothing -- so this layout never paints the shell (and never lets a child
  // page fire a request certain to 401) before a real decision is made, and
  // equally never bounces an authorised user to /connect during the round
  // trip.
  //
  // This used to be `readToken()`: a localStorage read, synchronous, and
  // wrong. Since 6a the credential is an httpOnly cookie that script cannot
  // see, so the only thing that knows whether this browser is authorised is
  // the daemon -- which was always true, it was just possible to pretend
  // otherwise while a token sat in storage where a presence check could find
  // it. GET /v1/session is that question asked out loud.
  const phase = useAuthStore((s) => s.phase);
  const probe = useAuthStore((s) => s.probe);
  const authorized = phase === "authorized";

  useEffect(() => {
    // Before the probe, and synchronous: a pre-6a token in localStorage is
    // dead to the daemon but still readable by injected script, so it goes
    // whether or not the network answers.
    initAuth();
    void probe();
  }, [probe]);

  useEffect(() => {
    if (phase === "unauthorized") router.replace(CONNECT_ROUTE);
  }, [phase, router]);

  // A session can end after the probe said yes -- she regenerates her secret,
  // the device is revoked from the desktop, the vault is rebuilt. The
  // discovery happens wherever it happens (a 401 in services/http.ts, a 1008
  // close in useEventStream) and has to travel back to the one component that
  // can act on it. clear() flips `phase` to "unauthorized", which both
  // unmounts the shell -- stopping the socket and the memory load, so nothing
  // re-presents a credential she has refused -- and drives the redirect
  // through the single effect above rather than a second call to replace().
  useEffect(
    () =>
      onSessionRevoked(() => {
        useAuthStore.getState().clear();
        // Re-pairing comes straight back here with the mode still "live", so
        // switchMode() short-circuits and never resets the load gates. Without
        // this, a user whose credential was refused because ~/TENKA was rebuilt
        // re-pairs and reads the PREVIOUS install's settings, backup size and
        // enrolled names -- every pane loads only while "idle", and they were
        // "ready" from before the revocation.
        resetLiveSession();
      }),
    [],
  );

  // Same hydration hooks app/demo/layout.tsx mounts, for the same reasons:
  // Sidebar's chat/memory badges and DangerZone (on /app/settings) need
  // these stores hydrated on every /app/* route, not just the one page that
  // happens to render them. Safe to run before `authorized` resolves --
  // rehydration reads localStorage only, never the network.
  useChatHydration();
  useFileHydration();
  useMemoryHydration();

  // One socket for the whole live tree, mounted here rather than on a page so
  // it survives navigation between /app/* routes -- a per-page socket would
  // reconnect on every click, and a live turn started on /app/chat would lose
  // the frame that settles it the moment the user looked at Files. Gated on
  // `authorized` for the same reason memory's load() below is: no token means
  // the daemon closes the socket at 1008, which would be a retry loop rather
  // than a connection.
  useEventStream(authorized);
  const memoryStatus = useMemoryStore((s) => s.status);
  const loadMemory = useMemoryStore((s) => s.load);
  useEffect(() => {
    // Gated on `authorized`: memory's load() is a real GET against the
    // daemon, and firing it before a token is known to be good would be
    // exactly the request "certain to 401" this layout exists to prevent.
    if (authorized && memoryStatus === "idle") void loadMemory();
  }, [authorized, memoryStatus, loadMemory]);

  const title = TITLES[pathname] ?? "DASHBOARD";
  const isDashboard = pathname === "/app";

  if (!authorized) return null;

  // Shell shape is shared with app/demo/layout.tsx -- keep the two in step.
  return (
    <div className={SHELL}>
      <Sidebar activePath={pathname} basePath="/app" mode="live" />
      <div className="flex min-h-0 flex-1 flex-col">
        <Topbar breadcrumb={`STUDIO / ${title}`} isDashboard={isDashboard} mode="live" />
        {/* Spec §3.6: a raise can last up to seven days by the operator's own
            choice, and that is not something to hold in your head. Mounted
            here, once, so it renders above every route in the live tree
            rather than only the settings page a raise happens to be minted
            from. Renders nothing for a session that cannot see one -- see its
            own doc. */}
        <RaiseBanner />
        <main className={MAIN}>{children}</main>
      </div>
      <BottomNav activePath={pathname} basePath="/app" />
      <Toaster />
    </div>
  );
}
