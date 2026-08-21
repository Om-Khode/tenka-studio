import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import LiveCommandsPage from "./page";
import { configureRepos } from "@/services/repo-registry";
import { liveRepoBundle } from "@/services/repos/http";
import { demoRepoBundle } from "@/services/repos/demo";

describe("Live commands page", () => {
  beforeEach(() => {
    configureRepos("live", liveRepoBundle);
    vi.spyOn(liveRepoBundle.commands, "list").mockResolvedValue([
      { id: "screenshot", label: "Take Screenshot", icon: "Camera", kind: "stepped" },
    ]);
  });

  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    vi.restoreAllMocks();
  });

  it("renders the heading and the live grid, with no demo-only volume readout", async () => {
    render(<LiveCommandsPage />);
    expect(screen.getByRole("heading", { name: "Commands" })).toBeInTheDocument();
    expect(screen.queryByText(/volume ·/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Take Screenshot")).toBeInTheDocument());
  });
});
