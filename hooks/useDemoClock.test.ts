import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDemoClock } from "./useDemoClock";
import { useDemoStore } from "@/store/demo-engine";

describe("useDemoClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDemoStore.setState(useDemoStore.getInitialState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances the step after the scheduled delay", () => {
    renderHook(() => useDemoClock());
    expect(useDemoStore.getState().currentStepIndex).toBe(0);

    vi.advanceTimersByTime(3100); // beyond the max 3000ms delay
    expect(useDemoStore.getState().currentStepIndex).toBeGreaterThanOrEqual(1);
  });

  it("stops scheduling after unmount", () => {
    const advanceStepSpy = vi.spyOn(useDemoStore.getState(), "advanceStep");
    const jitterStatsSpy = vi.spyOn(useDemoStore.getState(), "jitterStats");

    const { unmount } = renderHook(() => useDemoClock());
    unmount();

    vi.advanceTimersByTime(10000);

    expect(advanceStepSpy).not.toHaveBeenCalled();
    expect(jitterStatsSpy).not.toHaveBeenCalled();
  });

  it("does not advance the scripted loop while a user task holds the slot", () => {
    useDemoStore.getState().startUserTask({
      id: "cmd-run-x",
      title: "Open VS Code",
      costUsd: 0,
      visionCalls: 0,
      steps: [
        { id: "s1", label: "one", stack: "LOCAL", status: "done" },
        { id: "s2", label: "two", stack: "APPS", status: "done" },
        { id: "s3", label: "three", stack: "APPS", status: "done" },
      ],
    });

    renderHook(() => useDemoClock());
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    // The clock ran many times but never touched the step cursor.
    expect(useDemoStore.getState().currentStepIndex).toBe(0);
    expect(useDemoStore.getState().userTask?.id).toBe("cmd-run-x");
  });

  it("stops advancing the scripted loop the moment a user task takes the slot mid-flight", () => {
    renderHook(() => useDemoClock());

    // One scripted tick with an empty slot, to prove the clock is live.
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    const afterScriptedTick = useDemoStore.getState().currentStepIndex;

    act(() => {
      useDemoStore.getState().startUserTask({
        id: "cmd-run-mid",
        title: "Open VS Code",
        costUsd: 0,
        visionCalls: 0,
        steps: [
          { id: "s1", label: "one", stack: "LOCAL", status: "done" },
          { id: "s2", label: "two", stack: "APPS", status: "done" },
          { id: "s3", label: "three", stack: "APPS", status: "done" },
        ],
      });
    });
    // startUserTask resets the cursor to 0; the clock must now leave it there.
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(afterScriptedTick).toBeGreaterThan(0);
    expect(useDemoStore.getState().currentStepIndex).toBe(0);
    expect(useDemoStore.getState().userTask?.id).toBe("cmd-run-mid");
  });
});
