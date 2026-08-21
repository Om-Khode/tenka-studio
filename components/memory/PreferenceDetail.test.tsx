import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { PreferenceDetail } from "./PreferenceDetail";
import { useMemoryStore } from "@/store/memory-store";
import { useToastStore } from "@/store/toast-store";
import { seedMemory } from "@/store/memory-scripts";

describe("PreferenceDetail", () => {
  beforeEach(() => {
    useMemoryStore.setState({
      ...useMemoryStore.getInitialState(),
      ...seedMemory(),
      status: "ready",
    });
    useToastStore.setState(useToastStore.getInitialState());
  });

  it("shows the current value and what it replaced", () => {
    render(<PreferenceDetail preferenceKey="coffee.roast" />);
    expect(screen.getByText("filter")).toBeInTheDocument();
    expect(screen.getByText("dark roast")).toBeInTheDocument();
  });

  it("says so when a preference has never changed", () => {
    render(<PreferenceDetail preferenceKey="reply.length" />);
    expect(screen.getByText(/never changed/i)).toBeInTheDocument();
  });

  it("forgets behind a confirmation", () => {
    render(<PreferenceDetail preferenceKey="coffee.roast" />);
    fireEvent.click(screen.getByRole("button", { name: /forget/i }));
    fireEvent.click(screen.getByRole("button", { name: /forget it/i }));
    expect(useMemoryStore.getState().overlay.forgottenPreferences).toContain("coffee.roast");
  });
});
