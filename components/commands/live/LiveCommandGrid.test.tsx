import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LiveCommandGrid } from "./LiveCommandGrid";
import { configureRepos } from "@/services/repo-registry";
import { liveRepoBundle } from "@/services/repos/http";
import { demoRepoBundle } from "@/services/repos/demo";
import { useToastStore } from "@/store/toast-store";
import type { CommandDef } from "@/types/command";

const FOUR_COMMANDS: CommandDef[] = [
  { id: "lock_workstation", label: "Lock PC", icon: "Lock", kind: "guarded", destructive: true, confirm: { title: "Lock this PC?", body: "Sure?", confirmLabel: "lock it" } },
  { id: "volume_up", label: "Volume Up", icon: "Volume2", kind: "instant" },
  { id: "volume_down", label: "Volume Down", icon: "Volume1", kind: "instant" },
  { id: "screenshot", label: "Take Screenshot", icon: "Camera", kind: "stepped" },
];

describe("LiveCommandGrid", () => {
  beforeEach(() => {
    configureRepos("live", liveRepoBundle);
    useToastStore.setState(useToastStore.getInitialState());
    vi.spyOn(liveRepoBundle.commands, "list").mockResolvedValue(FOUR_COMMANDS);
  });

  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    vi.restoreAllMocks();
  });

  it("renders the daemon's four commands, not the demo catalogue's six", async () => {
    render(<LiveCommandGrid />);
    await waitFor(() => expect(screen.getAllByTestId("command-card")).toHaveLength(4));
    expect(screen.queryByText("Open Chrome")).not.toBeInTheDocument();
    expect(screen.queryByText("Open VS Code")).not.toBeInTheDocument();
  });

  it("runs a plain command through the repository and toasts its result", async () => {
    const runSpy = vi
      .spyOn(liveRepoBundle.commands, "run")
      .mockResolvedValue({ ok: true, title: "Screenshot captured" });

    render(<LiveCommandGrid />);
    await waitFor(() => expect(screen.getAllByTestId("command-card")).toHaveLength(4));
    fireEvent.click(screen.getByRole("button", { name: /take screenshot/i }));

    await waitFor(() => expect(runSpy).toHaveBeenCalledWith("screenshot"));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.at(-1)?.title).toBe("Screenshot captured"),
    );
  });

  it("asks before running a guarded command, same as the demo grid", async () => {
    render(<LiveCommandGrid />);
    await waitFor(() => expect(screen.getAllByTestId("command-card")).toHaveLength(4));
    fireEvent.click(screen.getByRole("button", { name: /lock pc/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  /**
   * PROOF-OF-FAILURE. The gate used to read `command.kind === "guarded"`, and
   * `kind` came from store/command-catalogue.ts -- a client-side constant -- so
   * a daemon that declared screenshots destructive was overruled and the card
   * fired straight away. The daemon's declaration is the authority on its own
   * machine; `destructive` is what it declares with.
   */
  it("asks before a command the DAEMON calls destructive, whatever the local catalogue says", async () => {
    const runSpy = vi
      .spyOn(liveRepoBundle.commands, "run")
      .mockResolvedValue({ ok: true, title: "captured" });
    vi.spyOn(liveRepoBundle.commands, "list").mockResolvedValue([
      {
        id: "screenshot",
        label: "Take Screenshot",
        icon: "Camera",
        // `kind` deliberately DISAGREES with `destructive` here. HttpCommandRepo
        // derives one from the other now, so the two cannot diverge in
        // practice -- but this grid is the last thing standing between a
        // destructive command and the OS, and it must not be the presentation
        // catalogue's word it takes. "stepped" is what the pre-fix merge
        // produced for this exact command (`take-screenshot`'s catalogue row),
        // and the grid fired it with no confirmation at all.
        kind: "stepped",
        destructive: true,
        description: "Captures the current screen.",
        confirm: { title: "Take Screenshot?", body: "Captures the current screen.", confirmLabel: "confirm" },
      },
    ]);

    render(<LiveCommandGrid />);
    await waitFor(() => expect(screen.getAllByTestId("command-card")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /take screenshot/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The sentence is the daemon's own description, not a Studio literal.
    expect(screen.getByText("Captures the current screen.")).toBeInTheDocument();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("names the capability a command needs, rather than letting a refusal be the first the user hears of it", async () => {
    vi.spyOn(liveRepoBundle.commands, "list").mockResolvedValue([
      {
        id: "screenshot",
        label: "Take Screenshot",
        icon: "Camera",
        kind: "stepped",
        destructive: false,
        description: "Captures the current screen.",
        requiredGrant: "screen",
      },
    ]);

    render(<LiveCommandGrid />);
    await waitFor(() => expect(screen.getAllByTestId("command-card")).toHaveLength(1));
    expect(screen.getByText(/needs screen/i)).toBeInTheDocument();
  });

  it("never throws on a refused run -- it resolves ok:false and toasts instead", async () => {
    vi.spyOn(liveRepoBundle.commands, "run").mockResolvedValue({
      ok: false,
      title: "Command refused",
      detail: "forbidden",
    });

    render(<LiveCommandGrid />);
    await waitFor(() => expect(screen.getAllByTestId("command-card")).toHaveLength(4));
    fireEvent.click(screen.getByRole("button", { name: /take screenshot/i }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.at(-1)).toEqual(
        expect.objectContaining({ ok: false, title: "Command refused" }),
      ),
    );
  });

  it("shows an error branch with a retry when the catalogue fails to load", async () => {
    vi.spyOn(liveRepoBundle.commands, "list").mockRejectedValue(new Error("offline"));
    render(<LiveCommandGrid />);
    await waitFor(() => expect(screen.getByText(/could not reach/i)).toBeInTheDocument());
  });
});
