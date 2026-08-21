import { createJSONStorage } from "zustand/middleware";
import type { PersistStorage } from "zustand/middleware";
import { demoRepoBundle } from "./repos/demo";
import type { RepoBundle, RepoMode } from "./repos/types";

export type { RepoBundle, RepoMode } from "./repos/types";

let currentMode: RepoMode | null = null;
let currentBundle: RepoBundle | null = null;

/**
 * Binds one bundle for the whole app. Zustand stores are module singletons
 * and cannot read React context, so a layout calls this at its own module
 * scope (see app/demo/layout.tsx) rather than through a provider -- by the
 * time any hydration hook or store action runs, the bundle is already bound.
 */
export function configureRepos(mode: RepoMode, bundle: RepoBundle): void {
  currentMode = mode;
  currentBundle = bundle;
}

/** Throws if unconfigured -- see resetRepos() for how to reach that state. */
export function getRepos(): RepoBundle {
  if (!currentBundle) {
    throw new Error(
      "getRepos() called before configureRepos() -- no repository bundle is bound.",
    );
  }
  return currentBundle;
}

export function getRepoMode(): RepoMode | null {
  return currentMode;
}

export function resetRepos(): void {
  currentMode = null;
  currentBundle = null;
}

/**
 * Namespaced by mode -- except "demo" resolves to `base` UNCHANGED. Demo is
 * the pre-existing surface (every localStorage key a real user already has,
 * and every existing test's hardcoded storage key), so it keeps the bare
 * key; only "live" gets a distinct suffix. Unconfigured falls back to the
 * bare key too, matching demo's default.
 */
export function persistKey(base: string): string {
  return currentMode === "live" ? `${base}:live` : base;
}

/**
 * A zustand persist `storage` adapter that re-resolves the mode-namespaced
 * key on every read/write, not once at import. Zustand evaluates a store's
 * `persist(...)` options -- including a static `name` string -- when the
 * module first loads, before any layout has called configureRepos(). Baking
 * the namespace into `name` would freeze it at whichever mode happened to be
 * current at import time and never notice a later mode switch. `name` stays
 * the plain base string; this adapter is what actually reads/writes
 * `persistKey(name)`, at the moment zustand calls getItem/setItem/removeItem
 * -- long after configureRepos() has run.
 */
export function namespacedStorage<S>(): PersistStorage<S> | undefined {
  return createJSONStorage<S>(() => ({
    getItem: (name) => localStorage.getItem(persistKey(name)),
    setItem: (name, value) => localStorage.setItem(persistKey(name), value),
    removeItem: (name) => localStorage.removeItem(persistKey(name)),
  }));
}

/**
 * Whether it is SAFE to self-configure the demo bundle as a convenience,
 * rather than leaving the registry unconfigured until something calls
 * configureRepos() explicitly. "Safe" means: nothing user-facing can ever
 * observe demo data standing in for live data as a result.
 *
 * Two cases say yes:
 *
 *   1. `typeof window === "undefined"` -- there is no browser at all, e.g.
 *      Node during `next build`'s static generation or the SSR pass of a
 *      server render. Both layouts call configureRepos() synchronously in
 *      their own render body, before any hook runs, and load() only ever
 *      fires from a useEffect (which never executes during SSR) -- so no
 *      store method can observe the self-configured default before the
 *      layout's own explicit call overwrites it moments later.
 *   2. `process.env.VITEST === "true"` -- Vitest's own documented signal
 *      that code is running under its test runner. jsdom (Vitest's test
 *      environment) DOES define `window`, so case 1 alone would not catch
 *      it -- every store's own unit test, and every component test that
 *      renders a store-backed component without ever mounting a layout,
 *      needs case 2 specifically. That is exactly how the ~180 pre-existing
 *      seed tests call `.load()` with zero setup.
 *
 * A REAL browser has neither: `window` is defined, and `process` is not --
 * Next.js's client bundle has no `process` global unless something
 * polyfills one, and `typeof` never throws on an undeclared identifier, so
 * this guard is safe to evaluate regardless. That absence is deliberate: a
 * live page that never calls configureRepos() (a bug, or a race where
 * something reaches getRepos() before the layout's render body runs) must
 * hit getRepos()'s throw, not silently render demo data under live chrome.
 */
export function isSafeToDefaultToDemo(): boolean {
  if (typeof window === "undefined") return true;
  return typeof process !== "undefined" && process.env.VITEST === "true";
}

// Self-configure to the demo bundle, but ONLY where isSafeToDefaultToDemo()
// says it cannot be mistaken for live data (see above). Every /demo/* page,
// every store's own unit test, and anything else that imports a store
// without ever rendering a layout still needs a working repository with
// zero setup -- but a real browser must stay unconfigured, so a live page
// that fails to call configureRepos() hits getRepos()'s throw instead of
// silently rendering demo data. app/app/layout.tsx (Batch 3) and
// app/demo/layout.tsx both call configureRepos() explicitly, synchronously,
// in their own render body -- before any hydration hook runs -- so neither
// tree depends on this default; app/demo/layout.tsx re-asserts it on every
// render so navigating live -> demo in one SPA session lands back on demo.
if (isSafeToDefaultToDemo()) {
  configureRepos("demo", demoRepoBundle);
}
