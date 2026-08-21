import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DeviceList } from "./DeviceList";
import { useAuthStore } from "@/store/auth-store";
import type { components } from "@/types/api";

type DevicePayload = components["schemas"]["DevicePayload"];

const { revokeMock } = vi.hoisted(() => ({ revokeMock: vi.fn() }));

vi.mock("@/services/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/http")>();
  return { ...actual, apiSend: revokeMock };
});

const iso = () => new Date().toISOString();

const oneDevice: DevicePayload[] = [{ deviceId: "a", label: "Pixel 8", grants: ["observe"],
                      createdAt: iso(), lastSeenAt: iso(), raises: [], pairedOn: "local" }];

describe("DeviceList", () => {
  beforeEach(() => {
    revokeMock.mockReset();
  });

  afterEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  it("lists devices with last seen and confirms before revoking", async () => {
    render(<DeviceList devices={oneDevice} />);
    await userEvent.click(screen.getByRole("button", { name: /revoke/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/Pixel 8/);
    expect(revokeMock).not.toHaveBeenCalled();
  });

  // I-3 fix round: revoke shares the loopback + system_control precondition
  // with mint and list, and the brief's own warning was against a button
  // that always looks clickable and only fails after the click. A remote
  // (non-local) or non-admin session must disable it up front, not
  // discover the daemon's 403 from a click.
  it("disables revoke and explains why once the session is known to be refused", () => {
    useAuthStore.setState({
      phase: "authorized",
      session: {
        deviceId: "d1",
        label: "This desktop",
        granted: ["system_control"],
        effective: ["system_control"],
        policy: "funnel",
        canUse: (c: string) => c === "system_control",
      },
      refusal: null,
    });
    render(<DeviceList devices={oneDevice} />);
    expect(screen.getByRole("button", { name: /revoke/i })).toBeDisabled();
    expect(screen.getByText(/refuses it from anywhere else/i)).toBeInTheDocument();
  });

  // Milestone 6b.
  describe("the raise control", () => {
    const tailnetTransport = {
      name: "tailnet",
      running: true,
      url: "https://phone.tailnet.ts.net",
      ceiling: ["observe", "recall", "chat_send", "screen", "files"],
      raisable: ["execute", "system_control"],
      pairable: true,
    };

    it("disables raise for the same refusal reason as revoke", () => {
      useAuthStore.setState({
        phase: "authorized",
        session: {
          deviceId: "d1",
          label: "This desktop",
          granted: ["system_control"],
          effective: ["system_control"],
          policy: "funnel",
          canUse: (c: string) => c === "system_control",
        },
        refusal: null,
      });
      render(<DeviceList devices={oneDevice} transports={[tailnetTransport]} />);
      expect(screen.getByRole("button", { name: /raise/i })).toBeDisabled();
    });

    it("opens the raise dialog naming this device, and reports no candidate transport when grants don't overlap raisable", async () => {
      // oneDevice holds only `observe`, and tailnetTransport's raisable is
      // execute/system_control -- no overlap, so the dialog must say so
      // rather than offering a transport that would 403.
      render(<DeviceList devices={oneDevice} transports={[tailnetTransport]} />);
      await userEvent.click(screen.getByRole("button", { name: /raise/i }));
      expect(screen.getByText(/Raise Pixel 8's ceiling/i)).toBeInTheDocument();
      expect(screen.getByText(/no transport can ever carry more/i)).toBeInTheDocument();
    });

    it("shows a live raise inline on the row it belongs to", () => {
      const raised: DevicePayload[] = [
        {
          deviceId: "a",
          label: "Pixel 8",
          grants: ["observe", "execute"],
          createdAt: iso(),
          lastSeenAt: iso(),
          pairedOn: "tailnet",
          raises: [
            {
              deviceId: "a",
              transport: "tailnet",
              capabilities: ["execute"],
              expiresInSeconds: 1800,
              reason: "debugging a crash report",
            },
          ],
        },
      ];
      render(<DeviceList devices={raised} />);
      expect(screen.getByText(/raised on tailnet/i)).toBeInTheDocument();
      expect(screen.getByText(/30m left/i)).toBeInTheDocument();
    });

    /**
     * Milestone 6b live-test item 2. The property under test: reaching zero
     * calls the caller's refetch (`onRaiseMaybeExpired`) -- it does not
     * decide locally that the raise ended. A version that hid the badge on
     * `expiresInSeconds <= 0` without ever calling that prop would still
     * make "raised on tailnet" disappear and pass an assertion that only
     * checked the text; the assertion on `onRaiseMaybeExpired` is what a
     * silent "assume it's gone" implementation would fail.
     */
    it("counts a raise down locally and asks the caller to refetch on expiry, hiding the stale badge until it does", () => {
      vi.useFakeTimers();
      const onRaiseMaybeExpired = vi.fn();
      const raised: DevicePayload[] = [
        {
          deviceId: "a",
          label: "Pixel 8",
          grants: ["observe", "execute"],
          createdAt: iso(),
          lastSeenAt: iso(),
          pairedOn: "tailnet",
          raises: [
            {
              deviceId: "a",
              transport: "tailnet",
              capabilities: ["execute"],
              expiresInSeconds: 2,
              reason: "debugging a crash report",
            },
          ],
        },
      ];
      render(<DeviceList devices={raised} onRaiseMaybeExpired={onRaiseMaybeExpired} />);
      expect(screen.getByText(/raised on tailnet/i)).toBeInTheDocument();

      act(() => void vi.advanceTimersByTime(1000));
      expect(onRaiseMaybeExpired).not.toHaveBeenCalled();

      act(() => void vi.advanceTimersByTime(1000));
      // Stopped displaying the claim -- not "0m left", nothing at all.
      expect(screen.queryByText(/raised on tailnet/i)).not.toBeInTheDocument();
      expect(onRaiseMaybeExpired).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  // Milestone 6b live-test items 3 & 4.
  describe("this device's own row", () => {
    function sessionOn(deviceId: string) {
      useAuthStore.setState({
        phase: "authorized",
        refusal: null,
        session: {
          deviceId,
          label: "This desktop",
          granted: ["system_control"],
          effective: ["system_control"],
          policy: "local",
          canUse: (c: string) => c === "system_control",
        },
      });
    }

    it("labels the row, and offers no RAISE, for the device making the request", () => {
      sessionOn("a"); // oneDevice's own deviceId
      render(<DeviceList devices={oneDevice} />);

      expect(screen.getByText(/this device/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^raise$/i })).not.toBeInTheDocument();
      // Revoke stays -- it is the recoverable, deliberate control this item
      // keeps, not the one it removes.
      expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument();
    });

    it("still offers RAISE for a device that is not this session's own", () => {
      sessionOn("someone-else");
      render(<DeviceList devices={oneDevice} />);
      expect(screen.getByRole("button", { name: /^raise$/i })).toBeInTheDocument();
      expect(screen.queryByText(/this device/i)).not.toBeInTheDocument();
    });

    it("names the consequence before revoking this session's own device", async () => {
      sessionOn("a");
      render(<DeviceList devices={oneDevice} />);
      await userEvent.click(screen.getByRole("button", { name: /revoke/i }));

      expect(screen.getByRole("dialog")).toHaveTextContent(/ends your own session/i);
      expect(screen.getByRole("dialog")).toHaveTextContent(/admin access/i);
    });

    it("keeps the ordinary revoke wording for a device that is not this session's own", async () => {
      sessionOn("someone-else");
      render(<DeviceList devices={oneDevice} />);
      await userEvent.click(screen.getByRole("button", { name: /revoke/i }));

      expect(screen.getByRole("dialog")).not.toHaveTextContent(/ends your own session/i);
    });
  });

  // Item 3: `pairedOn` -- Milestone 6b's daemon-side addition to each
  // `GET /v1/devices` row, now a real (required, nullable) field on the
  // generated `DevicePayload` (types/api.d.ts regenerated from openapi.json).
  describe("pairedOn (item 3)", () => {
    // The line is built from a few sibling text nodes/spans (date, "via",
    // the value, "last seen"...), so a text-content assertion on the
    // rendered container is the robust check here -- `getByText` matches a
    // single element's own text and would otherwise have to know the exact
    // DOM shape this line happens to be split across.
    it("names the transport a device paired over", () => {
      const devices: DevicePayload[] = [{ ...oneDevice[0], pairedOn: "tailnet" }];
      const { container } = render(<DeviceList devices={devices} />);
      expect(container.textContent).toMatch(/via tailnet/i);
    });

    // `null` -- a device paired before the daemon recorded this at all -- must
    // read as genuinely unknown. Not "local" (the common case, but not a safe
    // default to guess), and not blank (indistinguishable from a rendering bug).
    it("reads a null pairedOn as genuinely unknown, never as local or blank", () => {
      const devices: DevicePayload[] = [{ ...oneDevice[0], pairedOn: null }];
      const { container } = render(<DeviceList devices={devices} />);
      expect(container.textContent).toMatch(/via unknown transport/i);
      expect(container.textContent).not.toMatch(/via local/i);
    });

    // The current schema requires the key, but a daemon build old enough to
    // predate this field could still omit it outright -- `pairedOnLabel`'s
    // `??` must treat that identically to `null`, never crash, and never
    // read as blank. Built by deleting the key rather than typing a fixture
    // without it, since `DevicePayload` itself no longer allows that shape.
    it("treats a payload that omits pairedOn entirely the same as null", () => {
      const withoutPairedOn = { ...oneDevice[0] } as Partial<DevicePayload>;
      delete withoutPairedOn.pairedOn;
      const devices = [withoutPairedOn] as DevicePayload[];
      const { container } = render(<DeviceList devices={devices} />);
      expect(container.textContent).toMatch(/via unknown transport/i);
    });
  });
});
