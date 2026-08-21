import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { SaveBar } from "./SaveBar";
import { useSettingsStore, selectDirtyKeys } from "@/store/settings-store";
// Straight from the demo repository, not re-exported through the store: it is
// a demo fixture, and settings-store.ts is imported by the entire live tree.
import { REJECTED_KEY } from "@/services/repos/demo/settings";
import { useToastStore } from "@/store/toast-store";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import { ApiError } from "@/services/http";
import type { RepoBundle } from "@/services/repos/types";

describe("SaveBar", () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
    localStorage.clear();
  });

  it("stays out of the way when nothing is dirty", () => {
    render(<SaveBar />);
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("counts the dirty keys", () => {
    useSettingsStore.getState().setDraft("tts_speed", 1.4);
    useSettingsStore.getState().setDraft("wake_word_cooldown", 3);
    render(<SaveBar />);
    expect(screen.getByText(/2 unsaved/i)).toBeInTheDocument();
  });

  it("reverts every draft", () => {
    useSettingsStore.getState().setDraft("tts_speed", 1.4);
    render(<SaveBar />);
    fireEvent.click(screen.getByRole("button", { name: /revert/i }));
    expect(selectDirtyKeys(useSettingsStore.getState())).toEqual([]);
  });

  it("keeps the rejected key dirty and reports the partial result", async () => {
    useSettingsStore.getState().setDraft("tts_speed", 1.4);
    useSettingsStore.getState().setDraft(REJECTED_KEY, false);
    render(<SaveBar />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(selectDirtyKeys(useSettingsStore.getState())).toEqual([REJECTED_KEY]);
    });
    const toast = useToastStore.getState().toasts[0];
    expect(toast.ok).toBe(false);
    expect(toast.title).toMatch(/1 applied/i);
  });

  it("reports a clean save as a success", async () => {
    useSettingsStore.getState().setDraft("tts_speed", 1.4);
    render(<SaveBar />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.ok).toBe(true));
  });

  it("PROOF-OF-FAILURE (Milestone-4 blocker 3): catches a rejected save() and toasts failure instead of an unhandled rejection", async () => {
    const rejectingBundle: RepoBundle = {
      ...demoRepoBundle,
      settings: {
        load: demoRepoBundle.settings.load,
        save: async () => {
          throw new Error("simulated daemon failure");
        },
      },
    };
    configureRepos("demo", rejectingBundle);
    try {
      useSettingsStore.getState().setDraft("tts_speed", 1.4);
      render(<SaveBar />);
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await waitFor(() => expect(useToastStore.getState().toasts[0]?.ok).toBe(false), {
        timeout: 2000,
      });
    } finally {
      configureRepos("demo", demoRepoBundle);
    }
  });

  // PATCH /v1/settings is gated on system_control (routes/settings.py:61),
  // and this was the one destructive path that did not name its 403 --
  // memory's forget-all and enrolment's forget both do. Before the fix this
  // toasted "Could not save" with the daemon's raw string.
  it("names a 403 as a missing device grant rather than a generic save failure", async () => {
    const forbiddenBundle: RepoBundle = {
      ...demoRepoBundle,
      settings: {
        load: demoRepoBundle.settings.load,
        save: async () => {
          throw new ApiError(403, "forbidden");
        },
      },
    };
    configureRepos("demo", forbiddenBundle);
    try {
      useSettingsStore.getState().setDraft("tts_speed", 1.4);
      render(<SaveBar />);
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await waitFor(
        () => {
          expect(useToastStore.getState().toasts[0]?.title).toMatch(/this device may not do that/i);
        },
        { timeout: 2000 },
      );
      expect(useToastStore.getState().toasts[0]?.detail).not.toMatch(/forbidden/i);
    } finally {
      configureRepos("demo", demoRepoBundle);
    }
  });
});
