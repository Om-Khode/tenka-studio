import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryDetail } from "./MemoryDetail";
import { useMemoryStore, FACTS_PAGE_SIZE } from "@/store/memory-store";
import { seedMemory } from "@/store/memory-scripts";
import type { Fact } from "@/types/memory";

/** More predicates than FACTS_PAGE_SIZE so the pane's "show all" affordance appears. */
function manyFactsFor(subjectId: number, idOffset: number): Fact[] {
  return Array.from({ length: FACTS_PAGE_SIZE + 5 }, (_, i) => ({
    id: idOffset + i,
    subjectId,
    predicate: `extra_${i}`,
    object: `value ${i}`,
    confidence: 1,
    source: "conversation",
    eventAt: null,
    invalidAt: null,
    expiresAt: null,
    verifiedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    sourceTurnId: null,
  }));
}

describe("MemoryDetail", () => {
  beforeEach(() => {
    useMemoryStore.setState({
      ...useMemoryStore.getInitialState(),
      ...seedMemory(),
      status: "ready",
    });
  });

  it("prompts for a selection when nothing is selected", () => {
    render(<MemoryDetail />);
    expect(screen.getByText(/pick something/i)).toBeInTheDocument();
  });

  it("shows the knowledge body for a selected entity", () => {
    useMemoryStore.setState({ selectedId: 1 });
    render(<MemoryDetail />);
    // "Kirigaya Shirogane" is bare text in both the pane's header and the ego graph's
    // centre label; the heading role disambiguates without needing `within`.
    expect(screen.getByRole("heading", { name: "Kirigaya Shirogane" })).toBeInTheDocument();
  });

  it("resets the facts page when the selection changes", () => {
    useMemoryStore.setState((s) => ({
      facts: [...s.facts, ...manyFactsFor(1, 2000), ...manyFactsFor(4, 3000)],
      selectedId: 1,
    }));
    const { rerender } = render(<MemoryDetail />);

    fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    expect(screen.queryByRole("button", { name: /show all/i })).not.toBeInTheDocument();

    useMemoryStore.setState({ selectedId: 4 });
    rerender(<MemoryDetail />);

    // Entity 4 also has more than FACTS_PAGE_SIZE facts. If the pane's
    // show-all state had leaked across the selection change, this button
    // would already be gone on first paint.
    expect(screen.getByRole("button", { name: /show all/i })).toBeInTheDocument();
  });
});
