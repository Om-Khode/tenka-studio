import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Topbar } from "./Topbar";
import { useDemoStore } from "@/store/demo-engine";
import { useEventStreamStore } from "@/hooks/useEventStream";
import { useAuthStore } from "@/store/auth-store";

describe("Topbar", () => {
  beforeEach(() => {
    useDemoStore.setState(useDemoStore.getInitialState());
    useEventStreamStore.setState(useEventStreamStore.getInitialState(), true);
  });

  afterEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  it("renders the breadcrumb and DEMO MODE badge", () => {
    render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="demo" />);
    expect(screen.getByText("STUDIO / DASHBOARD")).toBeInTheDocument();
    // By testid, and on textContent: the word "mode" is in its own span so it
    // can drop below `lg` -- at 390px the badge, the abort button and the
    // breadcrumb cannot all have their full width. getByText matches an
    // element's DIRECT text children only, so the split makes "demo mode"
    // unfindable by text even though it is right there in the DOM.
    expect(screen.getByTestId("mode-badge").textContent).toMatch(/demo mode/i);
  });

  /**
   * The live badge used to be a static "live mode" label. Milestone 5b Task
   * 10 replaced it with the connection badge in that same slot: the mode is
   * still named, but a label that stays green while the daemon is gone is
   * exactly the "stale looks live" failure the live tree exists to avoid.
   */
  it("renders the connection badge instead of a static label in live mode", () => {
    useEventStreamStore.setState({ connection: "open" });
    render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="live" />);
    expect(screen.getByText(/live · connected/i)).toBeInTheDocument();
    expect(screen.queryByText(/demo mode/i)).not.toBeInTheDocument();
  });

  it("shows a dropped daemon in the badge rather than a green live label", () => {
    useEventStreamStore.setState({ connection: "reconnecting" });
    render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="live" />);
    expect(screen.getByText(/live · reconnecting/i)).toBeInTheDocument();
  });

  /**
   * The shell had no route back to the connect screen at all. A token she
   * stops accepting still renders the whole live tree, and the only fix
   * available to a user was editing localStorage by hand.
   */
  it("offers a way back to the connect screen from every live route", () => {
    render(<Topbar breadcrumb="STUDIO / FILES" isDashboard={false} mode="live" />);
    expect(screen.getByRole("link", { name: /reconnect/i })).toHaveAttribute("href", "/connect");
  });

  it("keeps offering it while the connection looks perfectly healthy", () => {
    // The state that needs it most: the socket is fine, but a token can lose
    // a capability, or the user can simply want to pair a different one. An
    // affordance that appears only once something visibly breaks is missing
    // in exactly that case.
    useEventStreamStore.setState({ connection: "open" });
    render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="live" />);
    expect(screen.getByRole("link", { name: /reconnect/i })).toBeInTheDocument();
  });

  it("offers no reconnect in demo mode -- there is no token and nothing to reconnect to", () => {
    render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="demo" />);
    expect(screen.queryByRole("link", { name: /reconnect/i })).not.toBeInTheDocument();
  });

  /**
   * Fix round 2, Defect 2a: the capabilities button used to render here, as
   * a third live-mode control competing with the connection badge and
   * reconnect for a row that does not fit at 720 CSS px -- `RECONNECT`
   * clipped mid-word and the page gained a horizontal scrollbar. It moved to
   * the settings page, next to "devices & pairing" (see
   * app/app/settings/page.test.tsx's own coverage for it rendering there).
   * These three cases used to prove the OPPOSITE property (that it rendered
   * here); inverting the assertion without moving the component first is
   * exactly the red this fix has to produce -- restoring the old
   * `<SessionCapabilities />` line here turns this red again.
   */
  it("never renders a capabilities button here, in any mode or session state -- it lives in Settings now", () => {
    useAuthStore.setState({
      phase: "authorized",
      refusal: null,
      session: {
        deviceId: "d1",
        label: "phone",
        granted: ["observe"],
        effective: ["observe"],
        policy: "tailnet",
        canUse: (c: string) => c === "observe",
      },
    });
    const { unmount } = render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="live" />);
    expect(screen.queryByRole("button", { name: /capabilities/i })).not.toBeInTheDocument();
    unmount();

    render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="demo" />);
    expect(screen.queryByRole("button", { name: /capabilities/i })).not.toBeInTheDocument();
  });

  /**
   * With the capabilities button gone, only two live-mode controls compete
   * for the row: the connection badge and reconnect. jsdom cannot lay out
   * CSS (see this file's sibling BottomNav.test.tsx for the same caveat), so
   * this cannot assert pixels -- it pins that the row holds exactly these
   * two, which is the fact the measured Playwright check (720 CSS px,
   * documented in docs/6b-live-test-frontend-fixes-round2.md) confirms fits
   * without a horizontal scrollbar.
   */
  it("renders exactly two controls in the live-mode cluster: the badge and reconnect", () => {
    render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="live" />);
    expect(screen.getByText(/live ·/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reconnect/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /capabilities/i })).not.toBeInTheDocument();
  });

  it("shows no connection badge in demo mode -- there is nothing connected to report", () => {
    render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="demo" />);
    expect(screen.queryByText(/live ·/i)).not.toBeInTheDocument();
  });

  it("ESC-hold badge is enabled and aborts the current task on the dashboard route in demo mode", () => {
    useDemoStore.getState().advanceStep();
    render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="demo" />);
    const button = screen.getByRole("button", { name: /esc.*abort/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(useDemoStore.getState().taskHistory).toHaveLength(1);
  });

  it("ESC-hold badge is disabled on non-dashboard routes and does not abort when clicked", () => {
    useDemoStore.getState().advanceStep();
    render(<Topbar breadcrumb="STUDIO / SETTINGS" isDashboard={false} mode="demo" />);
    const button = screen.getByRole("button", { name: /esc.*abort/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(useDemoStore.getState().taskHistory).toHaveLength(0);
  });

  it("does not render the ESC-hold abort in live mode at all -- demo-engine's task slot has no live counterpart", () => {
    useDemoStore.getState().advanceStep();
    render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="live" />);

    // Absent, not disabled. A disabled control implies some state in which it
    // becomes available, and there is none: aborting a real turn is the
    // composer's stop button (ChatRepo.abort -> POST /v1/abort), which is
    // already wired and unaffected by this.
    expect(screen.queryByRole("button", { name: /esc.*abort/i })).not.toBeInTheDocument();
    expect(useDemoStore.getState().taskHistory).toHaveLength(0);
  });

  it("does not render a search control it cannot honour", () => {
    render(<Topbar breadcrumb="STUDIO / DASHBOARD" isDashboard mode="live" />);
    // "⌘K search" was a bare <span> with no handler and no key binding, in
    // both trees -- chrome shaped like a feature. The per-page searches
    // (conversations, memory, files) are real and are not this.
    expect(screen.queryByText(/⌘K/)).not.toBeInTheDocument();
  });
});
