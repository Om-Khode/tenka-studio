import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Toaster, TOAST_TIMEOUT_MS } from "./Toaster";
import { useToastStore } from "@/store/toast-store";

// framer-motion schedules its own animation frames, which fake timers turn
// into act() warnings. The component under test is the real one; only the
// animation layer is stubbed.
vi.mock("framer-motion", () => {
  const createStub = (tag: string) => {
    const Stub = ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => {
      // Drop motion-only props so React does not warn about unknown DOM attributes.
      const { layout, initial, animate, exit, transition, ...domProps } = props;
      void layout; void initial; void animate; void exit; void transition;
      return React.createElement(tag, domProps, children);
    };
    Stub.displayName = `motion.${tag}`;
    return Stub;
  };

  const AnimatePresenceStub = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  AnimatePresenceStub.displayName = "AnimatePresence";

  return {
    AnimatePresence: AnimatePresenceStub,
    motion: {
      div: createStub("div"),
    },
  };
});

describe("Toaster", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState(useToastStore.getInitialState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when the queue is empty", () => {
    render(<Toaster />);
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("renders a pushed toast with its title and detail", () => {
    render(<Toaster />);
    act(() => {
      useToastStore.getState().push({ ok: true, title: "Chrome opened", detail: "2 steps" });
    });
    expect(screen.getByText("Chrome opened")).toBeInTheDocument();
    expect(screen.getByText("2 steps")).toBeInTheDocument();
  });

  it("announces politely so a screen reader is not interrupted", () => {
    render(<Toaster />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("marks a failed toast distinctly from a successful one", () => {
    render(<Toaster />);
    act(() => {
      useToastStore.getState().push({ ok: false, title: "Chrome failed" });
    });
    expect(screen.getByTestId("toast")).toHaveAttribute("data-ok", "false");
  });

  it("auto-dismisses after the timeout", () => {
    render(<Toaster />);
    act(() => {
      useToastStore.getState().push({ ok: true, title: "gone soon" });
    });
    expect(screen.getByTestId("toast")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(TOAST_TIMEOUT_MS + 10);
    });
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("holds the toast open while the pointer is over it", () => {
    render(<Toaster />);
    act(() => {
      useToastStore.getState().push({ ok: true, title: "stay" });
    });
    fireEvent.mouseEnter(screen.getByTestId("toast"));
    act(() => {
      vi.advanceTimersByTime(TOAST_TIMEOUT_MS * 3);
    });
    expect(screen.getByTestId("toast")).toBeInTheDocument();
  });

  it("resumes the countdown when the pointer leaves", () => {
    render(<Toaster />);
    act(() => {
      useToastStore.getState().push({ ok: true, title: "stay then go" });
    });
    const toast = screen.getByTestId("toast");
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_TIMEOUT_MS * 3);
    });
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_TIMEOUT_MS + 10);
    });
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("dismisses on the close button", () => {
    render(<Toaster />);
    act(() => {
      useToastStore.getState().push({ ok: true, title: "close me" });
    });
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("renders an Undo button only when the result carries one, and dismisses after invoking it", () => {
    const undo = vi.fn();
    render(<Toaster />);
    act(() => {
      useToastStore.getState().push({ ok: true, title: "no undo here" });
    });
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();

    act(() => {
      useToastStore.getState().clear();
      useToastStore.getState().push({ ok: true, title: "Deleted notes.md", undo });
    });
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });
});
