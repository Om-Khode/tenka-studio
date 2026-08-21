import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCommandRun, COMMAND_STEP_MS } from "./useCommandRun";
import { useDemoStore } from "@/store/demo-engine";
import { useFileStore } from "@/store/file-store";
import { COMMANDS, toDemoTask, SCREENSHOT_COMMAND_ID } from "@/store/command-catalogue";

const threeStepTask = {
  id: "cmd-run-1",
  title: "Open Chrome",
  costUsd: 0.001,
  visionCalls: 0,
  steps: [
    { id: "s1", label: "one", stack: "LOCAL" as const, status: "done" as const },
    { id: "s2", label: "two", stack: "APPS" as const, status: "failed" as const },
    { id: "s3", label: "three", stack: "APPS" as const, status: "done" as const },
  ],
};

describe("useCommandRun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDemoStore.setState(useDemoStore.getInitialState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing while the slot is empty", () => {
    renderHook(() => useCommandRun());
    act(() => {
      vi.advanceTimersByTime(COMMAND_STEP_MS * 5);
    });
    expect(useDemoStore.getState().currentStepIndex).toBe(0);
    expect(useDemoStore.getState().taskHistory).toHaveLength(0);
  });

  it("advances one step per tick once a task is in the slot", () => {
    renderHook(() => useCommandRun());
    act(() => {
      useDemoStore.getState().startUserTask(threeStepTask);
    });
    act(() => {
      vi.advanceTimersByTime(COMMAND_STEP_MS + 10);
    });
    expect(useDemoStore.getState().currentStepIndex).toBe(1);
  });

  it("runs the task to completion and frees the slot", () => {
    renderHook(() => useCommandRun());
    act(() => {
      useDemoStore.getState().startUserTask(threeStepTask);
    });
    act(() => {
      vi.advanceTimersByTime(COMMAND_STEP_MS * 4);
    });
    expect(useDemoStore.getState().userTask).toBeNull();
    expect(useDemoStore.getState().taskHistory[0].title).toBe("Open Chrome");
  });

  it("stops advancing once the task has finished", () => {
    renderHook(() => useCommandRun());
    act(() => {
      useDemoStore.getState().startUserTask(threeStepTask);
    });
    act(() => {
      vi.advanceTimersByTime(COMMAND_STEP_MS * 10);
    });
    expect(useDemoStore.getState().taskHistory).toHaveLength(1);
  });

  it("clears its timer on unmount so a stray tick cannot fire", () => {
    const { unmount } = renderHook(() => useCommandRun());
    act(() => {
      useDemoStore.getState().startUserTask(threeStepTask);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(COMMAND_STEP_MS * 5);
    });
    expect(useDemoStore.getState().currentStepIndex).toBe(0);
  });

  describe("screenshot artifact", () => {
    beforeEach(() => {
      useFileStore.setState(useFileStore.getInitialState());
    });

    function screenshotTask() {
      const def = COMMANDS.find((c) => c.id === SCREENSHOT_COMMAND_ID)!;
      return toDemoTask(def);
    }

    it("writes a file into Desktop when the screenshot command completes", () => {
      renderHook(() => useCommandRun());
      act(() => {
        useDemoStore.getState().startUserTask(screenshotTask());
      });
      act(() => {
        vi.advanceTimersByTime(COMMAND_STEP_MS * 4);
      });

      const desktop = useFileStore.getState().entriesByDir.desktop;
      expect(desktop.some((n) => /^screenshot-\d+\.svg$/.test(n.name))).toBe(true);
    });

    it("numbers successive screenshots instead of overwriting", () => {
      renderHook(() => useCommandRun());
      for (let i = 0; i < 2; i++) {
        act(() => {
          useDemoStore.getState().startUserTask(screenshotTask());
        });
        act(() => {
          vi.advanceTimersByTime(COMMAND_STEP_MS * 4);
        });
      }
      const shots = useFileStore
        .getState()
        .entriesByDir.desktop.filter((n) => n.name.startsWith("screenshot-"));
      expect(shots).toHaveLength(2);
      expect(new Set(shots.map((n) => n.id)).size).toBe(2);
    });

    it("mints a distinct id for the next capture even after the previous one was renamed", () => {
      renderHook(() => useCommandRun());
      act(() => {
        useDemoStore.getState().startUserTask(screenshotTask());
      });
      act(() => {
        vi.advanceTimersByTime(COMMAND_STEP_MS * 4);
      });
      const first = useFileStore
        .getState()
        .entriesByDir.desktop.find((n) => n.name.startsWith("screenshot-"))!;

      // Rename does not touch the id -- counting by name would now see zero
      // "screenshot-" names and mint the same id again.
      useFileStore.getState().rename(first.id, "shot.svg");

      act(() => {
        useDemoStore.getState().startUserTask(screenshotTask());
      });
      act(() => {
        vi.advanceTimersByTime(COMMAND_STEP_MS * 4);
      });

      const ids = useFileStore
        .getState()
        .overlay.created.filter((n) => n.id.startsWith("desktop/screenshot-"))
        .map((n) => n.id);
      expect(new Set(ids).size).toBe(2);
    });

    it("mints a distinct id for the next capture even after the previous one was deleted", () => {
      renderHook(() => useCommandRun());
      act(() => {
        useDemoStore.getState().startUserTask(screenshotTask());
      });
      act(() => {
        vi.advanceTimersByTime(COMMAND_STEP_MS * 4);
      });
      const first = useFileStore
        .getState()
        .entriesByDir.desktop.find((n) => n.name.startsWith("screenshot-"))!;

      useFileStore.getState().remove(first.id);

      act(() => {
        useDemoStore.getState().startUserTask(screenshotTask());
      });
      act(() => {
        vi.advanceTimersByTime(COMMAND_STEP_MS * 4);
      });

      const visible = useFileStore
        .getState()
        .entriesByDir.desktop.filter((n) => n.name.startsWith("screenshot-"));
      expect(visible).toHaveLength(1);
      expect(visible[0].id).not.toBe(first.id);
    });

    it("gives the artifact renderable image content", () => {
      renderHook(() => useCommandRun());
      act(() => {
        useDemoStore.getState().startUserTask(screenshotTask());
      });
      act(() => {
        vi.advanceTimersByTime(COMMAND_STEP_MS * 4);
      });
      const shot = useFileStore
        .getState()
        .entriesByDir.desktop.find((n) => n.name.startsWith("screenshot-"))!;
      expect(shot.contentKind).toBe("image");
      expect(shot.content).toContain("data:image/svg+xml");
    });

    it("writes nothing when the screenshot is aborted before the first tick fires", () => {
      renderHook(() => useCommandRun());
      act(() => {
        useDemoStore.getState().startUserTask(screenshotTask());
      });
      act(() => {
        useDemoStore.getState().abortCurrentTask();
      });
      // No load() ran in this test -- entriesByDir.desktop stays undefined
      // (not an empty array) until something actually fetches or creates
      // into that directory.
      const desktop = useFileStore.getState().entriesByDir.desktop ?? [];
      expect(desktop.some((n) => n.name.startsWith("screenshot-"))).toBe(false);
    });

    it("writes nothing when a screenshot is aborted mid-sequence", () => {
      renderHook(() => useCommandRun());
      act(() => {
        useDemoStore.getState().startUserTask(screenshotTask());
      });
      // Let the chain get going — this is what the immediate-abort test above
      // never exercises, since its abort tears down the timer before it fires.
      act(() => {
        vi.advanceTimersByTime(COMMAND_STEP_MS + 10);
      });
      expect(useDemoStore.getState().currentStepIndex).toBeGreaterThan(0);

      act(() => {
        useDemoStore.getState().abortCurrentTask();
      });
      act(() => {
        vi.advanceTimersByTime(COMMAND_STEP_MS * 6);
      });

      // No load() ran in this test -- entriesByDir.desktop stays undefined
      // (not an empty array) until something actually fetches or creates
      // into that directory.
      const desktop = useFileStore.getState().entriesByDir.desktop ?? [];
      expect(desktop.some((n) => n.name.startsWith("screenshot-"))).toBe(false);
    });

    it("writes the capture only on the tick that completes the run, not a tick early", () => {
      renderHook(() => useCommandRun());
      const task = screenshotTask();
      act(() => {
        useDemoStore.getState().startUserTask(task);
      });

      const shots = () =>
        (useFileStore.getState().entriesByDir.desktop ?? []).filter((n) =>
          n.name.startsWith("screenshot-"),
        ).length;

      // One tick per step; nothing may be written before the last one lands.
      for (let i = 0; i < task.steps.length - 1; i++) {
        act(() => {
          vi.advanceTimersByTime(COMMAND_STEP_MS + 10);
        });
        expect(shots()).toBe(0);
      }

      act(() => {
        vi.advanceTimersByTime(COMMAND_STEP_MS + 10);
      });
      expect(shots()).toBe(1);
    });

    it("writes nothing for a non-screenshot command", () => {
      renderHook(() => useCommandRun());
      const def = COMMANDS.find((c) => c.id === "open-vscode")!;
      act(() => {
        useDemoStore.getState().startUserTask(toDemoTask(def));
      });
      act(() => {
        vi.advanceTimersByTime(COMMAND_STEP_MS * 4);
      });
      // No load() ran in this test -- entriesByDir.desktop stays undefined
      // (not an empty array) until something actually fetches or creates
      // into that directory.
      const desktop = useFileStore.getState().entriesByDir.desktop ?? [];
      expect(desktop.some((n) => n.name.startsWith("screenshot-"))).toBe(false);
    });
  });
});
