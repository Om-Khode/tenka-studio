import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BackupPanel } from "./BackupPanel";
import { useSystemStore } from "@/store/system-store";
import { useToastStore } from "@/store/toast-store";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import type { RepoBundle } from "@/services/repos/types";

describe("BackupPanel", () => {
  beforeEach(() => {
    useSystemStore.setState(useSystemStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
  });

  it("shows when she last backed up and how big it was", () => {
    render(<BackupPanel />);
    expect(screen.getByText(/last backup/i)).toBeInTheDocument();
    // Unchanged by Task 12's move onto lib/format.ts's formatBytes: both the
    // old mb() and the shared formatter print 41_000_000 bytes as 39.1 MB.
    expect(screen.getByText(/39\.1 MB/)).toBeInTheDocument();
  });

  /**
   * Milestone 5b, Task 12 -- the two cases where consolidating onto
   * formatBytes changes what this panel says, recorded because they are user
   * visible, not incidental.
   */
  it("scales a large backup instead of piling up megabytes", () => {
    useSystemStore.setState((s) => ({ backup: { ...s.backup, sizeBytes: 2 * 1024 ** 3 } }));
    render(<BackupPanel />);
    expect(screen.getByText(/2\.0 GB/)).toBeInTheDocument();
    expect(screen.queryByText(/2048\.0 MB/)).not.toBeInTheDocument();
  });

  it("says a backup that has never run has no size, rather than 0.0 MB", () => {
    useSystemStore.setState((s) => ({
      backup: { ...s.backup, lastBackupAt: null, sizeBytes: 0 },
    }));
    render(<BackupPanel />);
    expect(screen.getByText(/never · —/)).toBeInTheDocument();
    expect(screen.queryByText(/0\.0 MB/)).not.toBeInTheDocument();
  });

  it("toggles cloud backup", () => {
    render(<BackupPanel />);
    fireEvent.click(screen.getByRole("switch", { name: /cloud backup/i }));
    expect(useSystemStore.getState().backup.enabled).toBe(false);
  });

  it("shows progress while backing up and reports when done", async () => {
    render(<BackupPanel />);
    fireEvent.click(screen.getByRole("button", { name: /back up now/i }));
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.ok).toBe(true), {
      timeout: 4000,
    });
  });

  it("PROOF-OF-FAILURE (Milestone-4 blocker 3): toasts a failed backup instead of leaving the click unhandled", async () => {
    const rejectingBundle: RepoBundle = {
      ...demoRepoBundle,
      system: {
        // Spread the demo repo first so a method added to SystemRepo later does
        // not break this fixture. It enumerated the interface by hand and went
        // stale the moment getTelemetry landed.
        ...demoRepoBundle.system,
        getBackupStatus: async () => ({ enabled: true, lastBackupAt: null, sizeBytes: 0, progressPct: null }),
        runBackup: async () => {
          throw new Error("simulated daemon failure");
        },
        restoreBackup: async () => false,
        listVoices: async () => [],
        listFaces: async () => [],
        forgetEnrolled: async () => false,
      },
    };
    configureRepos("live", rejectingBundle);
    try {
      render(<BackupPanel />);
      await waitFor(() => expect(screen.getByRole("button", { name: /back up now/i })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /back up now/i }));
      await waitFor(() => expect(useToastStore.getState().toasts[0]?.ok).toBe(false), { timeout: 2000 });
    } finally {
      configureRepos("demo", demoRepoBundle);
    }
  });
});

describe("BackupPanel's LoadStatus (Milestone-4 blocker 1)", () => {
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

  it("renders a skeleton while system-store is loading in live mode, then the real status once ready", async () => {
    let resolveBackup!: (v: Awaited<ReturnType<RepoBundle["system"]["getBackupStatus"]>>) => void;
    configureRepos(
      "live",
      liveBundleWith({
        getBackupStatus: () => new Promise((resolve) => { resolveBackup = resolve; }),
      }),
    );
    useSystemStore.setState(useSystemStore.getInitialState());

    render(<BackupPanel />);
    expect(screen.queryByText(/last backup/i)).not.toBeInTheDocument();
    expect(useSystemStore.getState().status).toBe("loading");

    resolveBackup({ enabled: true, lastBackupAt: "2026-08-01T00:00:00.000Z", sizeBytes: 2_000_000, progressPct: null });
    await waitFor(() => expect(screen.getByText(/last backup/i)).toBeInTheDocument());
  });

  /**
   * PROOF-OF-FAILURE: live's `runBackup()` used to set `progressPct: 0` for
   * the duration of the call, which this panel rendered as a real
   * progressbar reporting `aria-valuenow=0` -- a measurement announced to
   * assistive tech of something nobody is measuring. `POST /v1/backup/run`
   * blocks and answers once; there is no partial progress on the wire
   * (SystemRepo.runBackup's own doc). The button must still say it is busy.
   */
  it("shows a live backup as busy without drawing a progressbar pinned at zero", async () => {
    let finish!: (v: Awaited<ReturnType<RepoBundle["system"]["runBackup"]>>) => void;
    configureRepos(
      "live",
      liveBundleWith({ runBackup: () => new Promise((resolve) => { finish = resolve; }) }),
    );
    useSystemStore.setState(useSystemStore.getInitialState());

    render(<BackupPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: /back up now/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /back up now/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /backing up/i })).toBeDisabled());
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    finish({ enabled: true, lastBackupAt: "2026-08-01T00:00:00.000Z", sizeBytes: 1, progressPct: null });
    await waitFor(() => expect(screen.getByRole("button", { name: /back up now/i })).toBeInTheDocument());
  });

  /**
   * PROOF-OF-FAILURE: no daemon route writes `enabled` -- openapi.json has
   * `GET /v1/backup`, `POST /v1/backup/run`, `POST /v1/backup/restore` and
   * nothing else, and no settings key carries it either. Live, this Switch
   * flipped, told the daemon nothing, and silently reverted on the next
   * load(): a control that looks like it works and doesn't.
   */
  it("disables the cloud-backup Switch in live mode, where nothing would receive the change", async () => {
    configureRepos("live", liveBundleWith({}));
    useSystemStore.setState(useSystemStore.getInitialState());

    render(<BackupPanel />);
    await waitFor(() => expect(screen.getByText(/last backup/i)).toBeInTheDocument());

    const toggle = screen.getByRole("switch", { name: /cloud backup/i });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(useSystemStore.getState().backup.enabled).toBe(true);
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

    render(<BackupPanel />);
    await waitFor(() => expect(screen.getByText(/could not reach/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("a locked key is not a healthy panel", () => {
  const paused = {
    enabled: true,
    lastBackupAt: "2026-08-03T16:40:10Z",
    sizeBytes: 41_000_000,
    progressPct: null,
    unlocked: false,
  };

  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    useSystemStore.setState(useSystemStore.getInitialState());
  });

  it("PROOF-OF-FAILURE: says backups are paused instead of only showing a stale date", async () => {
    // The whole bug in one assertion. Before `unlocked` existed this rendered
    // "Last backup 03 Aug" beside an enabled switch, with every scheduled
    // backup being skipped and nothing on screen saying so -- for a week.
    useSystemStore.setState({ status: "ready", backup: paused });

    render(<BackupPanel />);

    expect(await screen.findByText(/backups are paused/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock/i })).toBeInTheDocument();
  });

  it("says nothing when the key is armed", () => {
    useSystemStore.setState({ status: "ready", backup: { ...paused, unlocked: true } });
    render(<BackupPanel />);
    expect(screen.queryByText(/backups are paused/i)).not.toBeInTheDocument();
  });

  it("treats an absent `unlocked` as unknown, never as paused", () => {
    // undefined means the demo repo (no key at all) or a daemon too old to
    // report one. Warning on either would put a red banner on a healthy
    // machine, which is the mirror image of the bug.
    const withoutTheField: typeof paused = { ...paused };
    delete (withoutTheField as { unlocked?: boolean }).unlocked;
    useSystemStore.setState({ status: "ready", backup: withoutTheField });
    render(<BackupPanel />);
    expect(screen.queryByText(/backups are paused/i)).not.toBeInTheDocument();
  });
});
