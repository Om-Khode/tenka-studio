import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EntityRow } from "./EntityRow";
import type { Entity } from "@/types/memory";

const ENTITY: Entity = {
  id: 1, type: "person", canonicalName: "kirigaya shirogane", displayName: "Kirigaya Shirogane",
  properties: {}, source: "conversation", confidence: 0.9,
  createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z",
  sourceTurnId: "s12:4812",
};

describe("EntityRow", () => {
  it("shows the display name, type, and fact count", () => {
    render(<EntityRow entity={ENTITY} selected={false} factCount={7} onSelect={() => {}} />);
    expect(screen.getByText("Kirigaya Shirogane")).toBeInTheDocument();
    expect(screen.getByText("person")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("reports selection state to assistive tech", () => {
    render(<EntityRow entity={ENTITY} selected factCount={7} onSelect={() => {}} />);
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
  });

  it("fires onSelect on click", () => {
    const onSelect = vi.fn();
    render(<EntityRow entity={ENTITY} selected={false} factCount={0} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("option"));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
