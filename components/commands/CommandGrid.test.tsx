import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CommandGrid } from "./CommandGrid";
import { useDemoStore } from "@/store/demo-engine";
import { useToastStore } from "@/store/toast-store";

function card(label: string) {
  return screen.getByRole("button", { name: new RegExp(label, "i") });
}

describe("CommandGrid", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDemoStore.setState(useDemoStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders every command in the catalogue", () => {
    render(<CommandGrid />);
    expect(screen.getAllByTestId("command-card")).toHaveLength(6);
  });

  it("firing a stepped command puts it in the engine's slot", () => {
    render(<CommandGrid />);
    fireEvent.click(card("Open VS Code"));
    expect(useDemoStore.getState().userTask?.title).toBe("Open VS Code");
  });

  it("locks the other stepped commands while one runs", () => {
    render(<CommandGrid />);
    fireEvent.click(card("Open VS Code"));
    expect(card("Open Chrome")).toBeDisabled();
    expect(card("Lock PC")).toBeDisabled();
  });

  it("leaves the instant commands enabled while a stepped one runs", () => {
    render(<CommandGrid />);
    fireEvent.click(card("Open VS Code"));
    expect(card("Volume Up")).toBeEnabled();
  });

  it("toasts the new level when volume is nudged, without taking the slot", () => {
    render(<CommandGrid />);
    fireEvent.click(card("Volume Up"));
    expect(useDemoStore.getState().systemStats.volumePct).toBe(60);
    expect(useDemoStore.getState().userTask).toBeNull();
    expect(useToastStore.getState().toasts[0].title).toBe("Volume 60%");
  });

  it("volume stays spammable", () => {
    render(<CommandGrid />);
    fireEvent.click(card("Volume Up"));
    fireEvent.click(card("Volume Up"));
    fireEvent.click(card("Volume Up"));
    expect(useDemoStore.getState().systemStats.volumePct).toBe(80);
  });

  it("asks before running a guarded command", () => {
    render(<CommandGrid />);
    fireEvent.click(card("Lock PC"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(useDemoStore.getState().userTask).toBeNull();
  });

  it("runs the guarded command once confirmed", () => {
    render(<CommandGrid />);
    fireEvent.click(card("Lock PC"));
    fireEvent.click(screen.getByRole("button", { name: "lock it" }));
    expect(useDemoStore.getState().userTask?.title).toBe("Lock PC");
  });

  it("leaves no trace when a guarded command is cancelled", () => {
    render(<CommandGrid />);
    fireEvent.click(card("Lock PC"));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(useDemoStore.getState().userTask).toBeNull();
    expect(useDemoStore.getState().taskHistory).toHaveLength(0);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("toasts success once the run completes", () => {
    render(<CommandGrid />);
    fireEvent.click(card("Open VS Code"));
    act(() => {
      useDemoStore.getState().advanceStep();
      useDemoStore.getState().advanceStep();
    });
    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast?.ok).toBe(true);
    expect(toast?.title).toBe("Open VS Code");
  });

  it("toasts a failure when the run is aborted", () => {
    render(<CommandGrid />);
    fireEvent.click(card("Open VS Code"));
    act(() => {
      useDemoStore.getState().abortCurrentTask();
    });
    expect(useToastStore.getState().toasts.at(-1)?.ok).toBe(false);
  });

  it("raises no toast when the scripted autoplay loop completes a task while this page is mounted", () => {
    render(<CommandGrid />);

    // Nothing fired from the grid -- firedRunIdsRef stays empty. Drive the
    // Dashboard's scripted task straight to completion the same way
    // useDemoClock does (repeated advanceStep, no userTask involved), so
    // taskHistory gets a new entry this grid never asked for.
    act(() => {
      const steps = useDemoStore.getState().getCurrentTask().steps.length;
      for (let i = 0; i < steps; i++) {
        useDemoStore.getState().advanceStep();
      }
    });

    expect(useDemoStore.getState().taskHistory).toHaveLength(1);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
