import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { apiGet, apiSend, apiBase, eventSocketUrl, ApiError } from "./http";
import { clearDevToken, setDevToken, readDevToken, onSessionRevoked } from "./token";

const BASE = apiBase();
const envelope = <T>(data: T) => ({ data, meta: { requestId: "r1", generatedAt: "2026-08-09T00:00:00Z" } });

/** Every rejection under test is an `ApiError` — asserted once here rather than at every call site. */
async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

describe("apiGet / apiSend", () => {
  beforeEach(() => {
    clearDevToken();
  });

  it("sends the dev token as an Authorization header, never in the URL", async () => {
    setDevToken("secret-token-1");
    let seenAuth: string | null = null;
    let seenUrl = "";
    server.use(
      http.get(`${BASE}/v1/status`, ({ request }) => {
        seenAuth = request.headers.get("Authorization");
        seenUrl = request.url;
        return HttpResponse.json(envelope({ ok: true }));
      }),
    );

    await apiGet("/v1/status");

    expect(seenAuth).toBe("Bearer secret-token-1");
    expect(seenUrl).not.toContain("secret-token-1");
  });

  it("omits Authorization entirely on the shipped path, where the credential is a cookie", async () => {
    let seenAuth: string | null = "unset";
    server.use(
      http.get(`${BASE}/v1/status`, ({ request }) => {
        seenAuth = request.headers.get("Authorization");
        return HttpResponse.json(envelope({}));
      }),
    );
    await apiGet("/v1/status");
    expect(seenAuth).toBeNull();
  });

  it("unwraps the envelope's data field", async () => {
    server.use(
      http.get(`${BASE}/v1/status`, () => HttpResponse.json(envelope({ activeModel: "gemini-flash" }))),
    );
    const result = await apiGet<{ activeModel: string }>("/v1/status");
    expect(result).toEqual({ activeModel: "gemini-flash" });
  });

  it("throws, rather than returning undefined, when a 2xx body is not enveloped", async () => {
    server.use(http.get(`${BASE}/v1/status`, () => HttpResponse.json({ activeModel: "gemini-flash" })));
    await expect(apiGet("/v1/status")).rejects.toMatchObject({
      code: "invalid_envelope",
    });
  });

  it("distinguishes 403 (said no) from 409 (busy) from a network failure (not answering)", async () => {
    server.use(
      http.get(`${BASE}/v1/no`, () => HttpResponse.json({ detail: "capability not granted" }, { status: 403 })),
      http.get(`${BASE}/v1/busy`, () => HttpResponse.json({ detail: "busy" }, { status: 409 })),
      http.get(`${BASE}/v1/down`, () => HttpResponse.error()),
    );

    const forbidden = await rejection(apiGet("/v1/no"));
    const busy = await rejection(apiGet("/v1/busy"));
    const unreachable = await rejection(apiGet("/v1/down"));

    expect(forbidden.status).toBe(403);
    expect(busy.status).toBe(409);
    expect(busy.code).toBe("busy");
    expect(unreachable.status).toBe(0);

    const statuses = new Set([forbidden.status, busy.status, unreachable.status]);
    expect(statuses.size).toBe(3);
  });

  it("reads a 404's fixed { error } body, which uses a different key than every other error", async () => {
    server.use(http.get(`${BASE}/v1/gone`, () => HttpResponse.json({ error: "not found" }, { status: 404 })));
    const err = await rejection(apiGet("/v1/gone"));
    expect(err.status).toBe(404);
    expect(err.code).toBe("not found");
  });

  it("maps a 429 without treating it as unhandled", async () => {
    server.use(http.get(`${BASE}/v1/hot`, () => HttpResponse.json({ detail: "too many requests" }, { status: 429 })));
    const err = await rejection(apiGet("/v1/hot"));
    expect(err.status).toBe(429);
    expect(err.code).toBe("too many requests");
  });

  it("never echoes the submitted value out of a 422 — the daemon's body never carries it", async () => {
    server.use(
      http.post(`${BASE}/v1/settings`, () =>
        HttpResponse.json({ detail: [{ loc: ["body", "value"], type: "string_type" }] }, { status: 422 }),
      ),
    );
    const err = await rejection(apiSend("POST", "/v1/settings", { value: "super-secret-value" }));
    expect(err.status).toBe(422);
    expect(err.code).toBe("validation_failed");
    expect(err.message).not.toContain("super-secret-value");
  });

  it("passes an AbortSignal through, and an abort reads as neither a status nor a network failure", async () => {
    server.use(
      http.get(`${BASE}/v1/slow`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(envelope({}));
      }),
    );
    const controller = new AbortController();
    const pending = apiGet("/v1/slow", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("fails loudly rather than hanging when a route was never stubbed", async () => {
    await expect(apiGet("/v1/never-stubbed-in-this-test")).rejects.toBeTruthy();
  });

  it("resolves a 204 rather than throwing invalid_envelope — there is no body to envelope", async () => {
    server.use(http.post(`${BASE}/v1/pair`, () => new HttpResponse(null, { status: 204 })));
    await expect(apiSend("POST", "/v1/pair", { code: "AAAA-AAAA" })).resolves.toBeUndefined();
  });
});

/**
 * Nothing cleared a token the daemon had stopped accepting: the shell gates
 * on presence, so a stale credential rendered the whole live tree and left
 * every pane reporting its own failure, with no way back to the connect
 * screen short of editing localStorage by hand.
 */
describe("a 401 against the stored session", () => {
  beforeEach(() => {
    clearDevToken();
  });

  it("revokes the credential and still throws, so the caller's error branch is untouched", async () => {
    setDevToken("no-longer-hers");
    const listener = vi.fn();
    const unsubscribe = onSessionRevoked(listener);
    server.use(
      http.get(`${BASE}/v1/status`, () => HttpResponse.json({ detail: "unauthorized" }, { status: 401 })),
    );

    const err = await rejection(apiGet("/v1/status"));

    expect(err.status).toBe(401);
    expect(readDevToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("leaves the stored token alone when the caller supplied its own Authorization", async () => {
    // The connect screen verifying a candidate: a bad paste must not log the
    // user out of the session they already had.
    setDevToken("still-good");
    const listener = vi.fn();
    const unsubscribe = onSessionRevoked(listener);
    let seenAuth: string | null = null;
    server.use(
      http.get(`${BASE}/v1/status`, ({ request }) => {
        seenAuth = request.headers.get("Authorization");
        return HttpResponse.json({ detail: "unauthorized" }, { status: 401 });
      }),
    );

    await rejection(apiGet("/v1/status", { headers: { Authorization: "Bearer candidate" } }));

    expect(seenAuth).toBe("Bearer candidate");
    expect(readDevToken()).toBe("still-good");
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("revokes nothing on a 403 -- a capability she withheld is not a credential she refused", async () => {
    setDevToken("valid-but-narrow");
    server.use(
      http.get(`${BASE}/v1/files`, () => HttpResponse.json({ detail: "capability not granted" }, { status: 403 })),
    );

    await rejection(apiGet("/v1/files"));

    expect(readDevToken()).toBe("valid-but-narrow");
  });
});

/**
 * There is no longer an exception to the no-credential-in-a-URL rule. The
 * socket carried one because a browser `WebSocket` cannot set a header; the
 * cookie removed the need, because the browser attaches a cookie to the
 * handshake itself. Both halves went in 6a -- the daemon stopped reading the
 * query parameter in Task 5, and this stopped writing it.
 */
describe("eventSocketUrl", () => {
  it("carries no credential, even when a dev token is set", () => {
    setDevToken("secret-token-2");
    const url = eventSocketUrl();
    expect(url).toBe(`${BASE.replace(/^http/, "ws")}/v1/events`);
    expect(url).not.toContain("secret-token-2");
  });

  it("is the same URL with no dev token at all", () => {
    clearDevToken();
    expect(eventSocketUrl()).toBe(`${BASE.replace(/^http/, "ws")}/v1/events`);
  });
});

/**
 * The bundle TENKA vendors is built with a relative API base so that a page
 * served from a tunnel talks to that same origin (see `DEFAULT_BASE`). That
 * fix breaks the socket unless the socket is fixed with it: the old
 * `apiBase().replace(/^http/, "ws")` is a *no-op* on a relative base, and the
 * `/v1/events` it leaves behind is not something `new WebSocket()` accepts --
 * the constructor throws `SyntaxError` on anything without a resolved
 * `ws`/`wss` scheme. `fetch` swallows the same string happily, so nothing else
 * in this module notices. A build that loads perfectly and then cannot stream
 * is the failure this describes.
 *
 * `window` is stubbed rather than navigated because jsdom serves the whole
 * suite from one fixed URL, and the two things worth pinning here -- that the
 * page's *path* is discarded, and that an https page yields `wss` -- are
 * invisible at `http://localhost:3000/`.
 */
describe("eventSocketUrl on a daemon-served build", () => {
  const onPage = (href: string) => vi.stubGlobal("window", { location: { href } });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("resolves a relative base against the page instead of leaving it relative", () => {
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "/");
    onPage("http://127.0.0.1:8787/app/chat");

    expect(eventSocketUrl()).toBe("ws://127.0.0.1:8787/v1/events");
  });

  it("takes the page's origin and not its path", () => {
    // The concatenation has to happen before the resolution. The other order
    // resolves the base to the page URL first and lands on
    // `wss://host/app/chat/v1/events`, which 404s on a daemon that only routes
    // `/v1/events`.
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "/");
    onPage("https://tenka.trycloudflare.com/app/chat");

    expect(eventSocketUrl()).toBe("wss://tenka.trycloudflare.com/v1/events");
  });

  it("produces a URL the WebSocket constructor would accept", () => {
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "/");
    onPage("https://tenka.trycloudflare.com/app/chat");

    const url = new URL(eventSocketUrl());   // throws on the relative form
    expect(["ws:", "wss:"]).toContain(url.protocol);
    expect(url.host).toBe("tenka.trycloudflare.com");
  });

  it("leaves an absolute base where it is, whatever page it is read from", () => {
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "http://127.0.0.1:8787");
    onPage("https://tenka.trycloudflare.com/app/chat");

    expect(eventSocketUrl()).toBe("ws://127.0.0.1:8787/v1/events");
  });

  it("still carries nothing but the path -- no query, no credential", () => {
    setDevToken("dev-secret");
    vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "/");
    onPage("https://tenka.trycloudflare.com/app/chat?token=leak");

    const url = eventSocketUrl();

    expect(url).toBe("wss://tenka.trycloudflare.com/v1/events");
    expect(url).not.toContain("dev-secret");
    expect(url).not.toMatch(/[?&]/);
  });
});
