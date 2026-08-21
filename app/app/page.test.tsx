import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import LiveDashboardPage from "./page";
import { configureRepos } from "@/services/repo-registry";
import { liveRepoBundle } from "@/services/repos/http";
import { demoRepoBundle } from "@/services/repos/demo";
import { usePersonalityStore } from "@/store/personality-store";
import { useEventStreamStore } from "@/hooks/useEventStream";

describe("Live dashboard page", () => {
  beforeEach(() => {
    configureRepos("live", liveRepoBundle);
    usePersonalityStore.setState(usePersonalityStore.getInitialState());
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockResolvedValue({
      cpuPercent: 41,
      ramPercent: 62,
      batteryPercent: 87,
      activeModel: "ollama · qwen2.5-coder",
      uptimeSeconds: 3600,
    });
    vi.spyOn(liveRepoBundle.personality, "load").mockResolvedValue({
      base: "minimal",
      available: ["warm_honest", "minimal"],
      traits: { warmth: 12, resolve: 88 },
      sampleLine: "Fixed. Line 41.",
    });
  });

  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    usePersonalityStore.setState(usePersonalityStore.getInitialState());
    // Module-scoped socket state: a frame left by one test is still there for
    // the next, and the no-activity branch asserts on its absence.
    useEventStreamStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("renders the hero and a real telemetry reading, without ever needing demo-engine", async () => {
    render(<LiveDashboardPage />);
    expect(screen.getByText(/she's awake/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/41/)).toBeInTheDocument());
  });

  it("omits the cards with no daemon source rather than saying they are waiting for one", async () => {
    render(<LiveDashboardPage />);
    await waitFor(() => expect(screen.getByText(/41/)).toBeInTheDocument());

    // Spend and daily-learning have no route behind them at all --
    // TelemetryPayload is cpu/ram/battery/activeModel/uptime, and nothing
    // anywhere tracks cost -- so "waiting on the live event stream" was not
    // merely unhelpful, it was false: it claimed data was in flight over a
    // connected socket that will never carry it.
    expect(screen.queryByText(/cost — with vs without routing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/what she learned today/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/waiting on the live event stream/i)).not.toBeInTheDocument();

    // Same ruling for the three stat-bar counters.
    expect(screen.queryByText(/tasks today/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/spend today/i)).not.toBeInTheDocument();
  });

  it("renders the running task from the status frames the socket already delivers", async () => {
    useEventStreamStore.setState({
      connection: "open",
      activity: {
        phase: "ACTING",
        detail: "clicking through the settings dialog",
        cursorFollows: true,
        step: [2, 5],
        tier: "app",
      },
    });

    render(<LiveDashboardPage />);

    // This card sat on "waiting on the live event stream" while these very
    // frames were driving the Topbar's activity line -- a pane claiming to
    // wait for something it already had.
    expect(await screen.findByText(/clicking through the settings dialog/i)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: /task progress/i });
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
  });

  /**
   * PROOF-OF-FAILURE: this page used to mount `ActiveModelCard` and
   * `TraitDriftStrip` unchanged, defended in its own doc comment as live-safe
   * because neither read demo-engine or a `*-scripts.ts` module. Both instead
   * printed compiled-in constants -- "gemini-flash-lite · primary · free
   * tier", six fixed trait numbers -- as readings off the user's machine.
   * Against a daemon running Ollama on `minimal`, this test fails on the old
   * page for both cards at once.
   */
  it("reads the active model and the traits off the daemon, never off a compiled-in constant", async () => {
    render(<LiveDashboardPage />);

    await waitFor(() => expect(screen.getByText(/ollama · qwen2\.5-coder/)).toBeInTheDocument());
    expect(screen.queryByText(/gemini-flash-lite/)).not.toBeInTheDocument();
    expect(screen.queryByText(/free tier/i)).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("meter", { name: "resolve" })).toBeInTheDocument());
    expect(screen.getByRole("meter", { name: "warmth" })).toHaveAttribute("aria-valuenow", "12");
    expect(screen.queryByText(/curiosity/i)).not.toBeInTheDocument();
  });
});
