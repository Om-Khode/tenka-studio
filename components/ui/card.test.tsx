import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Card } from "./card";

describe("Card", () => {
  it("renders children inside a bordered card surface", () => {
    render(<Card>content</Card>);
    const el = screen.getByText("content");
    expect(el.className).toContain("bg-card");
    expect(el.className).toContain("border-border");
  });

  it("adds hover background when hoverable", () => {
    render(<Card hoverable>content</Card>);
    expect(screen.getByText("content").className).toContain("hover:bg-card-hover");
  });
});
