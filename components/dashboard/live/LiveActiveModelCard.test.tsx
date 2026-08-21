import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { LiveActiveModelCard } from "./LiveActiveModelCard";
import { ActiveModelCard } from "@/components/dashboard/ActiveModelCard";
import { configureRepos } from "@/services/repo-registry";
import { liveRepoBundle } from "@/services/repos/http";
import { demoRepoBundle } from "@/services/repos/demo";
import { useSystemStore } from "@/store/system-store";
import type { TelemetrySnapshot } from "@/types/system";

const SNAPSHOT: TelemetrySnapshot = {
  cpuPercent: 41,
  ramPercent: 62,
  batteryPercent: 87,
  activeModel: "ollama · qwen2.5-coder",
  uptimeSeconds: 3600,
};

describe("LiveActiveModelCard", () => {
  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    vi.restoreAllMocks();
    // Telemetry lives on the module-scoped system-store slice, not in this
    // component's local state, so a reading left behind by one test is still
    // there for the next one -- and the skeleton and unreachable cases both
    // assert on the slice being empty. This test file was written while the
    // hook still held the value in local React state, where each render
    // started clean; the reset is what replaces that guarantee.
    useSystemStore.setState({ telemetry: null, telemetryStatus: "idle" });
  });

  /**
   * PROOF-OF-FAILURE: the card this replaces prints "gemini-flash-lite" and a
   * three-row fallback ladder as string literals, with no data source of any
   * kind. Rendered on /app against a daemon reporting Ollama, it stated the
   * wrong model as fact about the user's own machine. This assertion is
   * unsatisfiable by the old component, whatever the daemon says.
   */
  it("names the model the daemon actually reports, not a compiled-in one", async () => {
    configureRepos("live", liveRepoBundle);
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockResolvedValue(SNAPSHOT);

    render(<LiveActiveModelCard />);

    await waitFor(() => expect(screen.getByText(/ollama · qwen2\.5-coder/)).toBeInTheDocument());
    expect(screen.queryByText(/gemini-flash-lite/)).not.toBeInTheDocument();
    // The invented routing ladder is gone too -- the daemon reports the model
    // it is on, never the chain it would fall through.
    expect(screen.queryByText(/fallback/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/free tier/i)).not.toBeInTheDocument();
  });

  it("the old card is the thing being replaced -- it says gemini-flash-lite no matter what is running", () => {
    // Guards the proof above from going vacuous: if someone rewires
    // ActiveModelCard itself, this fails and the swap can be revisited.
    render(<ActiveModelCard />);
    expect(screen.getByText("gemini-flash-lite")).toBeInTheDocument();
  });

  it("renders a skeleton, not a model name, before the first reading lands", () => {
    configureRepos("live", liveRepoBundle);
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockReturnValue(new Promise(() => {}));

    render(<LiveActiveModelCard />);

    expect(screen.queryByText(/active model/i)).not.toBeInTheDocument();
  });

  it("says so plainly when telemetry is unreachable, rather than falling back to a name", async () => {
    configureRepos("live", liveRepoBundle);
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockRejectedValue(new Error("offline"));

    render(<LiveActiveModelCard />);

    await waitFor(() => expect(screen.getByText(/could not reach her telemetry/i)).toBeInTheDocument());
    expect(screen.queryByText(/gemini/i)).not.toBeInTheDocument();
  });

  it("says so plainly when the daemon reports no model yet, rather than printing an empty line", async () => {
    configureRepos("live", liveRepoBundle);
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockResolvedValue({ ...SNAPSHOT, activeModel: "" });

    render(<LiveActiveModelCard />);

    await waitFor(() => expect(screen.getByText(/not reported a model yet/i)).toBeInTheDocument());
  });
});
