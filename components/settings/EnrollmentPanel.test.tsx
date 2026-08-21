import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EnrollmentPanel } from "./EnrollmentPanel";
import { useSystemStore } from "@/store/system-store";
import { useToastStore } from "@/store/toast-store";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import type { RepoBundle } from "@/services/repos/types";

describe("EnrollmentPanel", () => {
  beforeEach(() => {
    useSystemStore.setState(useSystemStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
  });

  it("lists enrolled voices and known faces", () => {
    render(<EnrollmentPanel />);
    expect(screen.getByText(/8 samples/i)).toBeInTheDocument();
    expect(screen.getByText(/5 encodings/i)).toBeInTheDocument();
  });

  it("says plainly that enrollment cannot happen here", () => {
    render(<EnrollmentPanel />);
    expect(screen.getByText(/needs the microphone and camera on her machine/i)).toBeInTheDocument();
  });

  it("handles a profile she has never matched again", () => {
    render(<EnrollmentPanel />);
    expect(screen.getByText(/not seen since/i)).toBeInTheDocument();
  });

  it("forgets a voice behind a confirmation", async () => {
    render(<EnrollmentPanel />);
    fireEvent.click(screen.getAllByRole("button", { name: /forget/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /forget it/i }));
    // forgetVoice() now awaits DemoSystemRepo.forgetEnrolled() before
    // removing anything (follow-up to Milestone-4 blocker 5), so the row's
    // disappearance is the eventual outcome of that call, not immediate.
    await waitFor(() => expect(useSystemStore.getState().voices).toHaveLength(1));
    expect(useToastStore.getState().toasts[0].title).toMatch(/forgot/i);
  });

  it("names the kind, not just the person, so a same-named voice and face are never confused", async () => {
    render(<EnrollmentPanel />);
    // Rows render voices then faces; both seeded people have one of each, so
    // the last "forget" button belongs to a face -- Sakuta's, per the seed data.
    const forgetButtons = screen.getAllByRole("button", { name: /forget/i });
    fireEvent.click(forgetButtons[forgetButtons.length - 1]);
    expect(screen.getByText(/Sakuta's face/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /forget it/i }));
    await waitFor(() => expect(useSystemStore.getState().faces).toHaveLength(1));
    expect(useSystemStore.getState().voices).toHaveLength(2);
    expect(useToastStore.getState().toasts[0].title).toMatch(/forgot sakuta's face/i);
  });

  it("carried finding: renders a null count as absent, never zero and never the word null", () => {
    useSystemStore.setState({
      voices: [
        { id: "v1", name: "Ghost", sampleCount: null, enrolledAt: "2026-07-01T00:00:00.000Z", lastHeardAt: null },
      ],
      faces: [
        { id: "f1", name: "Ghost", encodingCount: null, metAt: "2026-07-01T00:00:00.000Z", lastSeenAt: null },
      ],
    });
    render(<EnrollmentPanel />);
    expect(screen.queryByText(/null samples/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 samples/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/null encodings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 encodings/i)).not.toBeInTheDocument();
    expect(screen.getByText(/^samples/i)).toBeInTheDocument();
    expect(screen.getByText(/^encodings/i)).toBeInTheDocument();
  });
});

describe("EnrollmentPanel's LoadStatus (Milestone-4 blocker 1)", () => {
  function liveBundleWith(system: Partial<RepoBundle["system"]>): RepoBundle {
    return {
      ...demoRepoBundle,
      system: {
        // Spread the demo repo first so a method added to SystemRepo later does
        // not break this fixture. It enumerated the interface by hand and went
        // stale the moment getTelemetry landed.
        ...demoRepoBundle.system,
        getBackupStatus: async () => ({ enabled: true, lastBackupAt: null, sizeBytes: 0, progressPct: null }),
        runBackup: async () => ({ enabled: true, lastBackupAt: null, sizeBytes: 0, progressPct: null }),
        restoreBackup: async () => false,
        listVoices: async () => [],
        listFaces: async () => [],
        forgetEnrolled: async () => false,
        ...system,
      },
    };
  }

  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    useSystemStore.setState(useSystemStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
  });

  it("renders a skeleton while system-store is loading in live mode, then the real rows once ready", async () => {
    let resolveVoices!: (v: Awaited<ReturnType<RepoBundle["system"]["listVoices"]>>) => void;
    configureRepos(
      "live",
      liveBundleWith({
        listVoices: () => new Promise((resolve) => { resolveVoices = resolve; }),
      }),
    );
    useSystemStore.setState(useSystemStore.getInitialState());

    render(<EnrollmentPanel />);
    expect(screen.queryByText(/who she recognises/i)).not.toBeInTheDocument();
    expect(useSystemStore.getState().status).toBe("loading");

    resolveVoices([
      { id: "v1", name: "Real", sampleCount: 2, enrolledAt: "2026-07-01T00:00:00.000Z", lastHeardAt: null },
    ]);
    await waitFor(() => expect(screen.getByText(/2 samples/i)).toBeInTheDocument());
  });

  it("renders the error branch, with a retry, when the repository rejects", async () => {
    configureRepos(
      "live",
      liveBundleWith({
        getBackupStatus: async () => {
          throw new Error("simulated daemon failure");
        },
      }),
    );
    useSystemStore.setState(useSystemStore.getInitialState());

    render(<EnrollmentPanel />);
    await waitFor(() => expect(screen.getByText(/could not reach/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("EnrollmentPanel forgetting in live mode (follow-up to Milestone-4 blocker 5)", () => {
  function liveBundleWith(system: Partial<RepoBundle["system"]>): RepoBundle {
    return {
      ...demoRepoBundle,
      system: {
        // Spread the demo repo first so a method added to SystemRepo later does
        // not break this fixture. It enumerated the interface by hand and went
        // stale the moment getTelemetry landed.
        ...demoRepoBundle.system,
        getBackupStatus: async () => ({ enabled: true, lastBackupAt: null, sizeBytes: 0, progressPct: null }),
        runBackup: async () => ({ enabled: true, lastBackupAt: null, sizeBytes: 0, progressPct: null }),
        restoreBackup: async () => false,
        listVoices: async () => [
          { id: "v1", name: "Real", sampleCount: 2, enrolledAt: "2026-07-01T00:00:00.000Z", lastHeardAt: null },
        ],
        listFaces: async () => [
          { id: "f1", name: "Real", encodingCount: 1, metAt: "2026-07-01T00:00:00.000Z", lastSeenAt: null },
        ],
        forgetEnrolled: async () => false,
        ...system,
      },
    };
  }

  beforeEach(async () => {
    configureRepos("live", liveBundleWith({}));
    useSystemStore.setState(useSystemStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
  });

  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    useSystemStore.setState(useSystemStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
  });

  it("a refused live forget leaves the row visible and toasts failure, never removing it optimistically", async () => {
    configureRepos("live", liveBundleWith({ forgetEnrolled: async () => false }));
    render(<EnrollmentPanel />);
    await waitFor(() => expect(screen.getByText(/2 samples/i)).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /forget/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /forget it/i }));

    await waitFor(() => expect(useToastStore.getState().toasts[0]?.ok).toBe(false));
    expect(screen.getByText(/2 samples/i)).toBeInTheDocument();
    expect(useSystemStore.getState().voices).toHaveLength(1);
  });

  it("a real live forget removes the row once the daemon confirms it", async () => {
    configureRepos("live", liveBundleWith({ forgetEnrolled: async () => true }));
    render(<EnrollmentPanel />);
    await waitFor(() => expect(screen.getByText(/2 samples/i)).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /forget/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /forget it/i }));

    await waitFor(() => expect(useSystemStore.getState().voices).toHaveLength(0));
    expect(useToastStore.getState().toasts[0]?.ok).toBe(true);
  });
});
