/**
 * The LIVE settings route, which the demo route's own test cannot cover: the
 * devices/pairing section exists only here, passed in as `extra`.
 *
 * Two faults are pinned here. The section had no panel entry and rendered
 * after everything, so it sat below Danger Zone with nothing in the rail
 * pointing at it (fault 3); and its own fetch never settled, leaving a
 * skeleton under the pair card forever in the one session that could actually
 * reach the route (fault 4).
 */
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import AppSettingsPage from "./page";
import { useAuthStore } from "@/store/auth-store";
import { useSettingsStore } from "@/store/settings-store";
import { usePersonalityStore } from "@/store/personality-store";
import { useSystemStore } from "@/store/system-store";
import { useMemoryStore } from "@/store/memory-store";
import { seedMemory } from "@/store/memory-scripts";
import { emitInvalidate, INVALIDATE_DEBOUNCE_MS, __resetInvalidateForTests } from "@/lib/invalidate";
import type { Capability } from "@/types/session";

const { apiGetMock, apiSendMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiSendMock: vi.fn(),
}));

vi.mock("@/services/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/http")>();
  return { ...actual, apiGet: apiGetMock, apiSend: apiSendMock };
});

// Radix Slider measures its track; the ready registry renders several.
class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const iso = () => new Date().toISOString();

/** The admin session: system_control, on the loopback listener. */
function adminSession() {
  authorize(["system_control", "observe"], ["system_control", "observe"], "local");
}

function authorize(granted: Capability[], effective: Capability[], policy: string) {
  const usable = new Set<string>(effective);
  useAuthStore.setState({
    phase: "authorized",
    refusal: null,
    session: {
      deviceId: "desktop-1",
      label: "This desktop",
      granted,
      effective,
      policy,
      canUse: (c) => usable.has(c),
    },
  });
}

describe("live settings page", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    // jsdom has no scrollIntoView, and the rail's jump links call it inside a
    // requestAnimationFrame -- an unhandled throw a frame after the click,
    // which vitest reports as an uncaught exception rather than a failure.
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  });
  afterAll(() => vi.unstubAllGlobals());

  /**
   * Path-aware default: the live settings route now fires two independent
   * admin GETs (devices, transports -- see AppSettingsPage's own doc), and a
   * blanket `mockResolvedValue` cannot answer both with the shape each one
   * expects. Tests that need a specific answer for one path still override it
   * with `mockImplementationOnce`, which only intercepts the very next call
   * REGARDLESS of path -- so those overrides are written path-aware too,
   * rather than assuming devices' effect happens to fire first.
   */
  function defaultApiGet(path: string) {
    if (path === "/v1/transports") return Promise.resolve({ transports: [] });
    return Promise.resolve({ devices: [] });
  }

  beforeEach(() => {
    localStorage.clear();
    apiGetMock.mockReset();
    apiGetMock.mockImplementation(defaultApiGet);
    apiSendMock.mockReset();
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), status: "ready" });
    usePersonalityStore.setState(usePersonalityStore.getInitialState(), true);
    useSystemStore.setState(useSystemStore.getInitialState(), true);
    useMemoryStore.setState({
      ...useMemoryStore.getInitialState(),
      ...seedMemory(),
      status: "ready",
    });
  });

  afterEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    __resetInvalidateForTests();
  });

  /**
   * PROOF-OF-FAILURE (fault 4). The devices effect listed `status` in its own
   * dependency array and bailed unless it was "idle". Setting it to "loading"
   * was therefore a dependency change: React ran the cleanup -- which sets
   * `cancelled = true` -- then re-ran the effect, where the guard returned
   * immediately. The in-flight GET resolved into a closure that had already
   * been told to ignore its own result, so `ready` was never written and the
   * skeleton stayed. Before the fix this waitFor times out.
   */
  it("resolves the devices section instead of leaving a skeleton under the pair card", async () => {
    adminSession();
    render(<AppSettingsPage />);
    await waitFor(() => expect(screen.getByText(/paired devices/i)).toBeInTheDocument());
    expect(apiGetMock).toHaveBeenCalledWith("/v1/devices");
  });

  it("issues exactly one listing for one mount", async () => {
    adminSession();
    render(<AppSettingsPage />);
    await waitFor(() => expect(screen.getByText(/paired devices/i)).toBeInTheDocument());
    expect(apiGetMock.mock.calls.filter((c) => c[0] === "/v1/devices")).toHaveLength(1);
  });

  it("a retry after a failed listing actually re-fetches", async () => {
    adminSession();
    // Path-aware AND order-independent: `mockRejectedValueOnce` intercepts
    // whichever of the two admin GETs happens to fire first, which is a race
    // between two sibling effects, not necessarily devices'. Counting only
    // `/v1/devices` calls fails exactly the first one of THAT path, no matter
    // when transports' own call lands relative to it.
    let deviceCalls = 0;
    apiGetMock.mockImplementation((path: string) => {
      if (path === "/v1/devices") {
        deviceCalls += 1;
        if (deviceCalls === 1) return Promise.reject(new Error("offline"));
      }
      return defaultApiGet(path);
    });
    render(<AppSettingsPage />);

    await waitFor(() =>
      expect(screen.getByText("She could not reach her paired devices.")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByText(/paired devices/i)).toBeInTheDocument());
  });

  /**
   * Milestone 6b live-test item 1: the page-level half of the wiring --
   * `hooks/useEventStream.ts` (tested on its own) dispatches the socket
   * frame through `lib/invalidate.ts`; this pins that `DevicesPanel` and
   * `TransportsPanel` actually subscribe and reuse their OWN existing fetch
   * (bumping `attempt`), rather than a second network path living here.
   * `useEventStream` itself is never mounted in this test -- `emitInvalidate`
   * stands in for "the socket received the frame", which is the seam this
   * page's own subscription is on the other side of.
   */
  it("refetches devices and transports independently on their own invalidate signal, reusing the existing fetch", async () => {
    adminSession();
    render(<AppSettingsPage />);

    // Real timers for the initial mount -- fake timers and testing-library's
    // interval-polling `waitFor` do not mix, so the clock is only faked
    // AFTER the page has settled, for the debounce window itself.
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("/v1/devices"));
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("/v1/transports"));
    const devicesCallsBefore = apiGetMock.mock.calls.filter((c) => c[0] === "/v1/devices").length;
    const transportsCallsBefore = apiGetMock.mock.calls.filter(
      (c) => c[0] === "/v1/transports",
    ).length;

    vi.useFakeTimers();
    try {
      emitInvalidate("devices");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(INVALIDATE_DEBOUNCE_MS);
      });

      expect(
        apiGetMock.mock.calls.filter((c) => c[0] === "/v1/devices").length,
      ).toBe(devicesCallsBefore + 1);
      // The sibling resource must not also refetch on a `devices` signal.
      expect(
        apiGetMock.mock.calls.filter((c) => c[0] === "/v1/transports").length,
      ).toBe(transportsCallsBefore);

      emitInvalidate("transports");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(INVALIDATE_DEBOUNCE_MS);
      });

      expect(
        apiGetMock.mock.calls.filter((c) => c[0] === "/v1/transports").length,
      ).toBe(transportsCallsBefore + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not throw and does not refetch anything for a resource this build has never heard of", async () => {
    adminSession();
    render(<AppSettingsPage />);
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("/v1/devices"));
    const callsBefore = apiGetMock.mock.calls.length;

    vi.useFakeTimers();
    try {
      expect(() => emitInvalidate("a-future-table")).not.toThrow();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(INVALIDATE_DEBOUNCE_MS);
      });

      expect(apiGetMock.mock.calls.length).toBe(callsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  // ─── fault 3: the rail, and the order ───────────────────────────────

  it("lists Devices & Pairing in the settings rail", () => {
    adminSession();
    render(<AppSettingsPage />);
    expect(screen.getByRole("button", { name: "Devices & Pairing" })).toBeInTheDocument();
  });

  it("renders the devices section above Danger Zone, not below it", async () => {
    adminSession();
    const { container } = render(<AppSettingsPage />);
    await waitFor(() => expect(container.querySelector("#panel-devices")).not.toBeNull());

    const devices = container.querySelector("#panel-devices")!;
    const danger = container.querySelector("#panel-danger")!;
    // Node.DOCUMENT_POSITION_FOLLOWING: danger comes after devices.
    expect(devices.compareDocumentPosition(danger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the rail's devices link scrolls to a section that exists", () => {
    adminSession();
    const { container } = render(<AppSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Devices & Pairing" }));
    expect(container.querySelector("#panel-devices")).not.toBeNull();
  });

  it("searching for pairing surfaces the devices section and drops the others", async () => {
    adminSession();
    apiGetMock.mockImplementation((path: string) =>
      path === "/v1/devices"
        ? Promise.resolve({
            devices: [
              { deviceId: "a", label: "Pixel 8", grants: ["observe"], createdAt: iso(),
                lastSeenAt: iso(), raises: [] },
            ],
          })
        : defaultApiGet(path),
    );
    const { container } = render(<AppSettingsPage />);
    const [search] = screen.getAllByLabelText("Search settings");
    fireEvent.change(search, { target: { value: "pairing" } });

    await waitFor(() => expect(container.querySelector("#panel-devices")).not.toBeNull());
    expect(container.querySelector("#panel-danger")).toBeNull();
    expect(screen.queryByText(/no setting matches/i)).not.toBeInTheDocument();
  });

  it("keeps the devices section reachable when the settings load itself failed", async () => {
    // Devices does not depend on the settings registry. Losing the only way to
    // revoke a credential because an unrelated GET failed would be its own bug.
    adminSession();
    useSettingsStore.setState({ status: "error" });
    render(<AppSettingsPage />);
    await waitFor(() => expect(screen.getByText(/paired devices/i)).toBeInTheDocument());
  });

  // ─── Milestone 6b: the transports section, the second independent slot ──

  it("resolves the transports section and lists it above devices, in the rail and in the DOM", async () => {
    adminSession();
    apiGetMock.mockImplementation((path: string) =>
      path === "/v1/transports"
        ? Promise.resolve({
            transports: [
              { name: "tailnet", running: false, url: null,
                ceiling: ["observe"], raisable: ["execute"], pairable: true },
            ],
          })
        : defaultApiGet(path),
    );
    const { container } = render(<AppSettingsPage />);

    await waitFor(() =>
      expect(container.querySelector("#panel-transports")).not.toBeNull(),
    );
    expect(apiGetMock).toHaveBeenCalledWith("/v1/transports");
    expect(screen.getByRole("button", { name: "Transports" })).toBeInTheDocument();

    await waitFor(() => expect(container.querySelector("#panel-transports")).not.toBeNull());
    const transports = container.querySelector("#panel-transports")!;
    const devices = container.querySelector("#panel-devices")!;
    expect(transports.compareDocumentPosition(devices) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  // Item 4: the wrapper (`TransportsPanel`, just above) and `TransportList`
  // itself both used to render their own "transports" <h2>, one directly
  // under the other. Only the wrapper's should survive -- the same shape
  // `DevicesPanel`'s "devices & pairing" heading already has over
  // `PairDeviceDialog`/`DeviceList`, whose OWN headings read differently
  // ("pair a device" / "paired devices") rather than repeating the parent's.
  it("renders the TRANSPORTS heading once, not once from the wrapper and once from the list", async () => {
    adminSession();
    apiGetMock.mockImplementation((path: string) =>
      path === "/v1/transports"
        ? Promise.resolve({
            transports: [
              { name: "tailnet", running: false, url: null,
                ceiling: ["observe"], raisable: ["execute"], pairable: true },
            ],
          })
        : defaultApiGet(path),
    );
    render(<AppSettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /^transports$/i })).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("heading", { name: /^transports$/i })).toHaveLength(1);
  });

  it("hands the loaded transports down to the device list's own raise dialog", async () => {
    adminSession();
    apiGetMock.mockImplementation((path: string) => {
      if (path === "/v1/transports") {
        return Promise.resolve({
          transports: [
            { name: "tailnet", running: true, url: "https://phone.ts.net",
              ceiling: ["observe"], raisable: ["execute"], pairable: true },
          ],
        });
      }
      if (path === "/v1/devices") {
        return Promise.resolve({
          devices: [
            { deviceId: "a", label: "Pixel 8", grants: ["observe", "execute"],
              createdAt: iso(), lastSeenAt: iso(), raises: [] },
          ],
        });
      }
      return defaultApiGet(path);
    });
    render(<AppSettingsPage />);

    await waitFor(() => expect(screen.getByText(/paired devices/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^raise$/i }));
    // If `transports` had not made it down, this dialog would report no
    // candidate transport instead of offering `execute` to tick.
    expect(await screen.findByRole("checkbox", { name: /execute/i })).toBeInTheDocument();
  });

  // ─── fix round 2, Defect 1: starting/stopping refreshes every consumer ──

  /**
   * PROOF-OF-FAILURE (Defect 1). `TransportsPanel` used to hold its own copy
   * of `transports`, mirrored up to this page only once, at the end of the
   * initial `GET /v1/transports`. `start()` then updated ONLY that local
   * copy, so `PairDeviceDialog` -- fed from this page's OWN (separate,
   * un-refreshed) `transports` state -- kept reporting tailnet as "not
   * running" after a successful start, on the very same page, until a
   * reload re-ran the fetch. Before the fix (reintroduce a local
   * `useState<TransportPayload[]>` inside `TransportsPanel` and have
   * `start()`/`stop()` write only that) this goes red: the radio stays
   * disabled and the stale reason stays on screen.
   */
  it("starting a transport updates the pair dialog's own copy, on the same page, without a reload", async () => {
    adminSession();
    let running = false;
    apiGetMock.mockImplementation((path: string) => {
      if (path === "/v1/transports") {
        return Promise.resolve({
          transports: [
            {
              name: "tailnet",
              running,
              url: running ? "https://phone-8.tail1234.ts.net" : null,
              ceiling: ["observe"],
              raisable: ["execute"],
              pairable: true,
            },
          ],
        });
      }
      return defaultApiGet(path);
    });
    apiSendMock.mockImplementation((method: string, path: string) => {
      if (method === "POST" && path === "/v1/transports/tailnet") {
        running = true;
        return Promise.resolve({
          name: "tailnet",
          running: true,
          url: "https://phone-8.tail1234.ts.net",
          ceiling: ["observe"],
          raisable: ["execute"],
          pairable: true,
        });
      }
      throw new Error(`unexpected apiSend ${method} ${path}`);
    });

    render(<AppSettingsPage />);
    await waitFor(() => expect(screen.getByText(/pair a device/i)).toBeInTheDocument());

    // Before starting: the pair dialog's own radio names tailnet not
    // running, in the SAME screen's own words (see the copy fix beside it).
    expect(screen.getByRole("radio", { name: /^tailnet$/i })).toBeDisabled();
    expect(screen.getByText(/not running -- start it in transports, above/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));

    // The pair dialog's radio must flip live -- no second /v1/transports GET,
    // no reload. Only the mutation's own response feeds it.
    await waitFor(() => expect(screen.getByRole("radio", { name: /^tailnet$/i })).toBeEnabled());
    expect(screen.queryByText(/not running -- start it in transports, above/i)).not.toBeInTheDocument();
    expect(apiGetMock.mock.calls.filter((c) => c[0] === "/v1/transports")).toHaveLength(1);
  });

  // ─── fix round 2, Defect 2a: capabilities moved out of the Topbar ───────

  it("renders the capabilities trigger beside devices & pairing, since it moved out of the Topbar", async () => {
    adminSession();
    render(<AppSettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /capabilities/i })).toBeInTheDocument(),
    );
  });

  // ─── fault 2, on the surface that reported it ───────────────────────

  it("tells an observe-only device on loopback about the capability, not the tunnel", async () => {
    authorize(["observe"], ["observe"], "local");
    render(<AppSettingsPage />);
    // Twice over: the pair card explains it proactively, and the listing's own
    // error branch repeats it. Both must say the same thing -- that is what the
    // shared gate is for.
    await waitFor(() =>
      expect(screen.getAllByText(/wasn't given system control/i).length).toBeGreaterThan(0),
    );
    // Skips the request entirely, and offers no retry for a decision retrying
    // cannot change.
    expect(apiGetMock).not.toHaveBeenCalledWith("/v1/devices");
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/anywhere else, including a tunnel/i)).not.toBeInTheDocument();
  });
});
