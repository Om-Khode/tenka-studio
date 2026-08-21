import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryToolbar } from "./MemoryToolbar";
import { useMemoryStore } from "@/store/memory-store";
import { seedMemory } from "@/store/memory-scripts";

describe("MemoryToolbar", () => {
  beforeEach(() => {
    useMemoryStore.setState({ ...useMemoryStore.getInitialState(), ...seedMemory(), status: "ready" });
  });

  it("writes the query into the store", () => {
    render(<MemoryToolbar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pune" } });
    expect(useMemoryStore.getState().query).toBe("pune");
  });

  it("offers the type filter only in the knowledge scope", () => {
    const { rerender } = render(<MemoryToolbar />);
    expect(screen.getByLabelText("Entity type")).toBeInTheDocument();
    useMemoryStore.setState({ scope: "procedures" });
    rerender(<MemoryToolbar />);
    expect(screen.queryByLabelText("Entity type")).not.toBeInTheDocument();
  });

  it("sets the type filter back to null when 'all' is chosen", () => {
    render(<MemoryToolbar />);
    const select = screen.getByLabelText("Entity type");
    fireEvent.change(select, { target: { value: "person" } });
    expect(useMemoryStore.getState().typeFilter).toBe("person");
    fireEvent.change(select, { target: { value: "" } });
    expect(useMemoryStore.getState().typeFilter).toBeNull();
  });
});
