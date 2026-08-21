import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BackupRestoreDialog } from "./BackupRestoreDialog";
import { useSystemStore } from "@/store/system-store";
import { useToastStore } from "@/store/toast-store";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import type { RepoBundle } from "@/services/repos/types";

/**
 * Any 12 words -- demo mode's restoreBackup() checks shape only, never
 * content (there is no daemon to ask), so this is not a secret. Twelve
 * because that is the shortest length BIP39 can produce, and what the
 * daemon's `_MNEMONIC_STRENGTH_BITS = 128` yields; the 8 this used to be
 * was a length no BIP39 mnemonic can ever have.
 */
const A_WELL_FORMED_PHRASE =
  "amber moss steel gold bone quiet signal drift ember lattice harbor vellum";

function open(onOpenChange: (open: boolean) => void = () => {}) {
  render(<BackupRestoreDialog open onOpenChange={onOpenChange} />);
}

/**
 * Renders the dialog behind real, stateful `open` control instead of the
 * hardcoded-true fixture `open()` uses -- so a dismissal the component
 * requests (Escape, overlay click) actually flips `open` to false, the same
 * way BackupPanel's own `useState` does. A "reopen" button stands in for
 * clicking BackupPanel's "restore..." button again.
 */
function OpenableDialog() {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <button onClick={() => setIsOpen(true)}>reopen</button>
      <BackupRestoreDialog open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}

describe("BackupRestoreDialog", () => {
  beforeEach(() => {
    useSystemStore.setState(useSystemStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
  });

  it("Milestone-4 blocker 4: rejects an obviously malformed phrase inline, with no network attempt and no VALID_RECOVERY_PHRASE to compare against", async () => {
    const onOpenChange = vi.fn();
    open(onOpenChange);
    fireEvent.change(screen.getByLabelText(/recovery phrase/i), {
      target: { value: "too short" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() =>
      expect(screen.getByText(/12, 15, 18, 21 or 24 words/i)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/recovery phrase/i)).toBeInTheDocument();
    expect(useToastStore.getState().toasts).toHaveLength(0);
    // The fixture above hardcodes `open` to true, so the dialog cannot
    // visually close no matter what the component does -- the only way to
    // prove it never *asked* to close is to check the callback itself.
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("walks phrase -> confirm -> result on a well-formed phrase", async () => {
    open();
    fireEvent.change(screen.getByLabelText(/recovery phrase/i), {
      target: { value: A_WELL_FORMED_PHRASE },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /overwrite her memory/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /overwrite her memory/i }));
    await waitFor(() => expect(screen.getByText(/restored/i)).toBeInTheDocument());
  });

  it("abandons a restore whose dialog closed mid-verify, instead of resurrecting it on reopen", async () => {
    render(<OpenableDialog />);
    fireEvent.change(screen.getByLabelText(/recovery phrase/i), {
      target: { value: A_WELL_FORMED_PHRASE },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /overwrite her memory/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /overwrite her memory/i }));
    await waitFor(() => expect(screen.getByText(/restoring/i)).toBeInTheDocument());

    // Dismiss while the restore is still in flight -- Escape is unguarded
    // in the "verifying" step, same as an overlay click would be.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Let the pending restoreBackup() promise resolve while the dialog is closed.
    await new Promise((resolve) => setTimeout(resolve, 600));

    fireEvent.click(screen.getByRole("button", { name: /reopen/i }));
    expect(screen.getByLabelText(/recovery phrase/i)).toBeInTheDocument();
    expect(screen.queryByText(/restored/i)).not.toBeInTheDocument();
  });
});

describe("BackupRestoreDialog against the real daemon round trip in live mode (Milestone-4 blocker 4)", () => {
  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    useSystemStore.setState(useSystemStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
  });

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

  it("a well-formed but wrong phrase is only rejected after the network round trip, not inline -- there is no client-side secret left to catch it earlier", async () => {
    configureRepos("live", liveBundleWith({ restoreBackup: async () => false }));
    open();
    fireEvent.change(screen.getByLabelText(/recovery phrase/i), {
      target: { value: A_WELL_FORMED_PHRASE },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    // The client-side check is shape-only, so this DOES reach confirm.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /overwrite her memory/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /overwrite her memory/i }));
    await waitFor(() =>
      expect(screen.getByText(/could not open that backup/i)).toBeInTheDocument(),
    );
    // The detail is the only place the ambiguity is stated, and this dialog
    // is the one surface that shows it -- it used to render `outcome.title`
    // alone and drop it.
    expect(screen.getByText(/archive cannot be read/i)).toBeInTheDocument();
  });

  it("the daemon's own verify-and-restore succeeds for the real phrase", async () => {
    configureRepos("live", liveBundleWith({ restoreBackup: async () => true }));
    open();
    fireEvent.change(screen.getByLabelText(/recovery phrase/i), {
      target: { value: A_WELL_FORMED_PHRASE },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /overwrite her memory/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /overwrite her memory/i }));
    await waitFor(() => expect(screen.getByText(/restored/i)).toBeInTheDocument());
  });
});
