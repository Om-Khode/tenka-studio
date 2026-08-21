import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ScopeTabs } from "./ScopeTabs";
import { useMemoryStore } from "@/store/memory-store";

describe("ScopeTabs", () => {
  beforeEach(() => useMemoryStore.setState(useMemoryStore.getInitialState()));

  it("switches the store's scope", () => {
    render(<ScopeTabs />);
    fireEvent.click(screen.getByRole("tab", { name: /procedures/i }));
    expect(useMemoryStore.getState().scope).toBe("procedures");
  });

  it("clears the selection when the scope changes", () => {
    useMemoryStore.setState({ selectedId: 4 });
    render(<ScopeTabs />);
    fireEvent.click(screen.getByRole("tab", { name: /preferences/i }));
    expect(useMemoryStore.getState().selectedId).toBeNull();
  });
});
