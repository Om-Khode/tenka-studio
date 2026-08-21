import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RaiseBanner } from "./RaiseBanner";
import { useAuthStore } from "@/store/auth-store";
import { __resetLiveRaisesForTests } from "@/hooks/useLiveRaises";

const { apiGetMock, apiSendMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiSendMock: vi.fn(),
}));

vi.mock("@/services/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/http")>();
  return { ...actual, apiGet: apiGetMock, apiSend: apiSendMock };
});

function adminSession() {
  useAuthStore.setState({
    phase: "authorized",
    refusal: null,
    session: {
      deviceId: "desktop-1",
      label: "This desktop",
      granted: ["system_control"],
      effective: ["system_control"],
      policy: "local",
      canUse: (c: string) => c === "system_control",
    },
  });
}

describe("RaiseBanner", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiSendMock.mockReset();
    __resetLiveRaisesForTests();
  });

  afterEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    __resetLiveRaisesForTests();
  });

  it("renders nothing when no raise is live", () => {
    apiGetMock.mockResolvedValue({ devices: [] });
    const { container } = render(<RaiseBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a session that cannot see raises at all -- no leak, no request", () => {
    // Default phase is "unknown"; a funnel/tailnet device never has
    // system_control on loopback, so this is also that case.
    const { container } = render(<RaiseBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it("names the device, the capabilities, the transport and the time remaining", async () => {
    adminSession();
    apiGetMock.mockResolvedValue({
      devices: [
        {
          deviceId: "phone-1",
          label: "Pixel 8",
          grants: ["observe", "execute"],
          createdAt: new Date().toISOString(),
          lastSeenAt: null,
          raises: [
            {
              deviceId: "phone-1",
              transport: "tailnet",
              capabilities: ["execute"],
              expiresInSeconds: 3600,
              reason: "debugging a crash report",
            },
          ],
        },
      ],
    });
    render(<RaiseBanner />);

    expect(await screen.findByText(/Pixel 8/)).toBeInTheDocument();
    expect(screen.getByText(/Execute/)).toBeInTheDocument();
    expect(screen.getByText(/tailnet/)).toBeInTheDocument();
    expect(screen.getByText(/1h 0m left/)).toBeInTheDocument();
  });

  /**
   * Milestone 6b live-test item 2. Pins the property the brief calls out
   * explicitly: reaching zero must trigger a REFETCH (a second `GET
   * /v1/devices`), not a local decision that the raise is gone. An
   * implementation that instead hid the row once `expiresInSeconds <= 0`
   * without ever calling `refreshLiveRaises()` would still make "Pixel 8"
   * disappear and pass a test asserting only on the text -- the assertion on
   * `apiGetMock`'s call count is what that version fails.
   */
  it("counts a raise down locally and refetches from the daemon when it reaches zero", async () => {
    vi.useFakeTimers();
    adminSession();
    const raisedDevice = (expiresInSeconds: number) => ({
      devices: [
        {
          deviceId: "phone-1",
          label: "Pixel 8",
          grants: ["observe", "execute"],
          createdAt: new Date().toISOString(),
          lastSeenAt: null,
          raises: [
            {
              deviceId: "phone-1",
              transport: "tailnet",
              capabilities: ["execute"],
              expiresInSeconds,
              reason: "debugging a crash report",
            },
          ],
        },
      ],
    });
    apiGetMock.mockResolvedValueOnce(raisedDevice(2));

    render(<RaiseBanner />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/Pixel 8/)).toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledTimes(1);

    // The daemon's own next answer once asked again -- the raise really has
    // ended, and nothing announced it (this is the case with no invalidate
    // frame at all).
    apiGetMock.mockResolvedValueOnce({ devices: [] });

    // Two separate advances, not one 2000ms sweep: the second tick's timer
    // is armed by the FIRST tick's own effect, so it must exist before the
    // fake clock is asked to look for it -- one `act()` per tick lets React
    // flush that effect before the next advance runs.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000); // 2 -> 1
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000); // 1 -> 0: expiry
    });

    expect(apiGetMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Pixel 8/)).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("revokes on click", async () => {
    adminSession();
    apiGetMock.mockResolvedValue({
      devices: [
        {
          deviceId: "phone-1",
          label: "Pixel 8",
          grants: ["execute"],
          createdAt: new Date().toISOString(),
          lastSeenAt: null,
          raises: [
            {
              deviceId: "phone-1",
              transport: "tailnet",
              capabilities: ["execute"],
              expiresInSeconds: 600,
              reason: "debugging",
            },
          ],
        },
      ],
    });
    apiSendMock.mockResolvedValue(undefined);
    render(<RaiseBanner />);

    await screen.findByText(/Pixel 8/);
    await userEvent.click(screen.getByRole("button", { name: /revoke/i }));

    expect(apiSendMock).toHaveBeenCalledWith("DELETE", "/v1/devices/phone-1/raise");
  });
});
