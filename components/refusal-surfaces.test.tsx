/**
 * One case per failing surface, not one case for the helper.
 *
 * lib/refusal.ts and components/ui/LoadFailure.tsx have their own tests, and
 * those tests would pass in full while every panel in Studio still said "She
 * could not reach X." over a TRY AGAIN button -- a shared helper that no caller
 * uses, or that a caller uses while still drawing its own retry, is exactly the
 * failure this fix exists to prevent. So each surface is mounted for real,
 * driven into its own error state, and read.
 *
 * The scenario throughout is the one the user actually reported: a device
 * paired `observe`-only, on the loopback listener. That device can watch her
 * work, so telemetry, the command list and personality still load; it cannot
 * read what she remembers, browse files, message her, or administer her. The
 * assertions follow that split rather than blanket-refusing everything, because
 * a helper that refused too eagerly would also pass a lazier test.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { FileList } from "@/components/files/FileList";
import { EntityList } from "@/components/memory/EntityList";
import { LiveCommandGrid } from "@/components/commands/live/LiveCommandGrid";
import { LiveActiveModelCard } from "@/components/dashboard/live/LiveActiveModelCard";
import { LiveSystemMetersCard } from "@/components/dashboard/live/LiveSystemMetersCard";
import { LiveRecentCommandsCard } from "@/components/dashboard/live/LiveRecentCommandsCard";
import { LiveTraitDriftStrip } from "@/components/dashboard/live/LiveTraitDriftStrip";
import { BackupPanel } from "@/components/settings/BackupPanel";
import { EnrollmentPanel } from "@/components/settings/EnrollmentPanel";
import { SettingsPageBody } from "@/components/settings/SettingsPageBody";

import { useAuthStore } from "@/store/auth-store";
import { useFileStore } from "@/store/file-store";
import { useMemoryStore } from "@/store/memory-store";
import { useSystemStore } from "@/store/system-store";
import { useSettingsStore } from "@/store/settings-store";
import { usePersonalityStore } from "@/store/personality-store";
import { useChatStore } from "@/store/chat-store";
import { useToastStore } from "@/store/toast-store";
import { configureRepos } from "@/services/repo-registry";
import { liveRepoBundle } from "@/services/repos/http";
import { demoRepoBundle } from "@/services/repos/demo";
import { ApiError } from "@/services/http";
import { __resetTelemetryPollForTests } from "@/hooks/useLiveTelemetry";
import type { Capability } from "@/types/session";

/** The reported session: paired to observe only, sitting on 127.0.0.1. */
function observeOnlyDevice() {
  authorize(["observe"], ["observe"], "local");
}

function authorize(granted: Capability[], effective: Capability[], policy: string) {
  const usable = new Set<string>(effective);
  useAuthStore.setState({
    phase: "authorized",
    refusal: null,
    session: {
      deviceId: "phone-1",
      label: "Pixel 8",
      granted,
      effective,
      policy,
      canUse: (c) => usable.has(c),
    },
  });
}

/** No surface may blame the connection, or offer a retry, for a refusal. */
function readsAsRefusal(pattern: RegExp) {
  expect(screen.getByText(pattern)).toBeInTheDocument();
  expect(screen.queryByText(/could not reach/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
}

const NO_OP = () => {};

describe("a refusal never reads as an unreachable daemon", () => {
  beforeEach(() => {
    configureRepos("live", liveRepoBundle);
    useFileStore.setState(useFileStore.getInitialState(), true);
    useMemoryStore.setState(useMemoryStore.getInitialState(), true);
    useSystemStore.setState(useSystemStore.getInitialState(), true);
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    usePersonalityStore.setState(usePersonalityStore.getInitialState(), true);
    useToastStore.setState(useToastStore.getInitialState(), true);
  });

  afterEach(() => {
    __resetTelemetryPollForTests();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    configureRepos("demo", demoRepoBundle);
    vi.restoreAllMocks();
  });

  // ─── files -> FILES ──────────────────────────────────────────────────

  it("FileList blames the pairing, not the folder, for a device without files", () => {
    observeOnlyDevice();
    useFileStore.setState({ status: "error" });
    render(<FileList onRename={NO_OP} onDelete={NO_OP} onDownload={NO_OP} />);
    readsAsRefusal(/wasn't given access to her files/i);
  });

  it("FileList keeps its retry for a device that DOES hold files", () => {
    authorize(["observe", "files"], ["observe", "files"], "local");
    useFileStore.setState({ status: "error" });
    render(<FileList onRename={NO_OP} onDelete={NO_OP} onDownload={NO_OP} />);
    expect(screen.getByText("She could not reach this folder.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  // ─── memory -> RECALL ────────────────────────────────────────────────

  it("EntityList names recall rather than claiming her memory is unreachable", () => {
    observeOnlyDevice();
    useMemoryStore.setState({ status: "error" });
    render(<EntityList />);
    readsAsRefusal(/wasn't given access to what she remembers/i);
  });

  // ─── enrollment -> RECALL ────────────────────────────────────────────

  it("EnrollmentPanel names recall, the capability GET /v1/enrollment needs", () => {
    observeOnlyDevice();
    useSystemStore.setState({ status: "error" });
    render(<EnrollmentPanel />);
    readsAsRefusal(/wasn't given access to what she remembers/i);
  });

  // ─── audit -> SYSTEM_CONTROL ─────────────────────────────────────────

  it("LiveRecentCommandsCard names system control, not observe, for the audit log", async () => {
    observeOnlyDevice();
    vi.spyOn(liveRepoBundle.commands, "recentRuns").mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    vi.spyOn(liveRepoBundle.commands, "list").mockResolvedValue([]);
    render(<LiveRecentCommandsCard />);
    await waitFor(() =>
      expect(screen.getByText(/wasn't given system control/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/could not reach/i)).not.toBeInTheDocument();
  });

  // ─── chat -> CHAT_SEND ───────────────────────────────────────────────

  it("a refused chat turn toasts a boundary, not 'Could not reach her'", async () => {
    observeOnlyDevice();
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockRejectedValue(new ApiError(403, "forbidden"));

    useChatStore.getState().sendMessage("are you there");

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    const toast = useToastStore.getState().toasts[0];
    expect(toast.title).toBe("This device may not message her");
    expect(toast.detail).toMatch(/wasn't given permission to message her/i);
  });

  it("an unreachable daemon still toasts 'Could not reach her' for a device that may send", async () => {
    authorize(["observe", "chat_send"], ["observe", "chat_send"], "local");
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockRejectedValue(new Error("offline"));

    useChatStore.getState().sendMessage("are you there");

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0].title).toBe("Could not reach her");
  });

  // ─── observe-gated surfaces, which this device CAN use ───────────────

  it("the observe-gated surfaces still report unreachable for an observe-only device", async () => {
    // The point of naming a capability is that it must be the right one. This
    // device holds `observe`, so telemetry, personality and the command list
    // failing really is her not answering -- and must still say so, and must
    // still offer the retry where one exists.
    observeOnlyDevice();

    usePersonalityStore.setState({ status: "error" });
    const { unmount: unmountStrip } = render(<LiveTraitDriftStrip />);
    expect(screen.getByText(/could not reach her personality/i)).toBeInTheDocument();
    unmountStrip();

    useSystemStore.setState({ status: "error" });
    const { unmount: unmountBackup } = render(<BackupPanel />);
    expect(screen.getByText("She could not reach her backup status.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    unmountBackup();

    useSettingsStore.setState({ status: "error" });
    const { unmount: unmountSettings } = render(<SettingsPageBody />);
    expect(screen.getByText("She could not reach her settings.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    unmountSettings();

    vi.spyOn(liveRepoBundle.commands, "list").mockRejectedValue(new Error("offline"));
    render(<LiveCommandGrid />);
    await waitFor(() =>
      expect(screen.getByText("She could not reach her command list.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  // ─── the same surfaces, refused when the capability really is missing ─

  it("the observe-gated surfaces DO name observe when the device lacks even that", async () => {
    authorize(["recall"], ["recall"], "local");

    useSystemStore.setState({ status: "error" });
    const { unmount: unmountBackup } = render(<BackupPanel />);
    readsAsRefusal(/wasn't given access to what she's doing/i);
    unmountBackup();

    usePersonalityStore.setState({ status: "error" });
    const { unmount: unmountStrip } = render(<LiveTraitDriftStrip />);
    readsAsRefusal(/wasn't given access to what she's doing/i);
    unmountStrip();

    useSystemStore.setState({ telemetryStatus: "error", telemetry: null });
    vi.spyOn(liveRepoBundle.system, "getTelemetry").mockReturnValue(new Promise(() => {}));
    const { unmount: unmountMeters } = render(<LiveSystemMetersCard />);
    readsAsRefusal(/wasn't given access to what she's doing/i);
    unmountMeters();

    const { unmount: unmountModel } = render(<LiveActiveModelCard />);
    readsAsRefusal(/wasn't given access to what she's doing/i);
    unmountModel();

    vi.spyOn(liveRepoBundle.commands, "list").mockRejectedValue(new ApiError(403, "forbidden"));
    render(<LiveCommandGrid />);
    await waitFor(() =>
      expect(screen.getByText(/wasn't given access to what she's doing/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  // ─── the connection, not the device, as the limit ────────────────────

  it("tells a tunnelled device to reconnect rather than to re-pair", () => {
    // Granted `files`, but funnel's ceiling for this scenario is `observe`
    // alone. Re-pairing would change nothing here; reaching her from her own
    // machine would.
    authorize(["observe", "recall", "files"], ["observe"], "funnel");
    useMemoryStore.setState({ status: "error" });
    render(<EntityList />);
    expect(
      screen.getByText(/has access to what she remembers, but the connection you're on won't carry it/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/funnel listener/i)).toBeInTheDocument();
    expect(screen.queryByText(/pair it again/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  // ─── no surface disappears ───────────────────────────────────────────

  it("explains rather than hides -- a refused surface still renders something", () => {
    observeOnlyDevice();
    useMemoryStore.setState({ status: "error" });
    const { container } = render(<EntityList />);
    expect(container).not.toBeEmptyDOMElement();
  });
});
