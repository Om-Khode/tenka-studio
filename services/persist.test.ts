import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { switchMode } from "./persist";
import { configureRepos, getRepoMode } from "./repo-registry";
import { demoRepoBundle } from "./repos/demo";
import * as authStore from "@/store/auth-store";
import * as chatStore from "@/store/chat-store";
import * as demoEngine from "@/store/demo-engine";
import * as fileStore from "@/store/file-store";
import * as memoryStore from "@/store/memory-store";
import * as personalityStore from "@/store/personality-store";
import * as settingsStore from "@/store/settings-store";
import * as systemStore from "@/store/system-store";
import * as toastStore from "@/store/toast-store";
import { seedMemory, HUB_ENTITY_ID } from "@/store/memory-scripts";

const { useChatStore } = chatStore;
const { useFileStore } = fileStore;
const { useMemoryStore } = memoryStore;
const { usePersonalityStore } = personalityStore;
const { useSettingsStore } = settingsStore;
const { useSystemStore } = systemStore;

describe("switchMode", () => {
  beforeEach(() => {
    // Every setState() on a persist-wrapped store writes through immediately
    // (see persist.ts's own docstring) -- an earlier test's own transition
    // can leave a real, harmless write sitting under a key this test then
    // reads, unless storage starts clean for each one.
    localStorage.clear();
  });

  afterEach(() => {
    // Every other test file's stores rely on demo mode being bound with
    // zero setup -- restore it so this file's mode juggling cannot bleed
    // into a later test elsewhere in the suite.
    configureRepos("demo", demoRepoBundle);
    useChatStore.setState(useChatStore.getInitialState(), true);
    useFileStore.setState(useFileStore.getInitialState(), true);
    useMemoryStore.setState(useMemoryStore.getInitialState(), true);
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    usePersonalityStore.setState(usePersonalityStore.getInitialState(), true);
    useSystemStore.setState(useSystemStore.getInitialState(), true);
  });

  it("binds the registry the same way configureRepos does", () => {
    switchMode("live", demoRepoBundle);
    expect(getRepoMode()).toBe("live");
    expect(() => switchMode("demo", demoRepoBundle)).not.toThrow();
    expect(getRepoMode()).toBe("demo");
  });

  it("does NOT reset the load gate on a re-render of the same mode -- status and a search query survive", () => {
    switchMode("demo", demoRepoBundle);
    useMemoryStore.setState({ status: "ready", selectedId: 7 });
    useSettingsStore.setState({ status: "ready", query: "camera" });

    switchMode("demo", demoRepoBundle); // same mode again, e.g. a route change

    expect(useMemoryStore.getState().status).toBe("ready");
    expect(useMemoryStore.getState().selectedId).toBe(7);
    expect(useSettingsStore.getState().status).toBe("ready");
    expect(useSettingsStore.getState().query).toBe("camera");
  });

  it("resets status and hasHydrated back to their load-gate defaults on an actual mode transition", () => {
    switchMode("demo", demoRepoBundle);
    useMemoryStore.setState({ status: "ready", hasHydrated: true });
    useSettingsStore.setState({ status: "ready", hasHydrated: true });
    useChatStore.setState({ hasHydrated: true });

    switchMode("live", demoRepoBundle); // an actual transition

    expect(useMemoryStore.getState().status).toBe("idle");
    expect(useMemoryStore.getState().hasHydrated).toBe(false);
    expect(useSettingsStore.getState().status).toBe("idle");
    expect(useSettingsStore.getState().hasHydrated).toBe(false);
    expect(useChatStore.getState().hasHydrated).toBe(false);
    expect(getRepoMode()).toBe("live");
  });

  it("also resets files' load gate and clears its per-directory caches, and clears chat's pending live turn", () => {
    switchMode("demo", demoRepoBundle);
    useFileStore.setState({
      status: "ready",
      hasHydrated: true,
      rawByDir: { desktop: [] },
      entriesByDir: { desktop: [] },
    });
    useChatStore.setState({
      liveTurn: {
        conversationId: "c1",
        daemonConversationId: "session-1",
        turnId: "t1",
        assistantMessageId: "m1",
      },
    });

    switchMode("live", demoRepoBundle);

    expect(useFileStore.getState().status).toBe("idle");
    expect(useFileStore.getState().hasHydrated).toBe(false);
    expect(useFileStore.getState().rawByDir).toEqual({});
    expect(useFileStore.getState().entriesByDir).toEqual({});
    expect(useChatStore.getState().liveTurn).toBeNull();
  });

  it("also resets system-store's and personality-store's load gates -- both grew one after this function was written", () => {
    switchMode("demo", demoRepoBundle);
    // What /demo/settings leaves behind: BackupPanel and EnrollmentPanel both
    // fire load() once, on `status === "idle"` only, over a store that is a
    // module singleton and survives a client-side navigation.
    useSystemStore.setState({ status: "ready" });
    usePersonalityStore.setState({ status: "ready" });

    switchMode("live", demoRepoBundle);

    // Still "ready" here would mean /app/settings renders the demo seed --
    // "Om · 8 samples", 41 MB of backup, warm_honest's traits -- under live
    // chrome, with no load ever fired against the daemon.
    expect(useSystemStore.getState().status).toBe("idle");
    expect(usePersonalityStore.getState().status).toBe("idle");
  });

  /**
   * The gate was reset; the DATA behind it was not. system-store's
   * backup/voices/faces were initial-state literals nothing ever rewrote, and
   * its demo branch of load() flipped straight to "ready" and returned. So
   * after /app/settings had replaced all three with the daemon's real values, a
   * client-side navigation to /demo/settings rendered the real user's enrolled
   * voice and face NAMES and their real backup size under demo chrome. The
   * skeleton gate cannot cover it -- the demo path resolves synchronously.
   */
  it("resets system-store's machine data on a transition, so one tree's real enrolment cannot render under the other's chrome", async () => {
    switchMode("live", demoRepoBundle);
    // What /app/settings leaves behind: the daemon's own answers.
    useSystemStore.setState({
      status: "ready",
      backup: { enabled: true, lastBackupAt: "2026-08-08T00:00:00.000Z", sizeBytes: 912_000_000, progressPct: null },
      voices: [{ id: "real-1", name: "Priya", sampleCount: 4, enrolledAt: "2026-08-01T00:00:00.000Z", lastHeardAt: null }],
      faces: [{ id: "real-2", name: "Priya", encodingCount: 3, metAt: "2026-08-01T00:00:00.000Z", lastSeenAt: null }],
    });

    switchMode("demo", demoRepoBundle);

    // The real names and the real backup size are gone before /demo/settings
    // can render them. Demo's own seed is what stands in their place, because
    // demo's load() has nothing to fetch and resolves inside its calling tick
    // -- there is no loading frame an empty panel could hide behind.
    const reset = useSystemStore.getState();
    expect(reset.status).toBe("idle");
    expect(reset.voices.map((v) => v.name)).toEqual(["Kirigaya", "Sakuta"]);
    expect(reset.faces.map((f) => f.name)).toEqual(["Kirigaya", "Sakuta"]);
    expect(reset.backup.sizeBytes).toBe(41_000_000);

    await useSystemStore.getState().load();
    expect(useSystemStore.getState().status).toBe("ready");
    expect(useSystemStore.getState().voices.map((v) => v.name)).toEqual(["Kirigaya", "Sakuta"]);
  });

  it("resets it in the other direction too -- /app must not open on the demo seed either", () => {
    switchMode("demo", demoRepoBundle);
    useSystemStore.setState({ status: "ready" });

    switchMode("live", demoRepoBundle);

    // The seed is still what the store holds (it is this store's initial data,
    // and demo needs it back on the return trip), but `status` is what decides
    // whether anything renders: BackupPanel and EnrollmentPanel draw only on
    // "ready", so live shows a skeleton until a real fetch answers.
    expect(useSystemStore.getState().status).toBe("idle");
  });

  it("clears the telemetry slice and its own gate -- a pre-switch reading must not render as current under the other tree", () => {
    switchMode("live", demoRepoBundle);
    useSystemStore.getState().setTelemetry({
      cpuPercent: 41,
      ramPercent: 62,
      batteryPercent: null,
      activeModel: "gemini-flash",
      uptimeSeconds: 900,
    });
    expect(useSystemStore.getState().telemetry).not.toBeNull();

    switchMode("demo", demoRepoBundle);

    const s = useSystemStore.getState();
    // Not merely dimmed: nothing re-renders on the passage of time, so leaving
    // it would show "cpu 41%" undimmed (misses still 0) until three fresh
    // misses accumulated against a reading from the other tree entirely.
    expect(s.telemetry).toBeNull();
    expect(s.telemetryStatus).toBe("idle");
    expect(s.telemetryAt).toBeNull();
    expect(s.telemetryMisses).toBe(0);
  });

  it("also clears files' roots -- one daemon's set of roots is not the other's", () => {
    switchMode("demo", demoRepoBundle);
    useFileStore.setState({ roots: ["desktop", "documents"] });

    switchMode("live", demoRepoBundle);

    expect(useFileStore.getState().roots).toEqual([]);
  });

  it("never destroys a persisted field -- resetting the load gate must not touch memory's overlay, and must not clobber the other mode's storage key", () => {
    switchMode("demo", demoRepoBundle);
    useMemoryStore.setState({ ...seedMemory(), status: "ready" });
    useMemoryStore.getState().forgetEntity(HUB_ENTITY_ID);
    const demoRaw = localStorage.getItem("tenka-studio-memory");
    expect(demoRaw).not.toBeNull();

    switchMode("live", demoRepoBundle); // the reset this triggers must not touch storage content

    // The in-memory overlay itself must survive the reset unchanged --
    // status/hasHydrated are the only fields switchMode() is allowed to
    // touch, and memory-store's own overlay field is untouched here.
    expect(useMemoryStore.getState().overlay.forgottenEntities).toEqual([HUB_ENTITY_ID]);
    // And the demo key on disk, written before the transition, must be
    // exactly what it was -- switchMode() must never write through to it.
    expect(localStorage.getItem("tenka-studio-memory")).toBe(demoRaw);
    // The live key must never have been touched by the reset either.
    expect(localStorage.getItem("tenka-studio-memory:live")).toBeNull();
  });
});

/**
 * The rot guard. resetLoadGates() lists the stores it resets by hand, and
 * that list has already gone stale once: system-store and personality-store
 * each grew a `status` gate in a later task and neither was added, so a
 * /demo -> /app navigation would have left demo seed data under live chrome.
 * Enumerating the stores by name in a test would rot in exactly the same way
 * and for exactly the same reason, so these two suites discover them instead:
 * the first from the filesystem (every module that calls zustand's `create<`
 * must be imported here), the second from the imported modules themselves
 * (every discovered store exposing a `status` must come back "idle").
 *
 * The failure mode this is designed for: someone adds `store/foo-store.ts`
 * with a one-shot `status` gate and forgets services/persist.ts. The first
 * suite fails on the unimported module; once they import it, the second
 * fails on the un-reset status. Neither can be satisfied by anything except
 * the fix.
 *
 * The second suite matches `status` AND any `<something>Status` key, which is
 * wider than it first was for a reason: system-store's telemetry slice grew its
 * own `telemetryStatus` gate -- separate precisely because telemetry has its
 * own transports and its own failure mode -- and a filter keyed on the literal
 * string "status" could not see it. This guard is described upstream as
 * "enforced, not just intended", so a gate it structurally cannot see is worse
 * than no guard at all.
 */
/** A one-shot load gate: `status`, or a slice-scoped `<name>Status`. */
const GATE_KEY = /^status$|Status$/;
type StoreLike = {
  getState: () => Record<string, unknown>;
  setState: (partial: Record<string, unknown>) => void;
  getInitialState: () => Record<string, unknown>;
};

function isStoreLike(value: unknown): value is StoreLike {
  return (
    typeof value === "function" &&
    typeof (value as Partial<StoreLike>).getState === "function" &&
    typeof (value as Partial<StoreLike>).setState === "function"
  );
}

/** Every `store/*.ts` module, keyed by filename, imported statically above --
 * `import.meta.glob` would need vite/client's ambient types, which this
 * project's tsconfig does not pull in, so the filesystem suite below is what
 * keeps this map honest instead. */
const IMPORTED_STORE_MODULES: Record<string, Record<string, unknown>> = {
  // Imported so the filesystem sweep below stays honest, but it carries no
  // load gate: auth-store's decision field is `phase` ("unknown" |
  // "authorized" | "unauthorized"), deliberately not named `status` and
  // deliberately never "idle". A mode switch must not reset it -- whether this
  // browser is authorised is the daemon's answer to GET /v1/session, not a
  // per-mode cache, and the live layout re-probes on mount anyway.
  "auth-store.ts": authStore,
  "chat-store.ts": chatStore,
  "demo-engine.ts": demoEngine,
  "file-store.ts": fileStore,
  "memory-store.ts": memoryStore,
  "personality-store.ts": personalityStore,
  "settings-store.ts": settingsStore,
  "system-store.ts": systemStore,
  "toast-store.ts": toastStore,
};

describe("resetLoadGates covers every store that has a load gate", () => {
  it("this file imports every module in store/ that creates a zustand store", () => {
    const storeDir = join(import.meta.dirname, "..", "store");
    const modulesThatCreateAStore = readdirSync(storeDir)
      .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
      .filter((name) => /\bcreate</.test(readFileSync(join(storeDir, name), "utf8")));

    // Non-vacuous: if this ever finds nothing, the sweep below proves nothing.
    expect(modulesThatCreateAStore.length).toBeGreaterThan(0);
    expect(modulesThatCreateAStore.sort()).toEqual(Object.keys(IMPORTED_STORE_MODULES).sort());
  });

  it("every discovered load gate -- `status` or any `*Status` -- is reset to idle by a mode switch", () => {
    const gated = Object.entries(IMPORTED_STORE_MODULES).flatMap(([file, module]) =>
      Object.entries(module)
        .filter(([, value]) => isStoreLike(value))
        .flatMap(([exportName, value]) => {
          const store = value as StoreLike;
          return Object.keys(store.getState())
            .filter((key) => GATE_KEY.test(key))
            .map((key) => ({ file, exportName, key, store }));
        }),
    );

    // Non-vacuous: memory/settings/files/system/personality all have `status`,
    // and system-store has `telemetryStatus` on top of it.
    expect(gated.length).toBeGreaterThanOrEqual(6);
    expect(gated.map(({ key }) => key)).toContain("telemetryStatus");

    switchMode("demo", demoRepoBundle);
    for (const { store, key } of gated) store.setState({ [key]: "ready" });

    switchMode("live", demoRepoBundle);

    const stillGated = gated
      .filter(({ store, key }) => store.getState()[key] !== "idle")
      .map(({ file, exportName, key }) => `${file} (${exportName}.${key})`);
    expect(stillGated).toEqual([]);

    for (const { store } of gated) store.setState(store.getInitialState());
    configureRepos("demo", demoRepoBundle);
  });
});
