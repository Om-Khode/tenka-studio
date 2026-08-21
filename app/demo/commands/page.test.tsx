import { render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import CommandsPage from "./page";

describe("CommandsPage", () => {
  afterEach(() => {
    // Every other test in the suite relies on demo mode being bound with
    // zero setup -- restore it so this file's mode switch cannot bleed into
    // a later test elsewhere.
    configureRepos("demo", demoRepoBundle);
  });

  it("shows the demo-engine volume readout in demo mode", () => {
    configureRepos("demo", demoRepoBundle);
    render(<CommandsPage />);
    expect(screen.getByText(/volume ·/i)).toBeInTheDocument();
  });

  it("hides the volume readout in live mode -- demo-engine's ticker never advances there, so it would freeze at a fabricated number", () => {
    configureRepos("live", demoRepoBundle);
    render(<CommandsPage />);
    expect(screen.queryByText(/volume ·/i)).not.toBeInTheDocument();
  });
});
