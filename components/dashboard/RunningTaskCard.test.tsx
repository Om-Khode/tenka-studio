import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { RunningTaskCard } from "./RunningTaskCard";
import { useDemoStore } from "@/store/demo-engine";

describe("RunningTaskCard", () => {
  beforeEach(() => {
    useDemoStore.setState(useDemoStore.getInitialState());
  });

  it("renders the current task title and all of its steps", () => {
    render(<RunningTaskCard />);
    expect(screen.getByText(/Play Bohemian Rhapsody on Spotify/)).toBeInTheDocument();
    expect(screen.getByText(/resolve intent/)).toBeInTheDocument();
    expect(screen.getByText(/spotify web player/)).toBeInTheDocument();
  });

  it("shows the tool-stack tag for each step", () => {
    render(<RunningTaskCard />);
    expect(screen.getByText("BROWSER")).toBeInTheDocument();
    expect(screen.getByText("APPS")).toBeInTheDocument();
  });

  it("renders the failed step's status marker in --fail color once reached, done steps in --moss", () => {
    useDemoStore.getState().advanceStep(); // reach step index 1 (s2, "failed")
    render(<RunningTaskCard />);
    // scripted task 0 (Spotify): step s1 is "done", step s2 is "failed"
    expect(screen.getByTestId("status-s1").className).toContain("text-moss");
    expect(screen.getByTestId("status-s2").className).toContain("text-fail");
  });

  it("abort button calls abortCurrentTask", () => {
    render(<RunningTaskCard />);
    fireEvent.click(screen.getByRole("button", { name: /abort/i }));
    expect(useDemoStore.getState().taskHistory).toHaveLength(1);
  });

  it("does not leak unreached step's pre-assigned status (s2 status:failed renders neutral at initial state)", () => {
    // At initial state: currentStepIndex=0, so only s1 is "reached"
    // s2 has status:"failed" baked into SCRIPTED_TASKS but should render as unreached (○, text-bone-ghost)
    render(<RunningTaskCard />);
    const s2Status = screen.getByTestId("status-s2");
    // Unreached step must NOT show fail color or fail mark, even though it has status:"failed"
    expect(s2Status.className).toContain("text-bone-ghost");
    expect(s2Status.textContent).toBe("○");
  });

  it("marks only the currently-executing step as current (data-current), distinguishing it from resolved and unreached steps", () => {
    render(<RunningTaskCard />);
    // Initial state: currentStepIndex=0 → s1 is the currently-executing step.
    expect(screen.getByTestId("status-s1")).toHaveAttribute("data-current", "true");
    expect(screen.getByTestId("status-s2")).not.toHaveAttribute("data-current");
    expect(screen.getByTestId("status-s3")).not.toHaveAttribute("data-current");
  });

  it("moves the current-step marker forward as the task advances", () => {
    useDemoStore.getState().advanceStep(); // currentStepIndex=1 → s2 is now current
    render(<RunningTaskCard />);
    expect(screen.getByTestId("status-s1")).not.toHaveAttribute("data-current");
    expect(screen.getByTestId("status-s2")).toHaveAttribute("data-current", "true");
  });
});
