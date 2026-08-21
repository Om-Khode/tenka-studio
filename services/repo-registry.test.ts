import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  configureRepos,
  getRepos,
  getRepoMode,
  resetRepos,
  persistKey,
  namespacedStorage,
  isSafeToDefaultToDemo,
} from "./repo-registry";
import { demoRepoBundle } from "./repos/demo";
import type { RepoBundle } from "./repos/types";

// A second, distinguishable bundle so tests can tell "which bundle is bound"
// apart from "is a bundle bound at all". Only `memory` differs; the other
// six fields borrow the demo bundle's real implementations so this still
// satisfies RepoBundle without hand-rolling every domain.
const otherBundle: RepoBundle = {
  ...demoRepoBundle,
  memory: {
    load: async () => ({ entities: [], facts: [], relationships: [], preferences: [], procedures: [] }),
    forget: async () => {},
    forgetAll: async () => {},
  },
};

describe("repo-registry", () => {
  afterEach(() => {
    // Every other test file (store unit tests, component tests) relies on
    // the module-load self-configuration to demo -- restore it so this
    // file's own reconfigure/reset tests cannot bleed into a later test in
    // this same file.
    configureRepos("demo", demoRepoBundle);
  });

  it("self-configures to the demo bundle on import, so getRepos() works with zero setup", () => {
    expect(getRepoMode()).toBe("demo");
    expect(getRepos()).toBe(demoRepoBundle);
  });

  it("configureRepos rebinds both the mode and the bundle", () => {
    configureRepos("live", otherBundle);
    expect(getRepoMode()).toBe("live");
    expect(getRepos()).toBe(otherBundle);
  });

  it("resetRepos clears the binding, and getRepos() then throws", () => {
    resetRepos();
    expect(getRepoMode()).toBeNull();
    expect(() => getRepos()).toThrow(/configureRepos/);
  });

  describe("persistKey", () => {
    it("resolves to the bare base string in demo mode", () => {
      configureRepos("demo", demoRepoBundle);
      expect(persistKey("tenka-studio-memory")).toBe("tenka-studio-memory");
    });

    it("resolves to the bare base string when unconfigured", () => {
      resetRepos();
      expect(persistKey("tenka-studio-memory")).toBe("tenka-studio-memory");
    });

    it("appends a distinct suffix in live mode", () => {
      configureRepos("live", otherBundle);
      expect(persistKey("tenka-studio-memory")).toBe("tenka-studio-memory:live");
    });

    it("demo and live never collide on the same base", () => {
      configureRepos("demo", demoRepoBundle);
      const demoKey = persistKey("tenka-studio-memory");
      configureRepos("live", otherBundle);
      const liveKey = persistKey("tenka-studio-memory");
      expect(demoKey).not.toBe(liveKey);
    });
  });

  describe("isSafeToDefaultToDemo", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("says yes under Vitest -- window is defined (jsdom), but process.env.VITEST is \"true\"", () => {
      // This is the exact environment every test in this suite runs in --
      // if this were ever false, the ~180 seed tests that call `.load()`
      // with zero setup would start throwing.
      expect(typeof window).not.toBe("undefined");
      expect(process.env.VITEST).toBe("true");
      expect(isSafeToDefaultToDemo()).toBe(true);
    });

    it("says no when window is defined and VITEST is not \"true\" -- the real-browser shape", () => {
      vi.stubEnv("VITEST", "");
      expect(typeof window).not.toBe("undefined");
      expect(isSafeToDefaultToDemo()).toBe(false);
    });

    it("says yes when window is undefined, regardless of VITEST -- the SSR/build shape", () => {
      vi.stubEnv("VITEST", "");
      const originalWindow = globalThis.window;
      // @ts-expect-error -- simulating Node/SSR, where `window` does not exist at all.
      delete globalThis.window;
      try {
        expect(isSafeToDefaultToDemo()).toBe(true);
      } finally {
        globalThis.window = originalWindow;
      }
    });
  });

  describe("fails closed in a real browser", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("with VITEST unset and window defined, a freshly-loaded registry stays unconfigured, and getRepos() throws instead of returning demo data", async () => {
      // Simulates the one case this module cannot self-configure in: a real
      // browser, where `window` exists but there is no Vitest process.env
      // flag and no layout has called configureRepos() yet. vi.stubEnv +
      // vi.resetModules() force repo-registry.ts's module-load side effect
      // to re-run under that condition, rather than just asserting on the
      // extracted predicate -- this is the actual guard, exercised end to
      // end, not a proxy for it.
      vi.stubEnv("VITEST", "");
      vi.resetModules();

      const fresh = await import("./repo-registry");

      expect(fresh.getRepoMode()).toBeNull();
      expect(() => fresh.getRepos()).toThrow(/configureRepos/);

      // And the escape hatch still works: a layout's explicit call (this is
      // what app/demo/layout.tsx and app/app/layout.tsx actually do) binds
      // it immediately, same as it always has.
      const { demoRepoBundle: freshDemoBundle } = await import("./repos/demo");
      fresh.configureRepos("demo", freshDemoBundle);
      expect(fresh.getRepos()).toBe(freshDemoBundle);
    });
  });

  describe("namespacedStorage", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("re-resolves the key at access time, not at the time the storage object was created", async () => {
      // The whole point of the "storage-access time, not the name option"
      // constraint: build the adapter while demo is bound, THEN switch to
      // live, and confirm a write lands under the LIVE key -- proving the
      // adapter reads currentMode fresh on every call instead of capturing
      // it once when namespacedStorage() ran.
      configureRepos("demo", demoRepoBundle);
      const storage = namespacedStorage<{ value: number }>()!;

      configureRepos("live", otherBundle);
      await storage.setItem("tenka-studio-probe", { state: { value: 1 } });

      expect(localStorage.getItem("tenka-studio-probe")).toBeNull();
      expect(localStorage.getItem("tenka-studio-probe:live")).not.toBeNull();
    });

    it("getItem reads back exactly what setItem wrote, through the same namespacing", async () => {
      configureRepos("live", otherBundle);
      const storage = namespacedStorage<{ value: number }>()!;
      await storage.setItem("tenka-studio-probe", { state: { value: 42 }, version: 0 });
      const read = await storage.getItem("tenka-studio-probe");
      expect(read).toEqual({ state: { value: 42 }, version: 0 });
    });

    it("removeItem deletes the namespaced key, not the bare one", async () => {
      configureRepos("live", otherBundle);
      const storage = namespacedStorage<{ value: number }>()!;
      localStorage.setItem("tenka-studio-probe", "should survive");
      await storage.setItem("tenka-studio-probe", { state: { value: 1 } });
      await storage.removeItem("tenka-studio-probe");
      expect(localStorage.getItem("tenka-studio-probe:live")).toBeNull();
      expect(localStorage.getItem("tenka-studio-probe")).toBe("should survive");
    });
  });
});
