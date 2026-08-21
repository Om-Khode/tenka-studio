import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { KnowledgeDetail } from "./KnowledgeDetail";
import { useMemoryStore } from "@/store/memory-store";
import { useToastStore } from "@/store/toast-store";
import { seedMemory } from "@/store/memory-scripts";

function ready() {
  useMemoryStore.setState({
    ...useMemoryStore.getInitialState(),
    ...seedMemory(),
    status: "ready",
  });
}

describe("KnowledgeDetail", () => {
  beforeEach(() => {
    useMemoryStore.setState(useMemoryStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
    ready();
  });

  it("lists the entity's facts", () => {
    render(<KnowledgeDetail entityId={1} />);
    // Scoped to the facts list: a relation can share a fact's predicate or
    // object verbatim (the hub's "works_on" and "Tokyo" both do), so an
    // unscoped query would find the same text again in the relations list.
    const facts = within(screen.getByRole("list", { name: /facts/i }));
    expect(facts.getByText("works_on")).toBeInTheDocument();
    expect(facts.getByText("Tokyo")).toBeInTheDocument();
  });

  it("lists every relation even when the graph hid most of them", () => {
    render(<KnowledgeDetail entityId={1} />);
    // The hub has 52 live neighbours; the graph draws 12 and the list holds all.
    expect(screen.getByRole("list", { name: /relations/i }).children.length).toBeGreaterThan(12);
  });

  it("forgets the entity behind a confirmation and reports it", () => {
    render(<KnowledgeDetail entityId={4} />);
    fireEvent.click(screen.getByRole("button", { name: /forget/i }));
    fireEvent.click(screen.getByRole("button", { name: /forget it/i }));
    expect(useMemoryStore.getState().overlay.forgottenEntities).toContain(4);
    expect(useToastStore.getState().toasts[0].title).toMatch(/forgot/i);
  });

  it("does not forget when the confirmation is cancelled", () => {
    render(<KnowledgeDetail entityId={4} />);
    fireEvent.click(screen.getByRole("button", { name: /forget/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(useMemoryStore.getState().overlay.forgottenEntities).not.toContain(4);
  });
});
