import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase } from "@/services/http";
import { readDevToken, clearDevToken, setDevToken } from "@/services/token";
import { ConnectForm } from "./ConnectForm";

/**
 * The base every handler below is registered against, read once at module
 * load. Unstubbed, that is `http://127.0.0.1:8787` while jsdom serves the page
 * from `http://localhost:3000` -- two different origins, which is exactly the
 * `next dev` configuration. So the default environment of this file IS the dev
 * path, and the same-origin path (a daemon-served bundle, `apiBase()` of `/`)
 * is opted into per test by stubbing the env and registering a relative
 * handler. Both matter and they behave differently on purpose: a cookie can
 * only ever land in one of them.
 */
const BASE = apiBase();
const EXCHANGE = "/v1/session/cookie";

/** 204 + Set-Cookie, exactly what the daemon answers. */
const accepted = () => new HttpResponse(null, { status: 204 });

async function submit(value: string) {
  const user = userEvent.setup();
  const input = screen.getByLabelText(/device token/i);
  if (value) await user.type(input, value);
  await user.click(screen.getByRole("button", { name: /connect/i }));
}

/** Serve the exchange from the page's own origin -- the daemon-served bundle. */
function sameOriginBuild() {
  vi.stubEnv("NEXT_PUBLIC_STUDIO_API_BASE", "/");
}

describe("ConnectForm", () => {
  beforeEach(() => {
    clearDevToken();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exchanges the pasted token for the session cookie and reports connected", async () => {
    let seenAuth: string | null = null;
    let seenCsrf: string | null = null;
    let seenMethod: string | null = null;
    server.use(
      http.post(`${BASE}${EXCHANGE}`, ({ request }) => {
        seenAuth = request.headers.get("Authorization");
        seenCsrf = request.headers.get("X-TENKA-Request");
        seenMethod = request.method;
        return accepted();
      }),
    );
    const onConnected = vi.fn();
    render(<ConnectForm onConnected={onConnected} />);

    await submit("good-token");

    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    // The candidate rides the header, which is also what tells `services/http.ts`
    // this request is not spending the current session.
    expect(seenAuth).toBe("Bearer good-token");
    // A write, so the CSRF header is attached -- unnecessary for a bearer call
    // (the daemon exempts it, there being no ambient authority to forge) but
    // this client sets it on every non-GET rather than reasoning per route.
    expect(seenCsrf).toBe("1");
    // Never a GET. The route sets a cookie, and a GET that changes state is
    // reachable by a navigation, an <img> and a link prefetch.
    expect(seenMethod).toBe("POST");
  });

  /**
   * The security half of the fix, and the reason this screen changed at all.
   * It used to write the real device token into `localStorage`, where any
   * injected script can read it -- preserving in this one path the exact
   * weakness Milestone 6a removed everywhere else.
   */
  it("leaves no credential in localStorage when the daemon serves the page", async () => {
    sameOriginBuild();
    server.use(http.post(EXCHANGE, () => accepted()));
    render(<ConnectForm />);

    await submit("good-token");

    await waitFor(() => expect(readDevToken()).toBeNull());
    // Not just the key this module owns -- nothing readable anywhere.
    expect(Object.keys(localStorage)).toHaveLength(0);
  });

  it("clears a dev token left over from an earlier build once the cookie is holding the session", async () => {
    setDevToken("stale-dev-token");
    sameOriginBuild();
    server.use(http.post(EXCHANGE, () => accepted()));
    render(<ConnectForm />);

    await submit("good-token");

    await waitFor(() => expect(readDevToken()).toBeNull());
  });

  /**
   * The one configuration where a cookie provably cannot work: the page is
   * :3000, the daemon is :8787, `credentials: "same-origin"` here and
   * `allow_credentials=False` there both drop it. The daemon accepts a bearer
   * on loopback for exactly this reason, so the token is kept -- and only here.
   */
  it("keeps the bearer under `next dev`, where a cookie can never land", async () => {
    server.use(http.post(`${BASE}${EXCHANGE}`, () => accepted()));
    render(<ConnectForm />);

    await submit("dev-token");

    await waitFor(() => expect(readDevToken()).toBe("dev-token"));
  });

  it("shows a distinct 'rejected' message on 401 and stores nothing", async () => {
    server.use(
      http.post(`${BASE}${EXCHANGE}`, () =>
        HttpResponse.json({ detail: "unauthorized" }, { status: 401 }),
      ),
    );
    render(<ConnectForm />);

    await submit("bad-token");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/didn.t recognize/i);
    expect(readDevToken()).toBeNull();
  });

  it("shows a distinct 'not answering' message on a network failure, different from rejection, and stores nothing", async () => {
    server.use(http.post(`${BASE}${EXCHANGE}`, () => HttpResponse.error()));
    render(<ConnectForm />);

    await submit("some-token");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/can.t reach her/i);
    expect(alert.textContent).not.toMatch(/didn.t recognize/i);
    expect(readDevToken()).toBeNull();
  });

  it("refuses an empty submission without calling the daemon", async () => {
    let called = false;
    server.use(
      http.post(`${BASE}${EXCHANGE}`, () => {
        called = true;
        return accepted();
      }),
    );
    render(<ConnectForm />);

    await submit("");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/paste the token/i);
    expect(called).toBe(false);
    expect(readDevToken()).toBeNull();
  });

  it("trims pasted whitespace before exchanging", async () => {
    let seenAuth: string | null = null;
    server.use(
      http.post(`${BASE}${EXCHANGE}`, ({ request }) => {
        seenAuth = request.headers.get("Authorization");
        return accepted();
      }),
    );
    render(<ConnectForm />);

    await submit("  padded-token  ");

    await waitFor(() => expect(seenAuth).toBe("Bearer padded-token"));
  });

  it("leaves whatever token was previously stored untouched when the new one is rejected", async () => {
    setDevToken("old-good-token");
    server.use(
      http.post(`${BASE}${EXCHANGE}`, () =>
        HttpResponse.json({ detail: "unauthorized" }, { status: 401 }),
      ),
    );
    render(<ConnectForm />);

    await submit("new-bad-token");

    await screen.findByRole("alert");
    expect(readDevToken()).toBe("old-good-token");
  });

  /**
   * The candidate used to be written first and rolled back in the catch,
   * which is only a rollback if the catch runs: a tab closed mid-verify, a
   * machine that slept, a reload -- any of them left an unverified token in
   * storage, and every later request then failed against it.
   */
  it("writes nothing until the daemon has answered", async () => {
    let storedDuringVerify: string | null = "unset";
    server.use(
      http.post(`${BASE}${EXCHANGE}`, () => {
        storedDuringVerify = readDevToken();
        return accepted();
      }),
    );
    render(<ConnectForm />);

    await submit("candidate-token");

    await waitFor(() => expect(readDevToken()).toBe("candidate-token"));
    expect(storedDuringVerify).toBeNull();
  });

  it("exchanges a candidate without disturbing the session already stored", async () => {
    setDevToken("old-good-token");
    let storedDuringVerify: string | null = "unset";
    server.use(
      http.post(`${BASE}${EXCHANGE}`, ({ request }) => {
        storedDuringVerify = readDevToken();
        // The candidate rides the header; storage still holds the old one.
        expect(request.headers.get("Authorization")).toBe("Bearer new-token");
        return accepted();
      }),
    );
    render(<ConnectForm />);

    await submit("new-token");

    await waitFor(() => expect(readDevToken()).toBe("new-token"));
    expect(storedDuringVerify).toBe("old-good-token");
  });

  it("never renders the pasted token anywhere but the input itself, after a failure", async () => {
    server.use(
      http.post(`${BASE}${EXCHANGE}`, () =>
        HttpResponse.json({ detail: "unauthorized" }, { status: 401 }),
      ),
    );
    const { container } = render(<ConnectForm />);

    const secretToken = "super-secret-device-token-xyz";
    await submit(secretToken);
    await screen.findByRole("alert");

    // The input still legitimately holds what the user typed -- that is the
    // one sanctioned place for it. `textContent` never includes an <input>'s
    // value, so this catches the token leaking into an error message, a
    // hidden echo, or anywhere else in the tree without tripping over the
    // input's own value attribute.
    expect(container.textContent).not.toContain(secretToken);
  });
});
