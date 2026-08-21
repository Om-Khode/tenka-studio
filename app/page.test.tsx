import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import LandingPage from "./page";

describe("Landing page", () => {
  it("renders the hero headline", () => {
    render(<LandingPage />);
    expect(screen.getByText(/TENKA STUDIO/i)).toBeInTheDocument();
  });

  it("Try Demo links to /demo", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: /try demo/i })).toHaveAttribute("href", "/demo");
  });

  it("Connect to TENKA links to /connect, the one route reachable without a token", () => {
    render(<LandingPage />);
    // /connect deliberately, NOT /app/connect: the connect screen lives outside
    // the gated /app tree because that layout renders nothing while
    // unauthorized -- which is exactly the state a first-time visitor is in.
    expect(screen.getByRole("link", { name: /connect to tenka/i })).toHaveAttribute(
      "href",
      "/connect",
    );
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it("on a desktop build, says she is running right here on this machine", () => {
    render(<LandingPage />);
    expect(screen.getByText(/not a mockup\. a live look at her, running right here on this machine\./i)).toBeInTheDocument();
  });
});

describe("Landing page on a public demo build", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not offer Connect to TENKA, which 404s on this build", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "1");
    render(<LandingPage />);
    expect(screen.queryByRole("link", { name: /connect to tenka/i })).not.toBeInTheDocument();
  });

  it("still offers the demo, and gives the reader a next click", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "1");
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: /try demo/i })).toHaveAttribute("href", "/demo");
    expect(screen.getByRole("link", { name: /github/i })).toHaveAttribute(
      "href",
      "https://github.com/Om-Khode/TENKA",
    );
  });

  it("stops claiming she is running on the reader's machine", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "1");
    render(<LandingPage />);
    // True of a desktop build, false of a URL opened on someone else's laptop.
    // The demo's own honesty is the reason it is worth deploying at all.
    expect(screen.queryByText(/right here on this machine/i)).not.toBeInTheDocument();
  });
});
