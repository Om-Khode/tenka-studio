import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CardSkeletonGate } from "./CardSkeletonGate";

describe("CardSkeletonGate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders a skeleton first, then swaps to children after delayMs", () => {
    render(
      <CardSkeletonGate delayMs={400}>
        <p>real content</p>
      </CardSkeletonGate>
    );
    expect(screen.queryByText("real content")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText("real content")).toBeInTheDocument();
  });

  it("defaults delayMs to 400 when not provided", () => {
    render(
      <CardSkeletonGate>
        <p>real content</p>
      </CardSkeletonGate>
    );
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(screen.queryByText("real content")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText("real content")).toBeInTheDocument();
  });
});
