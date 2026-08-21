import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { LiveTraitDriftStrip } from "./LiveTraitDriftStrip";
import { TraitDriftStrip } from "@/components/dashboard/TraitDriftStrip";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import { usePersonalityStore } from "@/store/personality-store";
import type { PersonalityPayload, RepoBundle } from "@/services/repos/types";

const DAEMON_PAYLOAD: PersonalityPayload = {
  base: "minimal",
  available: ["warm_honest", "minimal"],
  // Deliberately NOT the six names the old strip hardcodes, and deliberately
  // not six of them: `traits` is the daemon's own Record<string, number>, so
  // nothing on the client may assume which keys exist or how many.
  traits: { warmth: 12, resolve: 88, terseness: 97 },
  sampleLine: "Fixed. Line 41.",
};

function bundleWith(payload: PersonalityPayload | Error): RepoBundle {
  return {
    ...demoRepoBundle,
    personality: {
      ...demoRepoBundle.personality,
      load: async () => {
        if (payload instanceof Error) throw payload;
        return payload;
      },
    },
  };
}

describe("LiveTraitDriftStrip", () => {
  beforeEach(() => {
    usePersonalityStore.setState(usePersonalityStore.getInitialState());
  });

  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    usePersonalityStore.setState(usePersonalityStore.getInitialState());
    vi.restoreAllMocks();
  });

  /**
   * PROOF-OF-FAILURE: the strip this replaces hardcodes six trait names and
   * six numbers with no data source at all. A user who has switched her to
   * `minimal` still read "warmth 60" on /app. These assertions cannot pass
   * against that component for any daemon payload.
   */
  it("renders the traits the daemon reports, keys and count included", async () => {
    configureRepos("live", bundleWith(DAEMON_PAYLOAD));

    render(<LiveTraitDriftStrip />);

    await waitFor(() => expect(screen.getByRole("meter", { name: "resolve" })).toBeInTheDocument());
    expect(screen.getByRole("meter", { name: "warmth" })).toHaveAttribute("aria-valuenow", "12");
    expect(screen.getByRole("meter", { name: "terseness" })).toHaveAttribute("aria-valuenow", "97");
    expect(screen.getAllByRole("meter")).toHaveLength(3);
    // Names the old strip invented and this daemon never mentioned.
    expect(screen.queryByText(/curiosity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/playfulness/i)).not.toBeInTheDocument();
  });

  it("the old strip is the thing being replaced -- it prints six fixed names whatever she is set to", () => {
    // Guards the proof above from going vacuous, same as ActiveModelCard's.
    render(<TraitDriftStrip />);
    expect(screen.getByText(/curiosity/i)).toBeInTheDocument();
  });

  it("says so plainly when personality is unreachable, rather than showing placeholder numbers", async () => {
    configureRepos("live", bundleWith(new Error("simulated daemon failure")));

    render(<LiveTraitDriftStrip />);

    await waitFor(() => expect(screen.getByText(/could not reach her personality/i)).toBeInTheDocument());
    expect(screen.queryAllByRole("meter")).toHaveLength(0);
  });

  it("renders a skeleton, not zeroes, before the first load resolves", () => {
    configureRepos("live", {
      ...demoRepoBundle,
      personality: { ...demoRepoBundle.personality, load: () => new Promise(() => {}) },
    });

    render(<LiveTraitDriftStrip />);

    expect(screen.queryAllByRole("meter")).toHaveLength(0);
    expect(usePersonalityStore.getState().status).toBe("loading");
  });
});
