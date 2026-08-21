import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EgoGraph, EGO_GRAPH_MAX_NODES } from "./EgoGraph";
import type { Entity, Relationship } from "@/types/memory";
import type { NeighborLink } from "@/store/memory-store";

const center: Entity = {
  id: 1, type: "person", canonicalName: "arjun", displayName: "Kirigaya",
  properties: {}, source: "conversation", confidence: 1,
  createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
  sourceTurnId: null,
};

function links(count: number): NeighborLink[] {
  return Array.from({ length: count }, (_, i) => ({
    relationship: {
      id: i + 1, fromId: 1, toId: i + 2, type: "mentioned_with",
      confidence: 0.5, source: "conversation", sourceTurnId: null,
    } as Relationship,
    entity: { ...center, id: i + 2, displayName: `N${i + 2}` },
  }));
}

describe("EgoGraph", () => {
  it("draws every neighbour when it is under the cap", () => {
    render(<EgoGraph center={center} links={links(4)} />);
    expect(screen.getAllByRole("img", { name: /neighbour/i })).toHaveLength(4);
  });

  it("stops at the cap and says how many it is not drawing", () => {
    render(<EgoGraph center={center} links={links(50)} />);
    expect(screen.getAllByRole("img", { name: /neighbour/i })).toHaveLength(EGO_GRAPH_MAX_NODES);
    // The node also carries "— see relations below", so match on the count only.
    expect(screen.getByText(new RegExp(`\\+${50 - EGO_GRAPH_MAX_NODES} more`))).toBeInTheDocument();
  });

  it("says so rather than drawing an empty circle when there are no neighbours", () => {
    render(<EgoGraph center={center} links={[]} />);
    expect(screen.getByText(/nothing connected/i)).toBeInTheDocument();
  });
});
