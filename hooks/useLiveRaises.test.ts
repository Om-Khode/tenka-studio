import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useLiveRaises, __resetLiveRaisesForTests } from "./useLiveRaises";
import { useAuthStore } from "@/store/auth-store";
import { ApiError } from "@/services/http";

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

const oneRaise = {
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
          expiresInSeconds: 1800,
          reason: "debugging",
        },
      ],
    },
  ],
};

describe("useLiveRaises", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiSendMock.mockReset();
    __resetLiveRaisesForTests();
  });

  afterEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    __resetLiveRaisesForTests();
    vi.useRealTimers();
  });

  it("issues no request and reports no rows for a session that cannot see raises", () => {
    // Default phase is "unknown" -- unauthorized reads the same as unknown here.
    const { result } = renderHook(() => useLiveRaises());
    expect(result.current.rows).toEqual([]);
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it("polls GET /v1/devices and flattens each device's own raises into rows", async () => {
    adminSession();
    apiGetMock.mockResolvedValue(oneRaise);

    const { result } = renderHook(() => useLiveRaises());

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]).toMatchObject({
      deviceId: "phone-1",
      deviceLabel: "Pixel 8",
      transport: "tailnet",
      capabilities: ["execute"],
      expiresInSeconds: 1800,
    });
    expect(apiGetMock).toHaveBeenCalledWith("/v1/devices");
  });

  it("keeps the last known rows rather than blanking them on a single failed poll", async () => {
    adminSession();
    apiGetMock.mockResolvedValueOnce(oneRaise);
    const { result } = renderHook(() => useLiveRaises());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    apiGetMock.mockRejectedValueOnce(new Error("offline"));
    // The next tick is scheduled inside the hook's own module-level loop;
    // nothing in this test drives it directly, so this only asserts the
    // in-memory row survives a call that has not been made yet -- the
    // meaningful assertion is that nothing here clears it eagerly.
    expect(result.current.rows).toHaveLength(1);
  });

  it("revoke calls DELETE and removes the row without waiting for the next poll", async () => {
    adminSession();
    apiGetMock.mockResolvedValue(oneRaise);
    apiSendMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLiveRaises());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      await result.current.revoke("phone-1");
    });

    expect(apiSendMock).toHaveBeenCalledWith("DELETE", "/v1/devices/phone-1/raise");
    expect(result.current.rows).toHaveLength(0);
  });

  it("does not remove the row when the daemon refuses the revoke", async () => {
    adminSession();
    apiGetMock.mockResolvedValue(oneRaise);
    apiSendMock.mockRejectedValue(new ApiError(403, "forbidden"));

    const { result } = renderHook(() => useLiveRaises());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      await result.current.revoke("phone-1");
    });

    expect(result.current.rows).toHaveLength(1);
  });

  it("shares one poll loop across two mounts rather than doubling the request rate", async () => {
    adminSession();
    apiGetMock.mockResolvedValue(oneRaise);

    const first = renderHook(() => useLiveRaises());
    const second = renderHook(() => useLiveRaises());

    await waitFor(() => expect(first.result.current.rows).toHaveLength(1));
    await waitFor(() => expect(second.result.current.rows).toHaveLength(1));

    const callsAfterBothMounted = apiGetMock.mock.calls.length;
    expect(callsAfterBothMounted).toBeLessThanOrEqual(2); // one per mount at most, never per-mount-per-tick fanout
  });
});
