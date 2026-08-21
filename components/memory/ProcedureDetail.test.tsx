import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ProcedureDetail } from "./ProcedureDetail";
import { useMemoryStore } from "@/store/memory-store";
import { useToastStore } from "@/store/toast-store";
import { seedMemory } from "@/store/memory-scripts";

describe("ProcedureDetail", () => {
  beforeEach(() => {
    useMemoryStore.setState({
      ...useMemoryStore.getInitialState(),
      ...seedMemory(),
      status: "ready",
    });
    useToastStore.setState(useToastStore.getInitialState());
  });

  it("numbers the taught steps in order", () => {
    render(<ProcedureDetail procedureId={1} />);
    const steps = screen.getAllByRole("listitem");
    expect(steps[0]).toHaveTextContent("open Chrome");
    expect(steps.at(-1)).toHaveTextContent("mute notifications");
  });

  it("shows how often she has run it", () => {
    render(<ProcedureDetail procedureId={1} />);
    expect(screen.getByText(/run 23 times/i)).toBeInTheDocument();
  });

  /**
   * The caption used to read "taught by voice · run N times" -- a literal, for
   * a `Procedure` that has no field saying how it was taught. A procedure typed
   * into Studio's own chat, or promoted from a learned manifest, read the same.
   * `taughtAt` is the one genuine provenance value on the row (and on
   * `ProcedureRecordPayload`), and it was fetched and then rendered nowhere.
   */
  it("dates the procedure from taughtAt instead of claiming how it was taught", () => {
    render(<ProcedureDetail procedureId={1} />);
    expect(screen.queryByText(/taught by voice/i)).not.toBeInTheDocument();
    // seedMemory()'s procedure 1 carries taughtAt = iso(7) = 2026-07-08.
    expect(screen.getByText(/taught 08 Jul/i)).toBeInTheDocument();
  });

  it("forgets behind a confirmation", () => {
    render(<ProcedureDetail procedureId={1} />);
    fireEvent.click(screen.getByRole("button", { name: /forget/i }));
    fireEvent.click(screen.getByRole("button", { name: /forget it/i }));
    expect(useMemoryStore.getState().overlay.forgottenProcedures).toContain(1);
  });
});
