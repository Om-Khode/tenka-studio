import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DangerZone } from "./DangerZone";
import { useMemoryStore, selectVisibleEntities } from "@/store/memory-store";
import { useSettingsStore, effectiveValue } from "@/store/settings-store";
import { usePersonalityStore } from "@/store/personality-store";
import { useToastStore } from "@/store/toast-store";
import { seedMemory } from "@/store/memory-scripts";

// Only this describe block needs the layout: it reproduces the Critical fix
// (memory hydration + load() moved to app/demo/layout.tsx) end to end. The
// module-level mock is safe for every other test below -- they render
// <DangerZone /> directly and never call usePathname.
vi.mock("next/navigation", () => ({ usePathname: () => "/demo/settings" }));

import DemoLayout from "@/app/demo/layout";

function pressAndConfirm(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  fireEvent.click(screen.getByRole("button", { name: /do it/i }));
}

function pressAndCancel(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
}

describe("DangerZone", () => {
  beforeEach(() => {
    useMemoryStore.setState({
      ...useMemoryStore.getInitialState(),
      ...seedMemory(),
      status: "ready",
    });
    useSettingsStore.setState(useSettingsStore.getInitialState());
    usePersonalityStore.setState(usePersonalityStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
    localStorage.clear();
  });

  it("forgets everything she knows, and leaves settings untouched", async () => {
    useSettingsStore.getState().setDraft("tts_speed", 1.6);
    render(<DangerZone />);
    pressAndConfirm(/forget all memory/i);
    // The overlay applies optimistically and synchronously (memory-store.ts);
    // the toast is the eventual outcome of the repository call that follows
    // it, so only that needs a wait.
    expect(selectVisibleEntities(useMemoryStore.getState())).toHaveLength(0);
    await waitFor(() => {
      expect(useToastStore.getState().toasts[0]?.title).toMatch(/forgot everything/i);
    });
    // A mutant that also reset settings would wipe this draft.
    expect(effectiveValue(useSettingsStore.getState(), "tts_speed")).toBe(1.6);
  });

  it("resets the personality base only", async () => {
    // Stubbed at the store-action level, not through the real repository
    // singleton: personality-store.ts's reset() talks to whatever
    // PersonalityRepo is currently configured, and that repo instance is
    // shared across every test in this file -- stubbing here is what keeps
    // this test's outcome independent of what an earlier test did to it.
    const reset = vi.fn(async () => {});
    usePersonalityStore.setState({ reset });
    useSettingsStore.getState().setDraft("tts_speed", 1.6);
    render(<DangerZone />);
    pressAndConfirm(/reset personality/i);
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
    // A mutant that also reset settings would wipe this draft.
    expect(effectiveValue(useSettingsStore.getState(), "tts_speed")).toBe(1.6);
  });

  it("toasts instead of throwing when the personality reset rejects", async () => {
    const reset = vi.fn(async () => {
      throw new Error("could not reach the daemon");
    });
    usePersonalityStore.setState({ reset });
    render(<DangerZone />);
    pressAndConfirm(/reset personality/i);
    await waitFor(() => {
      expect(useToastStore.getState().toasts[0]?.title).toMatch(/could not reset personality/i);
    });
  });

  it("resets every setting, and leaves memory untouched", () => {
    useSettingsStore.getState().setDraft("tts_speed", 1.6);
    useSettingsStore.getState().setDraft("wake_word_cooldown", 9);
    render(<DangerZone />);
    pressAndConfirm(/reset all settings/i);
    // Two independent dirty keys: a component narrowed to resetKey() on
    // just one of them would leave the other behind. Demo's clear is
    // synchronous even though the action is async now -- an async function
    // runs to its first await, and demo's branch has none.
    expect(useSettingsStore.getState().overrides).toEqual({});
    expect(useSettingsStore.getState().drafts).toEqual({});
    // A mutant that also called forgetAll() would empty this.
    expect(selectVisibleEntities(useMemoryStore.getState()).length).toBeGreaterThan(0);
  });

  it("does nothing when any confirmation is cancelled", () => {
    const reset = vi.fn(async () => {});
    usePersonalityStore.setState({ reset });
    useSettingsStore.getState().setDraft("tts_speed", 1.6);
    render(<DangerZone />);

    pressAndCancel(/forget all memory/i);
    expect(selectVisibleEntities(useMemoryStore.getState()).length).toBeGreaterThan(0);

    pressAndCancel(/reset personality/i);
    expect(reset).not.toHaveBeenCalled();

    pressAndCancel(/reset all settings/i);
    expect(reset).not.toHaveBeenCalled();
    expect(effectiveValue(useSettingsStore.getState(), "tts_speed")).toBe(1.6);
  });

  it("forgets the REAL seeded data when the store was hydrated by the layout, not by ever visiting the Memory page", async () => {
    // Undo this file's beforeEach, which seeds via setState -- that bypasses
    // the exact wiring this test exists to prove. Start from a store that
    // has genuinely never loaded, same as a hard visit to /demo/settings.
    useMemoryStore.setState(useMemoryStore.getInitialState());

    // DemoLayout, not the Memory page: this is the fix for the Critical
    // finding -- useMemoryHydration() and the idle -> load() kick used to
    // live only on app/demo/memory/page.tsx, so DangerZone read an empty
    // `entities` array on every other route and forgetAll() wrote an EMPTY
    // overlay over any earlier session's real one.
    render(
      <DemoLayout>
        <DangerZone />
      </DemoLayout>,
    );

    await waitFor(
      () => {
        expect(selectVisibleEntities(useMemoryStore.getState()).length).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );

    const seededEntityIds = useMemoryStore.getState().entities.map((e) => e.id);
    const seededPreferenceKeys = useMemoryStore.getState().preferences.map((p) => p.key);
    const seededProcedureIds = useMemoryStore.getState().procedures.map((p) => p.id);
    expect(seededEntityIds.length).toBeGreaterThan(0);

    pressAndConfirm(/forget all memory/i);

    const overlay = useMemoryStore.getState().overlay;
    expect(overlay.forgottenEntities).toEqual(seededEntityIds);
    expect(overlay.forgottenPreferences).toEqual(seededPreferenceKeys);
    expect(overlay.forgottenProcedures).toEqual(seededProcedureIds);
  });

  it("Milestone-4 blocker 2: disables forget-all while memory hasn't finished loading, so a click cannot fire at all", () => {
    useMemoryStore.setState({ ...useMemoryStore.getInitialState(), status: "loading" });
    render(<DangerZone />);
    const button = screen.getByRole("button", { name: /forget all memory/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    // A disabled button's onClick never fires -- the confirm dialog must
    // never have opened, so there is no "do it" to find.
    expect(screen.queryByRole("button", { name: /do it/i })).not.toBeInTheDocument();
    expect(useMemoryStore.getState().overlay.forgottenEntities).toEqual([]);
  });

  it("surfaces a 403 from forget-all as a device-grant message, not a generic failure", async () => {
    const { configureRepos } = await import("@/services/repo-registry");
    const { demoRepoBundle } = await import("@/services/repos/demo");
    const { ApiError } = await import("@/services/http");
    configureRepos("demo", {
      ...demoRepoBundle,
      memory: {
        load: demoRepoBundle.memory.load,
        forget: demoRepoBundle.memory.forget,
        forgetAll: async () => {
          throw new ApiError(403, "forbidden");
        },
      },
    });
    try {
      render(<DangerZone />);
      pressAndConfirm(/forget all memory/i);
      await waitFor(() => {
        expect(useToastStore.getState().toasts[0]?.title).toMatch(/this device may not do that/i);
      });
      expect(useToastStore.getState().toasts[0]?.ok).toBe(false);
    } finally {
      configureRepos("demo", demoRepoBundle);
    }
  });
});

/**
 * Critical, milestone 5b fix round: "reset all settings" changed nothing in
 * live mode and toasted success anyway. `resetAll()` only cleared local
 * zustand state, and live that state is already empty for every key the
 * daemon knows -- reconcileOverrides drops an override the moment a load
 * states a value for its key. So the click wrote nothing, sent nothing, and
 * announced "Every value is back to its default." over a config file it had
 * not touched.
 */
describe("DangerZone's reset-all against a live daemon", () => {
  beforeEach(() => {
    useMemoryStore.setState({
      ...useMemoryStore.getInitialState(),
      ...seedMemory(),
      status: "ready",
    });
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
    localStorage.clear();
  });

  afterEach(async () => {
    const { configureRepos } = await import("@/services/repo-registry");
    const { demoRepoBundle } = await import("@/services/repos/demo");
    configureRepos("demo", demoRepoBundle);
    useSettingsStore.setState(useSettingsStore.getInitialState());
    localStorage.clear();
  });

  async function goLive(save: (patch: Record<string, unknown>) => Promise<unknown>) {
    const { configureRepos } = await import("@/services/repo-registry");
    const { demoRepoBundle } = await import("@/services/repos/demo");
    const { findSetting } = await import("@/store/settings-registry");
    configureRepos("live", {
      ...demoRepoBundle,
      settings: {
        load: async () => [
          { ...findSetting("tts_speed")!, value: 1.6 },
          // The setting whose own description is "speaker verification is
          // disabled -- anyone can issue commands". This is the value a user
          // clicking "reset all settings" is most likely trying to put back.
          { ...findSetting("listen_to_everyone")!, value: true },
        ],
        save: save as never,
      },
    });
    await useSettingsStore.getState().load();
  }

  it("actually sends the reset, and reports the daemon's own outcome", async () => {
    const save = vi.fn(async (patch: Record<string, unknown>) => ({
      applied: Object.keys(patch),
      failed: [],
      needsRestart: [],
    }));
    await goLive(save);
    render(<DangerZone />);

    pressAndConfirm(/reset all settings/i);

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toEqual({ tts_speed: 1, listen_to_everyone: false });
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.ok).toBe(true));
  });

  it("does not claim success when the daemon refused the change", async () => {
    const save = vi.fn(async () => {
      const { ApiError } = await import("@/services/http");
      throw new ApiError(403, "forbidden");
    });
    await goLive(save);
    render(<DangerZone />);

    pressAndConfirm(/reset all settings/i);

    await waitFor(() => {
      expect(useToastStore.getState().toasts[0]?.title).toMatch(/this device may not do that/i);
    });
    expect(useToastStore.getState().toasts[0]?.ok).toBe(false);
  });

  it("cannot be clicked at all while her settings have not loaded", async () => {
    const save = vi.fn();
    const { configureRepos } = await import("@/services/repo-registry");
    const { demoRepoBundle } = await import("@/services/repos/demo");
    configureRepos("live", {
      ...demoRepoBundle,
      settings: { load: async () => [], save: save as never },
    });
    useSettingsStore.setState({ status: "error" });
    render(<DangerZone />);

    const button = screen.getByRole("button", { name: /reset all settings/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(screen.queryByRole("button", { name: /do it/i })).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});

