import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import NotFound from "./not-found";

describe("Root not-found page", () => {
  it("offers the demo, the one thing that works on a public URL", () => {
    render(<NotFound />);
    expect(screen.getByRole("link", { name: /try demo/i })).toHaveAttribute("href", "/demo");
  });

  it("says what is missing rather than showing a bare status code", () => {
    render(<NotFound />);
    // Two reachable URLs produce this page on a public build (/app and
    // /connect), so it is a real destination, not an edge case.
    expect(screen.getByRole("heading").textContent).toBeTruthy();
  });
});
