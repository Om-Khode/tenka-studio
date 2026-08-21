import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { LiveSystemMetersCard } from "./LiveSystemMetersCard";
import { configureRepos } from "@/services/repo-registry";
import { liveRepoBundle } from "@/services/repos/http";
import { demoRepoBundle } from "@/services/repos/demo";
import { useSystemStore, TELEMETRY_STALE_AFTER_MISSES } from "@/store/system-store";

describe("LiveSystemMetersCard", () => {
  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    // The reading lives in system-store now, not in useLiveTelemetry's own
    // React state (milestone 5b Task 10: one slice, seeded by the poll and
    // updated by the socket). A module-scoped store outlives the render, so
    // without this reset the "skeleton" and "first fetch fails" cases below
    // would read a previous test's telemetry and pass for the wrong reason.
    useSystemStore.setState({
      telemetry: null,
      telemetryStatus: "idle",
      telemetryAt: null,
      telemetryMisses: 0,
    });
    vi.restoreAllMocks();
  });

  it("renders a skeleton before the first reading lands", () => {
    configureRepos("live", liveRepoBundle);
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockReturnValue(new Promise(() => {}));
    render(<LiveSystemMetersCard />);
    expect(screen.queryByText(/cpu/i)).not.toBeInTheDocument();
  });

  it("renders the daemon's telemetry once it resolves", async () => {
    configureRepos("live", liveRepoBundle);
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockResolvedValue({
      cpuPercent: 41,
      ramPercent: 62,
      batteryPercent: 87,
      activeModel: "gemini-flash-lite",
      uptimeSeconds: 3600,
    });

    render(<LiveSystemMetersCard />);
    await waitFor(() => expect(screen.getByText(/41/)).toBeInTheDocument());
    expect(screen.getByText(/62/)).toBeInTheDocument();
    expect(screen.getByText(/87/)).toBeInTheDocument();
  });

  it("renders battery as absent, never 0%, when the daemon has none to report", async () => {
    configureRepos("live", liveRepoBundle);
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockResolvedValue({
      cpuPercent: 41,
      ramPercent: 62,
      batteryPercent: null,
      activeModel: "gemini-flash-lite",
      uptimeSeconds: 3600,
    });

    render(<LiveSystemMetersCard />);
    await waitFor(() => expect(screen.getByText(/41/)).toBeInTheDocument());
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows an error branch with no retry-worth data when the very first fetch fails", async () => {
    configureRepos("live", liveRepoBundle);
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockRejectedValue(new Error("offline"));

    render(<LiveSystemMetersCard />);
    await waitFor(() => expect(screen.getByText(/could not reach/i)).toBeInTheDocument());
  });

  /**
   * Milestone 5b, Task 12. A stopped daemon used to leave the last snapshot on
   * screen as present-tense fact for as long as the tab stayed open.
   */
  it("PROOF-OF-FAILURE: dates the reading once it stops arriving, instead of showing it as current", () => {
    configureRepos("live", liveRepoBundle);
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockReturnValue(new Promise(() => {}));
    useSystemStore.setState({
      telemetry: {
        cpuPercent: 41,
        ramPercent: 62,
        batteryPercent: 87,
        activeModel: "gemini-flash-lite",
        uptimeSeconds: 3600,
      },
      telemetryStatus: "ready",
      telemetryAt: Date.now() - 134_000,
      telemetryMisses: TELEMETRY_STALE_AFTER_MISSES,
    });

    const { container } = render(<LiveSystemMetersCard />);
    // The number is kept -- it is still the last true thing she said -- but it
    // now carries when she said it.
    expect(screen.getByText(/41/)).toBeInTheDocument();
    expect(screen.getByText(/last seen 2m ago/i)).toBeInTheDocument();
    expect(container.querySelector(".opacity-50")).not.toBeNull();
  });

  it("says nothing about age while the feed is healthy", async () => {
    configureRepos("live", liveRepoBundle);
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockResolvedValue({
      cpuPercent: 41,
      ramPercent: 62,
      batteryPercent: 87,
      activeModel: "gemini-flash-lite",
      uptimeSeconds: 3600,
    });

    const { container } = render(<LiveSystemMetersCard />);
    await waitFor(() => expect(screen.getByText(/41/)).toBeInTheDocument());
    expect(screen.queryByText(/last seen/i)).not.toBeInTheDocument();
    expect(container.querySelector(".opacity-50")).toBeNull();
  });
});
