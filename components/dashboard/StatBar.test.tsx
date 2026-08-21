import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { StatBar } from "./StatBar";
import { useDemoStore } from "@/store/demo-engine";

describe("StatBar", () => {
  beforeEach(() => {
    useDemoStore.setState(useDemoStore.getInitialState());
  });

  it("shows 0 tasks, 100% zero-vision, and $0.0000 spend on a fresh store", () => {
    render(<StatBar />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("$0.0000")).toBeInTheDocument();
  });

  it("computes zero-vision % from taskHistory's visionCalls field", () => {
    useDemoStore.setState({
      tasksCompletedToday: 2,
      spendTodayUsd: 0.0037,
      taskHistory: [
        { id: "a", title: "t1", stack: "VISION", visionCalls: 1, finishedAt: 1, ok: true },
        { id: "b", title: "t2", stack: "LOCAL", visionCalls: 0, finishedAt: 2, ok: true },
      ],
    });
    render(<StatBar />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
});
