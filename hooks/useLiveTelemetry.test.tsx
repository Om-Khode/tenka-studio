import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLiveTelemetry, __resetTelemetryPollForTests } from "./useLiveTelemetry";
import { configureRepos } from "@/services/repo-registry";
import { liveRepoBundle } from "@/services/repos/http";
import { demoRepoBundle } from "@/services/repos/demo";
import { useSystemStore } from "@/store/system-store";
import type { TelemetrySnapshot } from "@/types/system";

const POLL_MS = 5000;

const A_READING: TelemetrySnapshot = {
  cpuPercent: 41,
  ramPercent: 62,
  batteryPercent: 87,
  activeModel: "gemini-flash-lite",
  uptimeSeconds: 3600,
};

/**
 * /app mounts this hook twice -- LiveSystemMetersCard and LiveActiveModelCard
 * both read the one telemetry slice. That is the shape every test here is
 * about: the hook's cadence must be a property of the app, not of how many
 * components happen to render it.
 */
describe("useLiveTelemetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    configureRepos("live", liveRepoBundle);
    useSystemStore.setState({
      telemetry: null,
      telemetryStatus: "idle",
      telemetryAt: null,
      telemetryMisses: 0,
    });
  });

  afterEach(() => {
    __resetTelemetryPollForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
    configureRepos("demo", demoRepoBundle);
  });

  it("PROOF-OF-FAILURE: two mounted cards share ONE poll loop, not one each", async () => {
    const spy = vi.spyOn(liveRepoBundle.system, "getTelemetry").mockResolvedValue(A_READING);

    // The two dashboard cards, both reading the same slice.
    const first = renderHook(() => useLiveTelemetry());
    const second = renderHook(() => useLiveTelemetry());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // One fetch for the initial tick, not two.
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(spy).toHaveBeenCalledTimes(2);

    first.unmount();
    second.unmount();
  });

  it("PROOF-OF-FAILURE: a miss counts once per interval however many cards are mounted", async () => {
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockRejectedValue(new Error("offline"));

    const first = renderHook(() => useLiveTelemetry());
    const second = renderHook(() => useLiveTelemetry());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // With a loop per mount this was 2 -- so TELEMETRY_STALE_AFTER_MISSES = 3
    // fired after ~7.5s rather than the ~15s its own doc claims, and the
    // threshold's meaning shifted every time a card was added to /app.
    expect(useSystemStore.getState().telemetryMisses).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(useSystemStore.getState().telemetryMisses).toBe(2);

    first.unmount();
    second.unmount();
  });

  it("stops polling once the last subscriber unmounts, and not before", async () => {
    const spy = vi.spyOn(liveRepoBundle.system, "getTelemetry").mockResolvedValue(A_READING);

    const first = renderHook(() => useLiveTelemetry());
    const second = renderHook(() => useLiveTelemetry());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // One card leaving must not stop the other card's meters.
    first.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(spy).toHaveBeenCalledTimes(2);

    second.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("PROOF-OF-FAILURE: a slow poll cannot overwrite a socket frame that landed while it was in flight", async () => {
    // The poll asks at T and the daemon takes 3s to answer. A `telemetry`
    // socket frame lands at T+2s in the meantime. Before this fix the poll's
    // answer overwrote it and stamped itself `Date.now()`, so the meter stepped
    // backwards to a three-second-old sample AND called it current.
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ...A_READING, cpuPercent: 12 }), 3000);
        }),
    );

    const { unmount } = renderHook(() => useLiveTelemetry());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      // hooks/useEventStream.ts's writer, with no issuedAt of its own.
      useSystemStore.getState().setTelemetry({ ...A_READING, cpuPercent: 74 });
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(useSystemStore.getState().telemetry?.cpuPercent).toBe(74);

    unmount();
  });

  it("seeds the slice from the poll when nothing else has written it", async () => {
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockResolvedValue(A_READING);

    const { result, unmount } = renderHook(() => useLiveTelemetry());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.data).toEqual(A_READING);
    expect(result.current.stale).toBe(false);

    unmount();
  });
});
