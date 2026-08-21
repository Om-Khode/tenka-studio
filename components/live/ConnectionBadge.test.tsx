import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ConnectionBadge } from "./ConnectionBadge";
import { useEventStreamStore } from "@/hooks/useEventStream";

describe("ConnectionBadge", () => {
  beforeEach(() => {
    useEventStreamStore.setState(useEventStreamStore.getInitialState(), true);
  });

  it("reads offline before the socket has ever opened", () => {
    render(<ConnectionBadge />);
    expect(screen.getByText(/live · offline/i)).toBeInTheDocument();
  });

  it("says connected once the socket is open", () => {
    useEventStreamStore.setState({ connection: "open" });
    render(<ConnectionBadge />);
    expect(screen.getByText(/live · connected/i)).toBeInTheDocument();
  });

  it("shows a dropped daemon rather than staying green over stale panes", () => {
    useEventStreamStore.setState({ connection: "reconnecting" });
    render(<ConnectionBadge />);
    expect(screen.getByText(/live · reconnecting/i)).toBeInTheDocument();
    expect(screen.queryByText(/connected/i)).not.toBeInTheDocument();
  });

  /**
   * Both of these used to arrive as "reconnecting", which also means "the
   * daemon is switched off" -- so being rate-limited and holding a token she
   * refuses were told to the user in the same three words, one of them
   * forever.
   */
  it("names throttling as throttling, not as a daemon that went away", () => {
    useEventStreamStore.setState({ connection: "throttled" });
    render(<ConnectionBadge />);
    expect(screen.getByText(/throttled/i)).toBeInTheDocument();
    expect(screen.queryByText(/live · reconnecting/i)).not.toBeInTheDocument();
  });

  it("says the token was refused rather than pretending to reconnect", () => {
    useEventStreamStore.setState({ connection: "unauthorized" });
    render(<ConnectionBadge />);
    expect(screen.getByText(/not recognized/i)).toBeInTheDocument();
    expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument();
  });

  it("renders the current phase, its step and its detail while she is working", () => {
    useEventStreamStore.setState({
      connection: "open",
      activity: {
        phase: "CLICKING",
        detail: "sign in",
        cursorFollows: true,
        step: [2, 5],
        tier: "browser",
      },
    });
    render(<ConnectionBadge />);
    expect(screen.getByText(/clicking 2\/5 · sign in/i)).toBeInTheDocument();
  });

  it("says nothing at all when she is idle -- an 'idle' label is noise, not news", () => {
    useEventStreamStore.setState({
      connection: "open",
      activity: { phase: "IDLE", detail: "", cursorFollows: false, step: null, tier: null },
    });
    render(<ConnectionBadge />);
    expect(screen.queryByText(/idle/i)).not.toBeInTheDocument();
  });

  it("says nothing for the connect-time frame either -- the badge beside it already does", () => {
    useEventStreamStore.setState({
      connection: "open",
      activity: {
        phase: "connected",
        detail: "gemini-flash-lite",
        cursorFollows: null,
        step: null,
        tier: null,
      },
    });
    render(<ConnectionBadge />);
    expect(screen.queryByText(/gemini-flash-lite/i)).not.toBeInTheDocument();
  });
});
