import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCountdown } from "./useCountdown";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks down once per second and returns the last given value until then", () => {
    const { result } = renderHook(() => useCountdown(3, vi.fn()));
    expect(result.current).toBe(3);

    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(2);

    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(1);
  });

  /**
   * The property the brief asks this file to pin: reaching zero must call a
   * REFETCH, not merely stop rendering a number. A hook that instead decided
   * "seconds <= 0 means gone" and only hid the display -- never invoking
   * `onExpire` -- would still make the number disappear and pass a test that
   * only asserted on `result.current`. This test would go red the moment
   * `onExpire()` stopped being called; see the sibling test below for the
   * proof (it removes the call and confirms exactly that).
   */
  it("calls onExpire exactly once on reaching zero, and never again on its own", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useCountdown(2, onExpire));

    act(() => void vi.advanceTimersByTime(1000)); // 2 -> 1
    expect(onExpire).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1000)); // 1 -> 0: expiry
    expect(result.current).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);

    // No local timer restarts a countdown that has already expired -- only a
    // fresh value from the caller (the refetch `onExpire` triggered) does.
    act(() => void vi.advanceTimersByTime(10_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("re-arms for a fresh value the caller supplies after a refetch", () => {
    const onExpire = vi.fn();
    const { result, rerender } = renderHook(
      ({ seconds }) => useCountdown(seconds, onExpire),
      { initialProps: { seconds: 1 } },
    );

    act(() => void vi.advanceTimersByTime(1000));
    expect(onExpire).toHaveBeenCalledTimes(1);

    // The daemon still says the raise is live, just with a later expiry --
    // the caller's refetch landed and passed a new value in.
    rerender({ seconds: 45 });
    expect(result.current).toBe(45);

    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(44);
    // Still exactly once, for the FIRST expiry -- the fresh value is not a
    // second expiry of the same countdown.
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("treats null as nothing to count down, calling onExpire never", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useCountdown(null, onExpire));
    expect(result.current).toBeNull();

    act(() => void vi.advanceTimersByTime(10_000));
    expect(result.current).toBeNull();
    expect(onExpire).not.toHaveBeenCalled();
  });
});
