import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useSettingsStore,
  effectiveValue,
  savedValue,
  selectDirtyKeys,
  selectVisibleDefs,
} from "./settings-store";
// From the demo repository, not re-exported through the store under test: the
// whole live tree imports settings-store.ts, and these are demo fixtures.
import { REJECTED_KEY, REJECTED_REASON } from "@/services/repos/demo/settings";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import { ApiError } from "@/services/http";
import { findSetting } from "@/store/settings-registry";
import type { RepoBundle } from "@/services/repos/types";
import type { SettingDef, SettingValue } from "@/types/settings";

function reset() {
  useSettingsStore.setState(useSettingsStore.getInitialState());
  localStorage.clear();
}

describe("settings-store", () => {
  beforeEach(reset);

  it("starts idle and reaches ready through loading", async () => {
    vi.useFakeTimers();
    const pending = useSettingsStore.getState().load();
    expect(useSettingsStore.getState().status).toBe("loading");
    await vi.runAllTimersAsync();
    await pending;
    expect(useSettingsStore.getState().status).toBe("ready");
    vi.useRealTimers();
  });

  it("reaches the error branch instead of hanging on loading forever when load's async work throws", async () => {
    // Same technique as memory-store.test.ts: a Promise executor that throws
    // synchronously auto-rejects the Promise, simulating the fetch() that
    // will eventually replace this scripted delay. The Storage stub keeps
    // the persist middleware's own setTimeout (the jsdom storage-event
    // dispatch) from racing for the same mock -- see that file's comment.
    const storageSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementationOnce(() => {
      throw new Error("simulated fetch failure");
    });

    try {
      await useSettingsStore.getState().load();
      expect(useSettingsStore.getState().status).toBe("error");
    } finally {
      timeoutSpy.mockRestore();
      storageSpy.mockRestore();
    }
  });

  it("falls back to the registry default when nothing overrides it", () => {
    expect(effectiveValue(useSettingsStore.getState(), "tts_speed")).toBe(1);
  });

  it("counts a draft as dirty only while it differs from the saved value", () => {
    useSettingsStore.getState().setDraft("tts_speed", 1.4);
    expect(selectDirtyKeys(useSettingsStore.getState())).toEqual(["tts_speed"]);
    useSettingsStore.getState().setDraft("tts_speed", 1);
    expect(selectDirtyKeys(useSettingsStore.getState())).toEqual([]);
  });

  it("applies the good keys and keeps the rejected one dirty", async () => {
    const store = useSettingsStore.getState();
    store.setDraft("tts_speed", 1.4);
    store.setDraft(REJECTED_KEY, false);

    const outcome = await useSettingsStore.getState().save();

    expect(outcome.applied).toEqual(["tts_speed"]);
    expect(outcome.failed).toEqual([{ key: REJECTED_KEY, reason: REJECTED_REASON }]);

    const after = useSettingsStore.getState();
    expect(savedValue(after, "tts_speed")).toBe(1.4);
    expect(selectDirtyKeys(after)).toEqual([REJECTED_KEY]);
    expect(after.errors[REJECTED_KEY]).toBe(REJECTED_REASON);
  });

  it("resets `saving` on the failure path, not just on success", async () => {
    useSettingsStore.getState().setDraft("tts_speed", 1.4);

    // Same technique as load()'s error test: a synchronously-throwing
    // Promise executor auto-rejects, simulating the PATCH /settings that
    // will eventually replace this scripted delay -- landing squarely inside
    // save()'s try, after `saving: true` is already set. The Storage stub
    // keeps persist's own setTimeout from racing for the same mock.
    const storageSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementationOnce(() => {
      throw new Error("simulated PATCH failure");
    });

    try {
      await expect(useSettingsStore.getState().save()).rejects.toThrow("simulated PATCH failure");
      // The finally must have run even though save() itself rejected.
      expect(useSettingsStore.getState().saving).toBe(false);
    } finally {
      timeoutSpy.mockRestore();
      storageSpy.mockRestore();
    }
  });

  it("reports restart-flagged keys only when they actually applied", async () => {
    useSettingsStore.getState().setDraft("wake_word_enabled", false); // needsRestart
    useSettingsStore.getState().setDraft("tts_speed", 1.2); // does not
    const outcome = await useSettingsStore.getState().save();
    expect(outcome.needsRestart).toEqual(["wake_word_enabled"]);
    expect(useSettingsStore.getState().pendingRestart).toEqual(["wake_word_enabled"]);
  });

  it("does not mark a restart pending for a rejected key", async () => {
    useSettingsStore.getState().setDraft(REJECTED_KEY, false); // camera_enabled needsRestart
    const outcome = await useSettingsStore.getState().save();
    expect(outcome.needsRestart).toEqual([]);
    expect(useSettingsStore.getState().pendingRestart).toEqual([]);
  });

  it("reverts every draft and its error", async () => {
    useSettingsStore.getState().setDraft(REJECTED_KEY, false);
    await useSettingsStore.getState().save();
    useSettingsStore.getState().revertAll();
    const s = useSettingsStore.getState();
    expect(selectDirtyKeys(s)).toEqual([]);
    expect(s.errors).toEqual({});
  });

  it("resets one key back to its registry default", async () => {
    useSettingsStore.getState().setDraft("tts_speed", 1.4);
    await useSettingsStore.getState().save();
    useSettingsStore.getState().resetKey("tts_speed");
    expect(effectiveValue(useSettingsStore.getState(), "tts_speed")).toBe(1);
  });

  it("resets everything at once", async () => {
    useSettingsStore.getState().setDraft("tts_speed", 1.4);
    await useSettingsStore.getState().save();
    const result = await useSettingsStore.getState().resetAllToDefaults();
    expect(useSettingsStore.getState().overrides).toEqual({});
    expect(result.ok).toBe(true);
  });

  it("dismisses a pending restart without touching anything else", async () => {
    useSettingsStore.getState().setDraft("wake_word_enabled", false); // needsRestart
    useSettingsStore.getState().setDraft("tts_speed", 1.4); // does not
    await useSettingsStore.getState().save();
    expect(useSettingsStore.getState().pendingRestart).toEqual(["wake_word_enabled"]);

    useSettingsStore.getState().dismissRestart();

    expect(useSettingsStore.getState().pendingRestart).toEqual([]);
    // Dismissing the banner is not the same as reverting the change.
    expect(effectiveValue(useSettingsStore.getState(), "wake_word_enabled")).toBe(false);
    expect(effectiveValue(useSettingsStore.getState(), "tts_speed")).toBe(1.4);
  });

  it("filters rows by query across every group", () => {
    useSettingsStore.setState({ query: "wake" });
    const defs = selectVisibleDefs(useSettingsStore.getState());
    expect(defs.length).toBeGreaterThan(0);
    expect(defs.every((d) => `${d.key} ${d.label} ${d.description}`.toLowerCase().includes("wake")))
      .toBe(true);
  });

  it("persists only the overrides", async () => {
    useSettingsStore.getState().setDraft("tts_speed", 1.4);
    await useSettingsStore.getState().save();
    const written = JSON.parse(localStorage.getItem("tenka-studio-settings") ?? "{}");
    expect(written.state).toEqual({ overrides: { tts_speed: 1.4 } });
  });
});

describe("settings-store's load()/save() actually go through the repository seam", () => {
  afterEach(() => {
    // Restore the module-load default -- every other test file that imports
    // settings-store.ts relies on it.
    configureRepos("demo", demoRepoBundle);
    reset();
  });

  it("save() applies the outcome the currently-configured repository returns, not the demo's own rejection", async () => {
    const stubBundle: RepoBundle = {
      ...demoRepoBundle,
      settings: {
        load: async () => [],
        save: async () => ({ applied: ["tts_speed"], failed: [], needsRestart: ["tts_speed"] }),
      },
    };
    configureRepos("demo", stubBundle);

    useSettingsStore.getState().setDraft("tts_speed", 1.8);
    const outcome = await useSettingsStore.getState().save();

    expect(outcome).toEqual({ applied: ["tts_speed"], failed: [], needsRestart: ["tts_speed"] });
    expect(savedValue(useSettingsStore.getState(), "tts_speed")).toBe(1.8);
    expect(useSettingsStore.getState().pendingRestart).toEqual(["tts_speed"]);
  });

  it("load() reaches the error branch when the repository rejects", async () => {
    const stubBundle: RepoBundle = {
      ...demoRepoBundle,
      settings: {
        load: async () => {
          throw new Error("simulated repository failure");
        },
        save: demoRepoBundle.settings.save,
      },
    };
    configureRepos("demo", stubBundle);

    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().status).toBe("error");
  });

  // Fix round: TENKA's settings change out of band (a voice phrase, `/set`,
  // another Studio tab), so a local override from an earlier save must not
  // outvote a fresh daemon value forever -- that is exactly "shows a value
  // the assistant is not using," indefinitely, looking clean rather than
  // dirty.
  it("a fresh load() drops a stale override once the daemon states its own value for that key", async () => {
    const savingBundle: RepoBundle = {
      ...demoRepoBundle,
      settings: {
        load: async () => [],
        save: async () => ({ applied: ["tts_speed"], failed: [], needsRestart: [] }),
      },
    };
    configureRepos("demo", savingBundle);
    useSettingsStore.getState().setDraft("tts_speed", 1.4);
    await useSettingsStore.getState().save();
    expect(useSettingsStore.getState().overrides.tts_speed).toBe(1.4);

    // She changed it herself in the meantime -- the next load() reports 1.1.
    const freshLoadBundle: RepoBundle = {
      ...demoRepoBundle,
      settings: {
        load: async () => [{ ...findSetting("tts_speed")!, value: 1.1 }],
        save: savingBundle.settings.save,
      },
    };
    configureRepos("demo", freshLoadBundle);

    await useSettingsStore.getState().load();

    expect(savedValue(useSettingsStore.getState(), "tts_speed")).toBe(1.1);
    expect(useSettingsStore.getState().overrides.tts_speed).toBeUndefined();
  });

  it("does not touch overrides for a key the fresh load has no stated value for (demo's registry-only defs)", async () => {
    const savingBundle: RepoBundle = {
      ...demoRepoBundle,
      settings: {
        load: async () => [],
        save: async () => ({ applied: ["tts_speed"], failed: [], needsRestart: [] }),
      },
    };
    configureRepos("demo", savingBundle);
    useSettingsStore.getState().setDraft("tts_speed", 1.4);
    await useSettingsStore.getState().save();

    // Demo's own repository, unmodified: its defs never set `value` at all.
    configureRepos("demo", demoRepoBundle);
    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().overrides.tts_speed).toBe(1.4);
    expect(savedValue(useSettingsStore.getState(), "tts_speed")).toBe(1.4);
  });
});

/**
 * Critical, milestone 5b fix round: "reset all settings" changed nothing in
 * live mode and reported success.
 *
 * Every test below fails against the pre-fix store, which was
 * `set({ overrides: {}, drafts: {}, errors: {} })` -- and live, after any
 * load(), `overrides` is ALREADY empty for every daemon-known key, because
 * reconcileOverrides drops an override the moment a def states a value. So
 * the old implementation cleared an empty map, sent nothing, and DangerZone
 * announced "Every value is back to its default."
 */
describe("resetAllToDefaults in live mode", () => {
  /** Two keys the daemon holds off-default, one already at its default. */
  const LIVE_DEFS: SettingDef[] = [
    { ...findSetting("tts_speed")!, value: 1.6 },
    { ...findSetting("listen_to_everyone")!, value: true },
    { ...findSetting("assistant_name")!, value: "TENKA" },
  ];

  function liveWith(save: RepoBundle["settings"]["save"]): void {
    configureRepos("live", {
      ...demoRepoBundle,
      settings: { load: async () => LIVE_DEFS, save },
    });
  }

  beforeEach(reset);

  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    reset();
  });

  it("PATCHes every off-default key back to its default, rather than clearing an already-empty overrides map", async () => {
    const save = vi.fn(async (patch: Record<string, unknown>) => ({
      applied: Object.keys(patch),
      failed: [],
      needsRestart: [],
    }));
    liveWith(save as unknown as RepoBundle["settings"]["save"]);
    await useSettingsStore.getState().load();
    // The state the pre-fix implementation would have "reset": nothing.
    expect(useSettingsStore.getState().overrides).toEqual({});

    const result = await useSettingsStore.getState().resetAllToDefaults();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ tts_speed: 1, listen_to_everyone: false });
    expect(result.ok).toBe(true);
    // assistant_name was already its default -- resending it would have been
    // a write nobody asked for.
    expect(save.mock.calls[0][0]).not.toHaveProperty("assistant_name");
    // And the rows now read as their defaults, so the per-row reset button
    // stops offering itself and a second reset-all sends nothing.
    expect(savedValue(useSettingsStore.getState(), "tts_speed")).toBe(1);
    expect(savedValue(useSettingsStore.getState(), "listen_to_everyone")).toBe(false);
  });

  it("reports a partial refusal as a failure, with the daemon's reason, instead of a blanket success", async () => {
    liveWith(async () => ({
      applied: ["tts_speed"],
      failed: [{ key: "listen_to_everyone", reason: "held open by the voice loop" }],
      needsRestart: [],
    }));
    await useSettingsStore.getState().load();

    const result = await useSettingsStore.getState().resetAllToDefaults();

    expect(result.ok).toBe(false);
    expect(result.title).toMatch(/1 reset, 1 refused/i);
    expect(result.detail).toMatch(/voice loop/i);
    // The refused key keeps the daemon's value AND carries its reason on the
    // row; only the applied one moved.
    expect(savedValue(useSettingsStore.getState(), "listen_to_everyone")).toBe(true);
    expect(useSettingsStore.getState().errors.listen_to_everyone).toMatch(/voice loop/i);
    expect(savedValue(useSettingsStore.getState(), "tts_speed")).toBe(1);
  });

  it("refuses outright when the settings never loaded, rather than reporting a reset of the seeded registry", async () => {
    const save = vi.fn();
    liveWith(save as unknown as RepoBundle["settings"]["save"]);
    // status stays "idle": `defs` is the static registry, whose rows carry
    // no stated value at all.
    const result = await useSettingsStore.getState().resetAllToDefaults();

    expect(result.ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("names a 403 as a missing device grant -- PATCH /v1/settings needs system_control", async () => {
    liveWith(async () => {
      throw new ApiError(403, "forbidden");
    });
    await useSettingsStore.getState().load();

    const result = await useSettingsStore.getState().resetAllToDefaults();

    expect(result.ok).toBe(false);
    expect(result.title).toMatch(/this device may not do that/i);
    expect(useSettingsStore.getState().saving).toBe(false);
  });

  it("leaves an env-owned row alone and says so, rather than sending a change the assistant will not take", async () => {
    const save = vi.fn(async (patch: Record<string, unknown>) => ({
      applied: Object.keys(patch),
      failed: [],
      needsRestart: [],
    }));
    const ENV_LOCKED = findSetting("vocal_casual_language")!; // source: "env"
    configureRepos("live", {
      ...demoRepoBundle,
      settings: {
        load: async () => [
          { ...findSetting("tts_speed")!, value: 1.6 },
          { ...ENV_LOCKED, value: true },
        ],
        save: save as unknown as RepoBundle["settings"]["save"],
      },
    });
    await useSettingsStore.getState().load();

    const result = await useSettingsStore.getState().resetAllToDefaults();

    expect(save.mock.calls[0][0]).not.toHaveProperty(ENV_LOCKED.key);
    expect(result.detail).toMatch(/environment/i);
  });

  it("Important: resetKey stages the default for a daemon-owned key, instead of deleting an override that is already gone", async () => {
    const save = vi.fn(async (patch: Record<string, unknown>) => ({
      applied: Object.keys(patch),
      failed: [],
      needsRestart: [],
    }));
    liveWith(save as unknown as RepoBundle["settings"]["save"]);
    await useSettingsStore.getState().load();

    useSettingsStore.getState().resetKey("tts_speed");

    // Pre-fix this left the store byte-identical: the override was already
    // absent, so the row snapped to the daemon's 1.6 and nothing was dirty.
    expect(selectDirtyKeys(useSettingsStore.getState())).toEqual(["tts_speed"]);
    expect(effectiveValue(useSettingsStore.getState(), "tts_speed")).toBe(1);

    await useSettingsStore.getState().save();
    expect(save.mock.calls[0][0]).toEqual({ tts_speed: 1 });
  });
});

describe("reset-all does not sever its own connection", () => {
  it("leaves studio_api_* alone while resetting everything else", async () => {
    // Observed on the real daemon 2026-08-10: a Danger Zone reset wrote
    // studio_api_enabled = false, switching off the very daemon the request
    // travelled over. The reset succeeded and no further request could be
    // made. It only kept working because a second bug made .env win at boot.
    const patches: Record<string, SettingValue>[] = [];
    const base = {
      group: "Studio",
      description: "",
      needsRestart: true,
      source: "db" as const,
    };
    const defs: SettingDef[] = [
      {
        ...base,
        key: "studio_api_enabled",
        label: "studio api enabled",
        kind: "toggle",
        default: false,
        value: true,
      },
      {
        ...base,
        key: "studio_api_port",
        label: "studio api port",
        kind: "number",
        default: 8787,
        value: 8788,
      },
      { ...findSetting("tts_speed")!, value: 1.4 },
    ];

    configureRepos("live", {
      ...demoRepoBundle,
      settings: {
        load: async () => defs,
        save: async (patch) => {
          patches.push(patch);
          return { applied: Object.keys(patch), failed: [], needsRestart: [] };
        },
      },
    });

    useSettingsStore.setState({ status: "ready", defs, overrides: {}, drafts: {}, errors: {} });
    await useSettingsStore.getState().resetAllToDefaults();

    expect(patches).toHaveLength(1);
    expect(Object.keys(patches[0])).toEqual(["tts_speed"]);
    expect(patches[0]).not.toHaveProperty("studio_api_enabled");
    expect(patches[0]).not.toHaveProperty("studio_api_port");
  });
});
