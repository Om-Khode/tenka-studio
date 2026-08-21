import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TransportList } from "./TransportList";

const tailnet = {
  name: "tailnet",
  running: true,
  url: "https://phone-8.tail1234.ts.net",
  ceiling: ["observe", "recall", "chat_send", "screen", "files"],
  raisable: ["execute", "system_control"],
  pairable: true,
};

const funnel = {
  name: "funnel",
  running: false,
  url: null,
  ceiling: ["observe", "recall", "chat_send", "screen", "files"],
  raisable: [],
  pairable: true,
};

/** A name TENKA has never shipped an adapter for -- no entry in the file's
 * own `TRANSPORT_COPY` table. Stands in for "a fourth transport lands before
 * this file's prose catches up", which is the one case this component must
 * degrade gracefully on rather than crash or lie about. */
const unknownTransport = {
  name: "beacon",
  running: false,
  url: null,
  ceiling: ["observe"],
  raisable: [],
  pairable: true,
};

/** A synthetic stand-in for `pairable: false` -- none of TENKA's three
 * shipped transports sets this today, so a fixture has to supply the shape
 * the field exists for. Proves the "Watch-only" note is driven by the wire
 * field itself, not by a name this file happens to recognize. */
const unpairable = {
  name: "restricted",
  running: true,
  url: "https://restricted.example",
  ceiling: ["observe"],
  raisable: [],
  pairable: false,
};

describe("TransportList", () => {
  const onStart = vi.fn().mockResolvedValue(undefined);
  const onStop = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    onStart.mockClear();
    onStop.mockClear();
  });

  it("renders ceiling and raisable straight off each transport's own payload, not a hardcoded table", () => {
    render(
      <TransportList
        transports={[tailnet]}
        refused={false}
        refusedMessage={null}
        onStart={onStart}
        onStop={onStop}
      />,
    );
    expect(screen.getByText(/ceiling:/i)).toHaveTextContent("Observe");
    expect(screen.getByText(/raisable:/i)).toHaveTextContent("Execute");
  });

  it("renders an honest fallback, not blank, for a name it doesn't recognize", () => {
    render(
      <TransportList
        transports={[unknownTransport]}
        refused={false}
        refusedMessage={null}
        onStart={onStart}
        onStop={onStop}
      />,
    );
    // No entry in TRANSPORT_COPY for this name -- the "Reach:"/"Reads:"
    // labelled paragraph is skipped, but this used to leave nothing in its
    // place at all. It now renders a one-line honest fallback instead, and
    // ceiling/raisable and the start/stop control (read straight off the
    // payload) still render regardless.
    expect(screen.queryByText(/reach:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reads:/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no reach\/read description shipped/i)).toBeInTheDocument();
    expect(screen.getByText(unknownTransport.name)).toBeInTheDocument();
    expect(screen.getByText(/ceiling:/i)).toHaveTextContent("Observe");
    expect(screen.getByRole("button", { name: /^start$/i })).toBeInTheDocument();
  });

  // Milestone 6b: `pairable` is the wire's own field now (was a hand-copied
  // per-name boolean in TRANSPORT_COPY) -- this proves the "Watch-only" note
  // is driven by the payload, not by recognizing a name. None of TENKA's
  // three shipped transports sets pairable:false today, so this fixture is
  // synthetic (see `unpairable`'s own doc).
  it("shows the watch-only note when the payload itself says pairable: false, regardless of name", () => {
    render(
      <TransportList
        transports={[unpairable]}
        refused={false}
        refusedMessage={null}
        onStart={onStart}
        onStop={onStop}
      />,
    );
    expect(screen.getByText(/watch-only/i)).toBeInTheDocument();
  });

  it("only tailnet's own card offers to raise anything -- funnel shows 'never'", () => {
    render(
      <TransportList
        transports={[tailnet, funnel]}
        refused={false}
        refusedMessage={null}
        onStart={onStart}
        onStop={onStop}
      />,
    );
    const cards = screen.getAllByText(/raisable:/i);
    expect(cards[0]).toHaveTextContent("Execute");
    expect(cards[1]).toHaveTextContent("never");
  });

  it("stops a running transport and starts a stopped one, calling the right handler", async () => {
    render(
      <TransportList
        transports={[tailnet, funnel]}
        refused={false}
        refusedMessage={null}
        onStart={onStart}
        onStop={onStop}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    expect(onStop).toHaveBeenCalledWith("tailnet");

    await userEvent.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith("funnel");
  });

  it("renders the running transport's URL as a plain link, and copies it verbatim", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(
      <TransportList
        transports={[tailnet]}
        refused={false}
        refusedMessage={null}
        onStart={onStart}
        onStop={onStop}
      />,
    );
    const link = screen.getByRole("link", { name: tailnet.url });
    expect(link).toHaveAttribute("href", tailnet.url);

    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(tailnet.url);
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("disables start/stop and explains why once refused", () => {
    render(
      <TransportList
        transports={[tailnet]}
        refused
        refusedMessage="This only works from Settings on this machine itself."
        onStart={onStart}
        onStop={onStop}
      />,
    );
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeDisabled();
    expect(screen.getByText(/only works from settings/i)).toBeInTheDocument();
  });
});
