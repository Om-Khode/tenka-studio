import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PairDeviceDialog } from "./PairDeviceDialog";
import { useAuthStore } from "@/store/auth-store";
import { ApiError } from "@/services/http";
import { CAPABILITIES, type Capability } from "@/types/session";

const { mintMock } = vi.hoisted(() => ({ mintMock: vi.fn() }));

vi.mock("@/services/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/http")>();
  return { ...actual, apiSend: mintMock };
});

const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

const tailnet = {
  name: "tailnet",
  running: true,
  url: "https://phone-8.tail1234.ts.net",
  ceiling: ["observe", "recall", "chat_send", "screen", "files"],
  raisable: ["execute", "system_control"],
  pairable: true,
};

const stoppedFunnel = {
  name: "funnel",
  running: false,
  url: null,
  ceiling: ["observe", "recall", "chat_send", "screen", "files"],
  raisable: [],
  pairable: true,
};

/** A synthetic stand-in for "a transport whose policy refuses pairing
 * outright" (`TransportPayload.pairable === false`) -- none of TENKA's three
 * shipped transports sets this today, so a fixture has to supply the shape
 * the field exists for, the same way the daemon repo's own removal fixed
 * this up with a synthetic policy rather than deleting the coverage. */
const runningUnpairable = {
  name: "restricted",
  running: true,
  url: "https://restricted.example",
  ceiling: ["observe"],
  raisable: [],
  pairable: false,
};

/** A known, authorized session -- `effective` (never `granted`) is what
 * `session.canUse()` actually reads, so a test proving the narrowing has to
 * withhold a capability from `effective` specifically. */
function authorizedSession(effective: Capability[]) {
  const usable = new Set<string>(effective);
  return {
    deviceId: "desktop-1",
    label: "This desktop",
    granted: effective,
    effective,
    policy: "local",
    canUse: (c: Capability) => usable.has(c),
  };
}

describe("PairDeviceDialog", () => {
  beforeEach(() => {
    mintMock.mockReset();
  });

  afterEach(() => {
    // Every other test in this file relies on the default "unknown" phase
    // (no probe has run) -- reset so a session set here never bleeds into
    // the next test.
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  // Six since Task 5b split CHAT into OBSERVE and RECALL. The labels here are
  // what the user reads while deciding what a phone may do, so they must name
  // what the capability actually reaches: "recall" is her transcripts and
  // knowledge graph, not "read chat".
  it("pre-selects the six ordinary grants", () => {
    render(<PairDeviceDialog />);
    for (const g of ["observe", "recall", "chat_send", "screen", "files", "system_control"]) {
      expect(screen.getByRole("checkbox", { name: new RegExp(g.replace("_", " "), "i") }))
        .toBeChecked();
    }
  });

  // Milestone 6b: the seventh checkbox, and the whole reason it exists as its
  // own file comment (point 4) -- it must not arrive ticked just because the
  // other six do.
  it("leaves execute unticked by default, unlike every other grant", () => {
    render(<PairDeviceDialog />);
    expect(screen.getByRole("checkbox", { name: /execute/i })).not.toBeChecked();
  });

  it("mints without execute among the requested grants when it was never ticked", async () => {
    mintMock.mockResolvedValueOnce({ code: "7K2M-9QX4", qrSvg: "<svg/>",
                                     expiresAt: inSeconds(180), endpoints: [] });
    render(<PairDeviceDialog />);
    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));

    const [, , body] = mintMock.mock.calls[0] as [string, string, { grants: string[] }];
    expect(body.grants).not.toContain("execute");
  });

  it("includes execute once it is deliberately ticked", async () => {
    mintMock.mockResolvedValueOnce({ code: "7K2M-9QX4", qrSvg: "<svg/>",
                                     expiresAt: inSeconds(180), endpoints: [] });
    render(<PairDeviceDialog />);
    await userEvent.click(screen.getByRole("checkbox", { name: /execute/i }));
    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));

    const [, , body] = mintMock.mock.calls[0] as [string, string, { grants: string[] }];
    expect(body.grants).toContain("execute");
  });

  it("refuses to mint with no grant selected", async () => {
    // Item 2 moved the checkboxes off native <input type="checkbox"> onto
    // Radix's button-based Checkbox (components/ui/Checkbox.tsx). A plain
    // button has no `.checked` DOM property, so casting to HTMLInputElement
    // here would silently see every box as unchecked and never actually
    // exercise "untick everything" -- read the ARIA state instead.
    render(<PairDeviceDialog />);
    for (const box of screen.getAllByRole("checkbox")) {
      if (box.getAttribute("aria-checked") === "true") await userEvent.click(box);
    }
    expect(screen.getByRole("button", { name: /show qr/i })).toBeDisabled();
  });

  it("renders the returned SVG and the typeable code", async () => {
    mintMock.mockResolvedValueOnce({ code: "7K2M-9QX4", qrSvg: "<svg/>",
                                     expiresAt: inSeconds(180), endpoints: ["http://127.0.0.1:8787"] });
    render(<PairDeviceDialog />);
    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));
    expect(await screen.findByText("7K2M-9QX4")).toBeVisible();
  });

  it("renders the QR as an image source, never as inlined markup", async () => {
    // SVG is an active document format: <svg> admits <script> and event
    // handlers. Inlining it with dangerouslySetInnerHTML would make the QR
    // an XSS sink the day anything but our own daemon can influence it. As
    // an <img src="data:"> the browser refuses to execute script inside it.
    mintMock.mockResolvedValueOnce({ code: "7K2M-9QX4",
                                     qrSvg: "<svg onload=\"alert(1)\"/>",
                                     expiresAt: inSeconds(180), endpoints: [] });
    const { container } = render(<PairDeviceDialog />);
    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("img")!.getAttribute("src"))
      .toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("counts down and marks the code expired", async () => {
    mintMock.mockResolvedValueOnce({ code: "7K2M-9QX4", qrSvg: "<svg/>",
                                     expiresAt: inSeconds(1), endpoints: [] });
    render(<PairDeviceDialog />);
    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));
    expect(await screen.findByText(/expired/i)).toBeVisible();
  });

  // I-1/I-2 fix round: the checkbox row must not show a capability as
  // grantable when this device cannot actually mint it -- the daemon
  // intersects it away regardless, but a UI that ticks it anyway has shown
  // the person one boundary and enforced a narrower one, which is exactly
  // backwards for the one screen whose whole job is showing them the real
  // boundary. `effective`, not `granted`, is what's withheld here.
  it("unticks and disables a capability this device cannot mint, and never sends it", async () => {
    useAuthStore.setState({
      phase: "authorized",
      session: authorizedSession(CAPABILITIES.filter((c) => c !== "files")),
      refusal: null,
    });
    mintMock.mockResolvedValueOnce({ code: "7K2M-9QX4", qrSvg: "<svg/>",
                                     expiresAt: inSeconds(180), endpoints: [] });
    render(<PairDeviceDialog />);

    const filesBox = screen.getByRole("checkbox", { name: /files/i });
    expect(filesBox).not.toBeChecked();
    expect(filesBox).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));

    expect(mintMock).toHaveBeenCalledTimes(1);
    const [, , body] = mintMock.mock.calls[0] as [string, string, { grants: string[] }];
    expect(body.grants).not.toContain("files");
    expect(body.grants.length).toBeGreaterThan(0);
  });
});

// Defect B: the dialog used to call POST /v1/pair/code with only
// {label, grants} -- no transport at all -- so the daemon always minted a
// loopback QR, unreachable from a phone on a tunnel. These pin the fix:
// the running-transports list (never hardcoded) drives a selector, anything
// stopped is visible but disabled with a reason, and the chosen name rides
// the mint request.
//
// `TransportPayload.pairable` (Milestone 6b) is the policy-level reason a
// transport that IS running can still be disabled -- the name-keyed refusal
// this file used to carry for `quick` specifically is gone with its removal,
// replaced by reading the wire field generically (`runningUnpairable` below
// stands in, since none of TENKA's three shipped transports sets it false).
describe("PairDeviceDialog transport selection", () => {
  beforeEach(() => {
    mintMock.mockReset();
  });

  afterEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  it("defaults to local, unaffected by which transports are running", () => {
    render(<PairDeviceDialog transports={[tailnet]} />);
    expect(screen.getByRole("radio", { name: /^local$/i })).toBeChecked();
  });

  it("offers a running transport as a selectable option", async () => {
    render(<PairDeviceDialog transports={[tailnet]} />);
    const radio = screen.getByRole("radio", { name: /^tailnet$/i });
    expect(radio).toBeEnabled();
    await userEvent.click(radio);
    expect(radio).toBeChecked();
  });

  it("never hardcodes a transport name -- a transport this build has never heard of still renders", () => {
    render(
      <PairDeviceDialog
        transports={[{ name: "wireguard-mesh", running: true, url: "https://mesh.example", ceiling: [], raisable: [], pairable: true }]}
      />,
    );
    expect(screen.getByRole("radio", { name: /wireguard-mesh/i })).toBeEnabled();
  });

  it("disables a transport that is not currently running, with a reason", () => {
    render(<PairDeviceDialog transports={[stoppedFunnel]} />);
    const radio = screen.getByRole("radio", { name: /^funnel$/i });
    expect(radio).toBeDisabled();
    expect(screen.getByText(/not running/i)).toBeInTheDocument();
  });

  // Milestone 6b: the policy-level reason a RUNNING transport can still be
  // disabled -- `pairable: false` off the wire, never a name check. This is
  // the replacement for the old `quick`-specific test; the mechanism this
  // proves is "the field, not the name, gates the radio".
  it("disables a running transport whose policy refuses pairing, with a reason naming no transport", () => {
    render(<PairDeviceDialog transports={[runningUnpairable]} />);
    const radio = screen.getByRole("radio", { name: /^restricted$/i });
    expect(radio).toBeDisabled();
    expect(screen.getByText(/can't carry a pairing/i)).toBeInTheDocument();
  });

  it("cannot click a pairable:false transport into being chosen, and mints local instead", async () => {
    mintMock.mockResolvedValueOnce({ code: "7K2M-9QX4", qrSvg: "<svg/>",
                                     expiresAt: inSeconds(180), endpoints: [] });
    render(<PairDeviceDialog transports={[runningUnpairable]} />);
    await userEvent.click(screen.getByRole("radio", { name: /^restricted$/i }));
    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));

    const [, , body] = mintMock.mock.calls[0] as [string, string, { transport: string }];
    expect(body.transport).toBe("local");
  });

  it("sends local in the mint body when the selector is left untouched", async () => {
    mintMock.mockResolvedValueOnce({ code: "7K2M-9QX4", qrSvg: "<svg/>",
                                     expiresAt: inSeconds(180), endpoints: [] });
    render(<PairDeviceDialog transports={[tailnet]} />);
    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));

    const [, , body] = mintMock.mock.calls[0] as [string, string, { transport: string }];
    expect(body.transport).toBe("local");
  });

  it("sends the chosen running transport in the mint body", async () => {
    mintMock.mockResolvedValueOnce({ code: "7K2M-9QX4", qrSvg: "<svg/>",
                                     expiresAt: inSeconds(180), endpoints: [] });
    render(<PairDeviceDialog transports={[tailnet]} />);
    await userEvent.click(screen.getByRole("radio", { name: /^tailnet$/i }));
    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));

    const [, , body] = mintMock.mock.calls[0] as [string, string, { transport: string }];
    expect(body.transport).toBe("tailnet");
  });

  it("cannot click a disabled transport into being chosen, and mints local instead", async () => {
    mintMock.mockResolvedValueOnce({ code: "7K2M-9QX4", qrSvg: "<svg/>",
                                     expiresAt: inSeconds(180), endpoints: [] });
    render(<PairDeviceDialog transports={[stoppedFunnel]} />);
    await userEvent.click(screen.getByRole("radio", { name: /^funnel$/i }));
    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));

    const [, , body] = mintMock.mock.calls[0] as [string, string, { transport: string }];
    expect(body.transport).toBe("local");
  });

  it("names the daemon's own 409 for a transport that stopped between render and mint", async () => {
    mintMock.mockRejectedValueOnce(new ApiError(409, "conflict"));
    render(<PairDeviceDialog transports={[tailnet]} />);
    await userEvent.click(screen.getByRole("radio", { name: /^tailnet$/i }));
    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not running|hasn.t published/i);
  });
});

// Item 1: the checkboxes must not lie about what the SELECTED TRANSPORT can
// actually carry. `TransportPayload.ceiling`/`raisable` are the wire fields
// the daemon itself intersects a redeemed code's grants against, so a
// fixture needs a realistic split of the two -- not an empty `ceiling`
// alongside an empty `raisable`, which would make "this capability is
// disabled" true for the wrong reason (the whole row would be pointless
// either way). `tailnet` (above) already has that split for the raisable
// case; `funnelRunning` below adds it for the "in neither" case, since
// `stoppedFunnel` can't be selected at all (it isn't running).
describe("PairDeviceDialog capability availability by transport (item 1)", () => {
  const funnelRunning = {
    name: "funnel",
    running: true,
    url: "https://example.trycloudflare.com",
    ceiling: ["observe", "recall", "chat_send", "screen", "files"],
    raisable: [],
    pairable: true,
  };

  beforeEach(() => {
    mintMock.mockReset();
  });

  afterEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  // State 1: in `ceiling` -- granted and usable immediately. Enabled, no note.
  it("leaves a ceiling capability ticked and enabled once its transport is selected", async () => {
    render(<PairDeviceDialog transports={[tailnet]} />);
    await userEvent.click(screen.getByRole("radio", { name: /^tailnet$/i }));

    const observeBox = screen.getByRole("checkbox", { name: /^observe$/i });
    expect(observeBox).toBeEnabled();
    expect(observeBox).toBeChecked();
  });

  /** The reach line lives at the checkbox's own `aria-describedby` id --
   * scoping through that, rather than a page-wide `getByText`, is what keeps
   * this assertion pinned to ONE row even when another row (e.g. `execute`,
   * also unavailable on `funnelRunning`) happens to read the same sentence. */
  function reachTextFor(name: RegExp): string {
    const box = screen.getByRole("checkbox", { name });
    const describedBy = box.getAttribute("aria-describedby")!;
    return document.getElementById(describedBy)!.textContent ?? "";
  }

  // State 2: in `raisable` but not `ceiling` -- MUST stay tickable, ticked,
  // and enabled. This is the load-bearing case: unticking or hiding it would
  // recreate the defect that made the raise mechanism unreachable, since a
  // device never issued a capability at pairing can never be raised into it
  // later. `system_control` is one of the six ordinary grants, ticked by
  // default, so selecting tailnet is the only action this test needs to take.
  it("keeps a raisable-only capability ticked and enabled, and says it needs a raise", async () => {
    render(<PairDeviceDialog transports={[tailnet]} />);
    await userEvent.click(screen.getByRole("radio", { name: /^tailnet$/i }));

    const systemControlBox = screen.getByRole("checkbox", { name: /system control/i });
    expect(systemControlBox).toBeEnabled();
    expect(systemControlBox).toBeChecked();
    expect(reachTextFor(/system control/i)).toMatch(/needs a raise on this transport/i);
  });

  // State 3: in neither -- cannot be issued on this transport at all. Must be
  // disabled AND unticked (never left ticked-but-disabled, which would still
  // be silently stripped by the daemon), with a reason distinct from "this
  // device doesn't hold it".
  it("disables and unticks a capability the selected transport can never carry", async () => {
    mintMock.mockResolvedValueOnce({ code: "7K2M-9QX4", qrSvg: "<svg/>",
                                     expiresAt: inSeconds(180), endpoints: [] });
    render(<PairDeviceDialog transports={[funnelRunning]} />);
    await userEvent.click(screen.getByRole("radio", { name: /^funnel$/i }));

    const systemControlBox = screen.getByRole("checkbox", { name: /system control/i });
    expect(systemControlBox).toBeDisabled();
    expect(systemControlBox).not.toBeChecked();
    expect(reachTextFor(/system control/i)).toMatch(/this transport can't carry it/i);

    await userEvent.click(screen.getByRole("button", { name: /show qr/i }));
    const [, , body] = mintMock.mock.calls[0] as [string, string, { grants: string[] }];
    expect(body.grants).not.toContain("system_control");
  });

  // The two reasons a box can be dead read as two different sentences. A
  // capability the device itself doesn't hold must say so even while its
  // note about the selected transport being unable to carry it would
  // otherwise also apply -- these must never collapse into one message.
  it("keeps the device-level reason distinguishable from the transport-level one", async () => {
    useAuthStore.setState({
      phase: "authorized",
      session: authorizedSession(CAPABILITIES.filter((c) => c !== "system_control")),
      refusal: null,
    });
    render(<PairDeviceDialog transports={[funnelRunning]} />);
    await userEvent.click(screen.getByRole("radio", { name: /^funnel$/i }));

    const text = reachTextFor(/system control/i);
    expect(text).toMatch(/this device doesn't hold it/i);
    expect(text).not.toMatch(/this transport can't carry it/i);
  });

  // Invariant: local's ceiling holds everything, so selecting it must never
  // disable a single capability, no matter how narrow the OTHER transports
  // on offer are.
  it("disables nothing when local is selected, regardless of what other transports carry", () => {
    render(<PairDeviceDialog transports={[tailnet, funnelRunning]} />);
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).toBeEnabled();
    }
  });
});

// Item 2: real form controls, not raw browser defaults, but still real form
// controls -- keyboard focus, space, and arrow-key behaviour must survive the
// restyle. jsdom cannot verify appearance, so these assert behaviour only.
describe("PairDeviceDialog control restyle keeps keyboard behaviour (item 2)", () => {
  afterEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  it("toggles a checkbox with the keyboard, not just a pointer click", async () => {
    render(<PairDeviceDialog />);
    const screenBox = screen.getByRole("checkbox", { name: /^screen$/i });
    screenBox.focus();
    expect(screenBox).toHaveFocus();
    expect(screenBox).toBeChecked();

    await userEvent.keyboard(" ");
    expect(screenBox).not.toBeChecked();
  });

  it("moves the transport selection with the arrow keys, not just a pointer click", async () => {
    render(<PairDeviceDialog transports={[tailnet]} />);
    const localRadio = screen.getByRole("radio", { name: /^local$/i });
    const tailnetRadio = screen.getByRole("radio", { name: /^tailnet$/i });
    localRadio.focus();
    expect(localRadio).toHaveFocus();

    // `{ArrowDown>}` presses without releasing. Radix's roving-focus group
    // defers the actual focus move to a `setTimeout(0)` (its own source) so
    // that a document-level "arrow key is currently down" flag -- read by
    // the newly focused item's own onFocus handler to decide whether to
    // self-select -- is still true when that callback runs. A same-tick
    // `{ArrowDown}` (press-and-release) has `userEvent` fire the matching
    // keyup on a microtask, which drains before that macrotask and clears
    // the flag first -- keeping the key "held" until after the assertions
    // below is what an actual keyboard user's timing looks like anyway.
    await userEvent.keyboard("{ArrowDown>}");
    // @radix-ui/react-roving-focus defers the actual focus move to a
    // `setTimeout(0)` (see its own source) specifically so the arrow-pressed
    // flag -- set by a real document-level keydown listener as the ORIGINAL
    // event finishes bubbling -- is already true by the time the newly
    // focused item's own onFocus handler reads it and self-selects. A plain
    // synchronous assertion right after `userEvent.keyboard` would race that
    // deferred callback, so this waits for the focus move it is gated on.
    await waitFor(() => expect(tailnetRadio).toHaveFocus());
    // The resulting `onValueChange` -- fired by a `.click()` Radix calls from
    // inside that same deferred callback -- runs through React's own
    // scheduler rather than a synchronous act()-tracked update here (hence
    // its own `waitFor` rather than a bare assertion right after focus').
    await waitFor(() => expect(tailnetRadio).toBeChecked());
    await userEvent.keyboard("{/ArrowDown}");
  });

  // Both GrantRow and TransportRow wire a separate <label htmlFor=...> to the
  // control's id rather than nesting the control inside the label -- a shape
  // that only works if the id/htmlFor pairing survives the restyle onto
  // Radix's button-based primitives. `button` is a labelable element per the
  // HTML spec (same as input/select/textarea), so a native label click still
  // forwards to it; this pins that the wiring, not just the visual label,
  // made the jump from the raw <input> this replaced.
  it("toggles the checkbox by clicking its associated label text, not just the box itself", async () => {
    render(<PairDeviceDialog />);
    const screenBox = screen.getByRole("checkbox", { name: /^screen$/i });
    expect(screenBox).toBeChecked();

    await userEvent.click(screen.getByText("Screen"));
    expect(screenBox).not.toBeChecked();
  });

  it("selects the radio by clicking its associated label text, not just the control itself", async () => {
    render(<PairDeviceDialog transports={[tailnet]} />);
    const tailnetRadio = screen.getByRole("radio", { name: /^tailnet$/i });
    expect(tailnetRadio).not.toBeChecked();

    await userEvent.click(screen.getByText("tailnet"));
    await waitFor(() => expect(tailnetRadio).toBeChecked());
  });
});
