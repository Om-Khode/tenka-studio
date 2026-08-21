/**
 * Resets the load/hydration gates on every store that has one, then rebinds
 * the repo registry. Both `app/demo/layout.tsx` and `app/app/layout.tsx`
 * call `switchMode()` synchronously in their own render body, in place of a
 * bare `configureRepos()` call, so a Single-Page-App navigation between the
 * two trees cannot leave one tree's in-memory snapshot sitting under the
 * other's chrome.
 *
 * Why this is needed at all: `configureRepos()` alone rebinds *which*
 * repository a store's next `load()` call reaches, but it does nothing
 * about a store that already finished loading. `memory-store.ts`'s
 * `status` (and settings-, file-, system- and personality-store's) only ever
 * flips out of "idle" once per mount -- `if (status === "idle") void load()`
 * in a layout or a panel -- so navigating live -> demo (or back) without a
 * full reload would otherwise leave `status: "ready"` holding the OTHER
 * tree's dataset forever, because nothing ever asks it to load again.
 * "Every store that has one" is enforced, not just intended: persist.test.ts
 * enumerates the stores at runtime and fails on any `status` this misses.
 *
 * What this deliberately does NOT do: reset a store to `getInitialState()`
 * wholesale. `status` and `hasHydrated` are never part of any store's
 * `partialize` (see chat/file/memory/settings-store.ts), so setting only
 * those is a same-key, content-identical write when the persist middleware
 * auto-persists after every `setState()` call -- harmless regardless of
 * which mode is bound at that exact instant. Resetting a field that IS
 * persisted (memory/files' `overlay`, chat's `conversations`,
 * settings' `overrides`) would instead write an empty value straight to
 * whichever mode's storage key happens to be bound the moment this runs,
 * destroying real data a heartbeat before that store's own
 * `persist.rehydrate()` (an effect, always at least one tick later) could
 * read the real thing back. Isolation for those fields already comes from
 * `namespacedStorage()` (services/repo-registry.ts) keying reads/writes by
 * mode, plus every hydration hook calling `persist.rehydrate()` on every
 * layout mount -- this only closes the other gap, the in-memory `status`
 * that nothing else asks to flip back to "idle".
 */
import { configureRepos, getRepoMode } from "./repo-registry";
import type { RepoBundle, RepoMode } from "./repos/types";
import { useChatStore } from "@/store/chat-store";
import { useFileStore } from "@/store/file-store";
import { useMemoryStore } from "@/store/memory-store";
import { usePersonalityStore } from "@/store/personality-store";
import { useSettingsStore } from "@/store/settings-store";
import { useSystemStore, resetSystemData } from "@/store/system-store";

/**
 * Exported for one caller besides switchMode: the token-revoked handler in
 * app/app/layout.tsx. A revoked session routes the user to /connect, and
 * re-pairing pushes back to /app -- but the mode was already "live" and
 * nothing on /connect rebinds it, so switchMode() short-circuits and this
 * never ran. Every live pane loads only while its status is "idle", and those
 * were "ready" from before the revocation, so the user re-paired into the
 * PREVIOUS session's settings values, backup size and enrolled names -- the
 * exact "live tree stating things no daemon said" this milestone exists to
 * stop. Safe to call there because that tree is unmounting anyway.
 */
export function resetLiveSession(): void {
  resetLoadGates();
}

function resetLoadGates(): void {
  // liveTurn: a turn left pending across a mode switch has nothing to
  // settle it anymore (its conversationId belonged to whichever bundle was
  // bound when it started) -- clearing it here is the same "no orphaned
  // pending state surviving a switch" guarantee this function already gives
  // memory/settings' status. rejectedDraft goes with it: the composer that
  // would have taken the text back belongs to the tree being left.
  useChatStore.setState({ hasHydrated: false, liveTurn: null, rejectedDraft: null });
  // rawByDir/entriesByDir are caches, not persisted state (see
  // file-store.ts) -- clearing them here too means a directory fetched
  // under the OTHER mode cannot be mistaken for this one's listing before
  // the next load() (Files' mount effect, or a navigation action) refills it.
  // `roots` is the same kind of answer at a coarser grain (FilesRepo.roots()
  // is per-daemon and explicitly never hardcoded), so it clears with them --
  // one mode's set of roots must not be mistaken for the other's.
  useFileStore.setState({
    status: "idle",
    hasHydrated: false,
    roots: [],
    rawByDir: {},
    entriesByDir: {},
  });
  useMemoryStore.setState({ status: "idle", hasHydrated: false });
  useSettingsStore.setState({ status: "idle", hasHydrated: false });
  // system-store and personality-store are neither persisted nor hydrated,
  // but both grew a one-shot `status` gate of exactly the kind this function
  // exists for: BackupPanel/EnrollmentPanel/PersonalityPanel each load only
  // `if (status === "idle")`, and both stores are module singletons that
  // survive a client-side navigation. Without these two lines a /demo ->
  // /app SPA transition left /app/settings rendering the demo seed -- "Om ·
  // 8 samples", 41 MB of backup -- under live chrome, with no load ever
  // fired. persist.test.ts asserts this list covers EVERY store exposing a
  // `status` OR a `*Status` gate, so the next gated store cannot be forgotten
  // the same way.
  //
  // system-store also needs its DATA reset, not only its gate -- the half that
  // was missed. Its backup/voices/faces were initial-state literals nothing
  // ever rewrote, so resetting `status` alone left the OTHER tree's values in
  // place until a load replaced them, and /demo's load() has nothing to fetch
  // and resolves synchronously, so under demo chrome it never did: after using
  // /app/settings, a client-side navigation to /demo/settings rendered the real
  // user's enrolled voice and face NAMES and their real backup size under demo
  // chrome. resetSystemData() also blanks the telemetry slice and its own
  // `telemetryStatus` gate, because nothing re-renders on the passage of time
  // and a live -> demo -> live transition otherwise showed the pre-switch CPU
  // reading undimmed and un-stale until three fresh misses accumulated.
  //
  // Neither store is persisted, so unlike memory/files/settings above there is
  // no storage key for this write to reach (see this file's own "what this
  // deliberately does NOT do" note) -- which is why resetting real data here is
  // safe where it would not be there.
  useSystemStore.setState({ status: "idle", ...resetSystemData() });
  usePersonalityStore.setState({ status: "idle" });
}

/**
 * Binds `mode`/`bundle` into the repo registry, resetting every store's load
 * gate first -- but only when this is an actual transition away from
 * whatever mode (if any) was previously bound. Idempotent across re-renders
 * of the SAME tree, exactly like a bare `configureRepos()` call: once
 * `getRepoMode()` already equals `mode`, a later render (a route change
 * within one tree, or React re-rendering the layout for an unrelated
 * reason) skips the reset entirely, so it never re-triggers a load or
 * hydration mid-session.
 */
export function switchMode(mode: RepoMode, bundle: RepoBundle): void {
  // `typeof window === "undefined"` is the SSR/build case (Node during
  // `next build`'s static generation, or the SSR pass of a server render --
  // same guard as repo-registry.ts's isSafeToDefaultToDemo()). Resetting a
  // persist-wrapped store's load gate calls setState(), and setState()
  // write-through on a persist-wrapped store reaches `localStorage`
  // unconditionally (services/repo-registry.ts's namespacedStorage adapter)
  // -- which does not exist server-side and throws, taking a static build
  // of /app/* down with it. Nothing needs resetting there anyway: no
  // hydration hook or load effect ever runs during SSR (effects are a
  // browser-only concept), so the reset would have nothing to unblock until
  // the client's own first render calls this again with `window` defined.
  if (typeof window !== "undefined" && getRepoMode() !== mode) {
    resetLoadGates();
  }
  configureRepos(mode, bundle);
}
