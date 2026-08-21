import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { ProvenanceBlock } from "./ProvenanceBlock";
import { configureRepos, resetRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";

describe("ProvenanceBlock", () => {
  it("reveals the originating turn on expand", () => {
    render(<ProvenanceBlock sourceTurnId="s12:4812" />);
    fireEvent.click(screen.getByRole("button", { name: /why do you think that/i }));
    expect(screen.getByText(/I moved to Tokyo/i)).toBeInTheDocument();
    expect(screen.getByText("s12:4812")).toBeInTheDocument();
  });

  it("states plainly when there is no provenance", () => {
    render(<ProvenanceBlock sourceTurnId={null} />);
    expect(screen.getByText(/no provenance recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not pretend to have an excerpt it cannot resolve", () => {
    render(<ProvenanceBlock sourceTurnId="s99:0000" />);
    fireEvent.click(screen.getByRole("button", { name: /why do you think that/i }));
    expect(screen.getByText(/turn is no longer in her history/i)).toBeInTheDocument();
  });
});

/**
 * Milestone 5b, Task "10c". This component is shared by both route trees,
 * and its excerpts come from store/memory-scripts.ts -- demo seed data with
 * no wire equivalent (openapi.json exposes `sourceTurnId` on a memory row
 * and `turnId` on a chat 202, and no route keyed by either). Under live
 * chrome it was therefore captioning a real daemon's memory with a scripted
 * sentence.
 *
 * The bundle here is irrelevant -- nothing in this component calls a
 * repository. The MODE is the entire point, so the demo bundle stands in
 * (same fixture shape store/file-store.test.ts uses for its mode test).
 */
describe("ProvenanceBlock in live mode", () => {
  afterEach(() => configureRepos("demo", demoRepoBundle));

  it("still shows the real turn id -- that came from the daemon", () => {
    configureRepos("live", demoRepoBundle);
    render(<ProvenanceBlock sourceTurnId="s12:4812" />);
    fireEvent.click(screen.getByRole("button", { name: /why do you think that/i }));
    expect(screen.getByText("s12:4812")).toBeInTheDocument();
  });

  it("renders no seeded excerpt beside it", () => {
    configureRepos("live", demoRepoBundle);
    render(<ProvenanceBlock sourceTurnId="s12:4812" />);
    fireEvent.click(screen.getByRole("button", { name: /why do you think that/i }));
    expect(screen.queryByText(/I moved to Tokyo/i)).not.toBeInTheDocument();
  });

  it("does not reword the absent excerpt into a claim that the turn is gone", () => {
    configureRepos("live", demoRepoBundle);
    render(<ProvenanceBlock sourceTurnId="s99:0000" />);
    fireEvent.click(screen.getByRole("button", { name: /why do you think that/i }));
    expect(screen.queryByText(/no longer in her history/i)).not.toBeInTheDocument();
  });

  /**
   * The guard was `getRepoMode() === "live"`, the last fail-open one left in
   * the shared set -- every sibling (system-store's three branches, the
   * memory/files stores') was deliberately flipped to `=== "demo"` so demo has
   * to prove itself. `getRepoMode()` is `RepoMode | null`, and null means
   * configureRepos() has never run: an unbound registry, which getRepos() fails
   * CLOSED on with a throw. Reading "not live" as "demo" handed that case the
   * seed excerpts.
   */
  it("renders no seeded excerpt when the registry is unbound either -- demo has to prove itself", () => {
    resetRepos();
    render(<ProvenanceBlock sourceTurnId="s12:4812" />);
    fireEvent.click(screen.getByRole("button", { name: /why do you think that/i }));
    expect(screen.getByText("s12:4812")).toBeInTheDocument();
    expect(screen.queryByText(/I moved to Tokyo/i)).not.toBeInTheDocument();
  });
});
