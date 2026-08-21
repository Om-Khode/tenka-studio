/**
 * The cookie-first auth seam (Milestone 6a Task 13), tested against a `fetch`
 * spy rather than the shared MSW server.
 *
 * MSW is the right tool everywhere else in this repo -- it answers routes and
 * lets a test assert on what the daemon received. These tests are about what
 * the *client* sent in the `RequestInit`, and one of the four things under
 * test (`credentials`) is not a property the interceptor's reconstructed
 * `Request` reliably preserves. A spy sees the argument this module actually
 * passed, which is the only thing that can be wrong here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  apiGet,
  apiSend,
  eventSocketUrl,
  isLoopbackBase,
  isSameOriginBase,
  probeSession,
} from "./http";
import { clearDevToken, onSessionRevoked, setDevToken } from "./token";
import { initAuth, useAuthStore } from "@/store/auth-store";

const SESSION_BODY = {
  deviceId: "d1",
  label: "phone",
  grants: ["observe", "files"],
  effective: ["observe"],
  raised: [],
  raiseExpiresInSeconds: null,
  policy: "funnel",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const envelope = <T,>(data: T) => ({
  data,
  meta: { requestId: "r1", generatedAt: "2026-08-15T00:00:00Z" },
});

let fetchMock: ReturnType<typeof vi.fn>;

/** The `RequestInit` this client handed `fetch` on call `index`. */
function initOf(index: number): RequestInit {
  return fetchMock.mock.calls[index][1] as RequestInit;
}

/** A header off that call, as `Headers` normalises it (case-insensitively). */
function headerOf(index: number, name: string): string | null {
  return new Headers(initOf(index).headers).get(name);
}

beforeEach(() => {
  localStorage.clear();
  clearDevToken();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  fetchMock = vi.fn(async () => jsonResponse(envelope(SESSION_BODY)));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  // Restores the MSW-patched fetch that vitest.setup.ts installed, so no other
  // file in the suite inherits this spy.
  vi.unstubAllGlobals();
  // Several tests below re-point NEXT_PUBLIC_STUDIO_API_BASE. apiBase() reads
  // it at call time, so a leaked stub would silently move every later test's
  // daemon.
  vi.unstubAllEnvs();
});

describe("cookie-first requests", () => {
  it("sends same-origin credentials and no Authorization when cookie-based", async () => {
    await probeSession();

    expect(initOf(0).credentials).toBe("same-origin");
    expect(headerOf(0, "Authorization")).toBeNull();
  });

  it("adds the CSRF header to writes but not to reads", async () => {
    await apiGet("/v1/status");
    expect(headerOf(0, "X-TENKA-Request")).toBeNull();

    await apiSend("POST", "/v1/chat", { text: "hi" });
    expect(headerOf(1, "X-TENKA-Request")).toBe("1");
  });

  it("carries the credential setting on writes too, not only on reads", async () => {
    await apiSend("PATCH", "/v1/settings", { key: "value" });
    expect(initOf(0).credentials).toBe("same-origin");
  });

  it("never puts a credential in a request URL", async () => {
    setDevToken("dev-secret");
    await apiGet("/v1/status");
    expect(fetchMock.mock.calls[0][0]).not.toContain("dev-secret");
  });
});

describe("probeSession", () => {
  it("asks GET /v1/session", async () => {
    await probeSession();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/session");
  });

  it("treats a 401 from the session probe as unauthorised, not as an error toast", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "unauthorized" }, 401));
    expect(await probeSession()).toBeNull();
  });

  it("does not fire the revocation signal on that 401 -- a browser that never paired has no session to end", async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionRevoked(listener);
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "unauthorized" }, 401));

    await probeSession();

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("still revokes on a 401 from an ordinary request -- that one IS a session ending", async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionRevoked(listener);
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "unauthorized" }, 401));

    await expect(apiGet("/v1/status")).rejects.toMatchObject({ status: 401 });

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("rethrows an unreachable daemon rather than reporting it as unauthorised", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("connection refused"));
    await expect(probeSession()).rejects.toMatchObject({ status: 0 });
  });

  it("exposes effective capabilities separately from granted ones", async () => {
    const session = await probeSession();

    expect(session).not.toBeNull();
    expect(session!.canUse("files")).toBe(false);
    expect(session!.granted).toContain("files");
    expect(session!.canUse("observe")).toBe(true);
    expect(session!.policy).toBe("funnel");
  });
});

describe("the dev-server bearer path", () => {
  it("keeps the bearer path for the dev server", async () => {
    setDevToken("abc");
    await apiGet("/v1/status");
    expect(headerOf(0, "Authorization")).toBe("Bearer abc");
  });

  it("lets a caller-supplied Authorization win, so the connect screen can verify a candidate", async () => {
    setDevToken("abc");
    await apiGet("/v1/status", { headers: { Authorization: "Bearer candidate" } });
    expect(headerOf(0, "Authorization")).toBe("Bearer candidate");
  });

  /**
   * The daemon honours bearer on loopback listeners alone. Until this gate
   * existed, nothing on THIS side checked where a request was going before
   * attaching one: a browser that had ever held a dev token kept presenting it
   * to whatever `apiBase()` resolved to afterwards, a Cloudflare tunnel that
   * terminates TLS and reads the plaintext included. That the daemon would
   * have refused it is no comfort -- the credential still left the browser and
   * still crossed the wire.
   */
  it("never attaches the dev token to a base that is not this machine", async () => {
    setDevToken("abc");
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "https://tunnel.trycloudflare.com");

    await apiGet("/v1/status");

    expect(headerOf(0, "Authorization")).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("abc");
  });

  it("discards it rather than keeping it for a base it can never be used against", async () => {
    setDevToken("abc");
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "https://tunnel.trycloudflare.com");

    await apiGet("/v1/status");

    // Refusing to attach and refusing to keep are two defences, not one: the
    // first stops the send, the second removes the thing to send.
    expect(localStorage.getItem("tenka-studio-dev-token")).toBeNull();
  });

  it("still works over a remote base -- the cookie is what carries a real session there", async () => {
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "https://tunnel.trycloudflare.com");

    await apiSend("POST", "/v1/chat", { text: "hi" });

    expect(initOf(0).credentials).toBe("same-origin");
    expect(headerOf(0, "X-TENKA-Request")).toBe("1");
  });

  it("counts the whole loopback block, not just 127.0.0.1", () => {
    for (const base of ["http://127.0.0.1:8787", "http://localhost:8787", "http://127.5.5.5:8787"]) {
      vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", base);
      expect(isLoopbackBase()).toBe(true);
    }
  });

  it("refuses a LAN address that merely looks local -- 'on my network' is not 'on my machine'", () => {
    for (const base of [
      "http://192.168.1.20:8787",
      "http://10.0.0.4:8787",
      "http://tenka.local:8787",
      "https://tunnel.trycloudflare.com",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", base);
      expect(isLoopbackBase()).toBe(false);
    }
  });

  /**
   * Task 16 may make the base relative for a daemon-served build. A relative
   * base is resolved against the page, which is the correct answer rather than
   * a lenient one: if the daemon IS the page's origin, then "is the daemon on
   * this machine" and "is the page on this machine" are the same question.
   * jsdom serves this suite from localhost, so it answers true here; served
   * from a tunnel it would answer false, which is exactly the point.
   */
  it("judges a relative base by the page's own origin", () => {
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "/api");
    expect(new URL(window.location.href).hostname).toBe("localhost");
    expect(isLoopbackBase()).toBe(true);
  });

  it("initAuth discards a dev token held against a remote base, without waiting for a request", () => {
    setDevToken("abc");
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "https://tunnel.trycloudflare.com");

    initAuth();

    expect(localStorage.getItem("tenka-studio-dev-token")).toBeNull();
  });

  it("initAuth keeps it on loopback -- the dev path has to survive a reload", () => {
    setDevToken("abc");

    initAuth();

    expect(localStorage.getItem("tenka-studio-dev-token")).toBe("abc");
  });
});

/**
 * "Can a cookie the daemon sets ever come back to it?" -- the question
 * `/connect` asks before deciding whether it needs to keep a bearer at all.
 * It is a different question from `isLoopbackBase()`: the `next dev` setup is
 * loopback on both ends and still cannot carry a cookie, because :3000 and
 * :8787 are different origins.
 */
describe("isSameOriginBase", () => {
  it("is true for the relative base a daemon-served bundle is built with", () => {
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "/");
    expect(isSameOriginBase()).toBe(true);
  });

  it("is false for `next dev` -- loopback on both ends, still two origins", () => {
    // The default base, unstubbed: :8787 while jsdom serves the page from
    // :3000. `credentials: "same-origin"` drops the Set-Cookie, and the
    // daemon's `allow_credentials=False` would too.
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "http://127.0.0.1:8787");
    expect(isLoopbackBase()).toBe(true);
    expect(isSameOriginBase()).toBe(false);
  });

  it("is false for a tunnel", () => {
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "https://tunnel.trycloudflare.com");
    expect(isSameOriginBase()).toBe(false);
  });

  it("is true when an absolute base names the page's own origin", () => {
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", window.location.origin);
    expect(isSameOriginBase()).toBe(true);
  });
});

describe("eventSocketUrl", () => {
  it("opens the event socket with no credential in the URL", () => {
    // Task 1's bundle scan found `"?access_token=".concat(...)` still in the
    // shipped JS. Task 5 deleted the daemon's side; a client that kept
    // appending it would put a live credential into every intermediary's
    // access log for nothing, since the daemon no longer reads it.
    setDevToken("dev-secret");

    const url = eventSocketUrl();

    expect(url).not.toContain("access_token");
    expect(url).not.toContain("dev-secret");
    expect(url).not.toMatch(/[?&]/);
    expect(url).toMatch(/^wss?:\/\/.+\/v1\/events$/);
  });
});

describe("initAuth", () => {
  it("leaves no legacy token behind in storage", () => {
    // A build before 6a stored the device token in localStorage. After the
    // cookie migration that value is dead weight an XSS can still read, so
    // startup clears it rather than ignoring it.
    localStorage.setItem("tenka.token", "old-token");
    localStorage.setItem("tenka-studio-device-token", "old-token");

    initAuth();

    expect(localStorage.getItem("tenka.token")).toBeNull();
    expect(localStorage.getItem("tenka-studio-device-token")).toBeNull();
  });

  it("does not clear the dev token -- that key is deliberately not one of the legacy ones", () => {
    setDevToken("still-needed-on-localhost");
    initAuth();
    expect(localStorage.getItem("tenka-studio-dev-token")).toBe("still-needed-on-localhost");
  });
});
