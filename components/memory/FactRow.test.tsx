import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FactRow } from "./FactRow";
import type { Fact, FactGroup } from "@/types/memory";

function fact(over: Partial<Fact>): Fact {
  return {
    id: 1, subjectId: 1, predicate: "lives_in", object: "Pune", confidence: 0.92,
    source: "conversation", eventAt: null, invalidAt: null, expiresAt: null,
    verifiedAt: null, createdAt: "2026-07-31T00:00:00.000Z", sourceTurnId: null,
    ...over,
  };
}

describe("FactRow", () => {
  it("renders predicate and object", () => {
    const group: FactGroup = { current: fact({}), superseded: [] };
    render(<FactRow group={group} />);
    expect(screen.getByText("lives_in")).toBeInTheDocument();
    expect(screen.getByText("Pune")).toBeInTheDocument();
  });

  it("strikes through a superseded value and dates it", () => {
    const group: FactGroup = {
      current: fact({ id: 2, object: "Pune" }),
      superseded: [fact({ id: 1, object: "Mumbai", invalidAt: "2026-07-31T00:00:00.000Z" })],
    };
    render(<FactRow group={group} />);
    const old = screen.getByText("Mumbai");
    expect(old).toHaveClass("line-through");
    expect(screen.getByText(/until 31 Jul/i)).toBeInTheDocument();
  });

  it("shows when the event happened, distinct from when she learned it", () => {
    const group: FactGroup = {
      current: fact({ eventAt: "2026-07-29T00:00:00.000Z" }),
      superseded: [],
    };
    render(<FactRow group={group} />);
    expect(screen.getByText(/happened 29 Jul/i)).toBeInTheDocument();
  });

  it("omits the event line when eventAt is null", () => {
    render(<FactRow group={{ current: fact({}), superseded: [] }} />);
    expect(screen.queryByText(/happened/i)).not.toBeInTheDocument();
  });

  it("exposes confidence as a meter", () => {
    render(<FactRow group={{ current: fact({ confidence: 0.5 }), superseded: [] }} />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "50");
  });
});
