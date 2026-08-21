import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders primary variant with bone background", () => {
    render(<Button variant="primary">Try Demo</Button>);
    const btn = screen.getByRole("button", { name: "Try Demo" });
    expect(btn.className).toContain("bg-bone");
  });

  it("renders secondary variant as bordered transparent", () => {
    render(<Button variant="secondary">Connect</Button>);
    const btn = screen.getByRole("button", { name: "Connect" });
    expect(btn.className).toContain("border-border");
  });

  it("renders disabled state", () => {
    render(<Button variant="primary" disabled>Connect</Button>);
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });
});
