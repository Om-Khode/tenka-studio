import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase, __resetListenerInfoCacheForTests } from "@/services/http";
import { readDevToken, setDevToken, clearDevToken } from "@/services/token";
import { ConnectGate } from "./ConnectGate";

/**
 * Defect D: `/connect`'s token form always rendered, even on a listener that
 * gates `POST /v1/session/cookie` on `policy.allow_bearer` -- loopback only.
 * Over a tunnel the form always 401s, and the operator had no way to know
 * that before typing a token in. This is an AFFORDANCE, not a security
 * control (the daemon still enforces the real rule regardless) -- so every
 * failure mode here must fall back to showing the form, never lock the user
 * out of the one door they have.
 *
 * Deliberately does not branch on `window.location.hostname` -- that is
 * exactly the trust-the-hostname mistake Milestone 6b exists to close. The
 * daemon is asked instead, via `GET /v1/listener`.
 */
const BASE = apiBase();
const LISTENER = `${BASE}/v1/listener`;

function respond(policy: string, allowBearer: boolean, canPair: boolean) {
  server.use(http.get(LISTENER, () => HttpResponse.json({ data: { policy, allowBearer, canPair } })));
}

describe("ConnectGate", () => {
  beforeEach(() => {
    // The daemon caps this route on the shared anonymous per-listener
    // budget and must not be polled -- getListenerInfo() caches its result
    // for the page's lifetime, which would leak one test's mocked response
    // into the next if it were not reset here.
    __resetListenerInfoCacheForTests();
    clearDevToken();
  });

  it("shows the token form before the probe has answered", () => {
    // No handler registered resolves synchronously -- this assertion runs
    // before any microtask from the fetch could have settled.
    respond("local", true, true);
    render(<ConnectGate />);
    expect(screen.getByLabelText(/device token/i)).toBeInTheDocument();
  });

  it("keeps the token form once the daemon confirms bearer is allowed here", async () => {
    respond("local", true, true);
    render(<ConnectGate />);
    await waitFor(() => expect(screen.getByLabelText(/device token/i)).toBeInTheDocument());
  });

  it("falls back to the token form on a 404 -- the route may not be built yet", async () => {
    server.use(http.get(LISTENER, () => HttpResponse.json({ detail: "not found" }, { status: 404 })));
    render(<ConnectGate />);
    await waitFor(() => expect(screen.getByLabelText(/device token/i)).toBeInTheDocument());
  });

  it("falls back to the token form on a network failure", async () => {
    server.use(http.get(LISTENER, () => HttpResponse.error()));
    render(<ConnectGate />);
    await waitFor(() => expect(screen.getByLabelText(/device token/i)).toBeInTheDocument());
  });

  it("replaces the form with pairing guidance when bearer is refused but pairing works", async () => {
    respond("tailnet", false, true);
    render(<ConnectGate />);
    await waitFor(() => expect(screen.queryByLabelText(/device token/i)).not.toBeInTheDocument());
    expect(screen.getByText(/pair/i)).toBeInTheDocument();
  });

  it("says plainly that neither works when pairing is also refused by policy", async () => {
    // canPair can still be false for a policy even with quick gone (spec
    // §5.5: the daemon still refuses redemption on any pairable=False
    // policy) -- a synthetic name stands in since none of TENKA's three
    // shipped transports currently sets it.
    respond("restricted", false, false);
    render(<ConnectGate />);
    await waitFor(() => expect(screen.queryByLabelText(/device token/i)).not.toBeInTheDocument());
    expect(screen.getByText(/can.t pair/i)).toBeInTheDocument();
  });

  /**
   * The daemon answers 401 for a socket whose port resolves to no policy --
   * an anomaly about the CONNECTION, not a statement that this browser's
   * credential is bad. `services/http.ts`'s ordinary 401 handling revokes
   * the current session; that is right for an authenticated route and
   * wrong for this unauthenticated probe, which must be treated exactly
   * like "unknown" (fall back to the form) without touching the session at
   * all -- see `probeSession()`'s own `revokeOn401: false` for the same
   * reasoning applied to `GET /v1/session`.
   */
  it("falls back to the form on a 401, and does not revoke the current session over it", async () => {
    setDevToken("still-good-token");
    server.use(http.get(LISTENER, () => HttpResponse.json({ detail: "unauthorized" }, { status: 401 })));
    render(<ConnectGate />);
    await waitFor(() => expect(screen.getByLabelText(/device token/i)).toBeInTheDocument());
    expect(readDevToken()).toBe("still-good-token");
  });

  /**
   * Rate-limited on the shared anonymous per-listener budget -- a caller
   * that asks again every remount would spend a budget pairing itself
   * needs. One request per page load, cached, not one per mount.
   */
  it("asks the daemon at most once even across remounts, never polling", async () => {
    let calls = 0;
    server.use(
      http.get(LISTENER, () => {
        calls += 1;
        return HttpResponse.json({ data: { policy: "tailnet", allowBearer: false, canPair: true } });
      }),
    );
    const first = render(<ConnectGate />);
    await waitFor(() => expect(screen.getByText(/pair/i)).toBeInTheDocument());
    first.unmount();

    render(<ConnectGate />);
    await waitFor(() => expect(screen.getByText(/pair/i)).toBeInTheDocument());

    expect(calls).toBe(1);
  });
});
