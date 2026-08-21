import { render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase } from "@/services/http";
import PairPage from "./page";

const push = vi.fn();
// Same reason as app/connect/page.test.tsx: page.tsx imports notFound for the
// public-demo gate, and these tests run with the flag off. vi.hoisted() pins
// the declaration ahead of Vitest's hoisted mock factory.
const notFound = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  notFound,
}));

const BASE = apiBase();

describe("PairPage", () => {
  beforeEach(() => {
    push.mockClear();
    notFound.mockClear();
  });

  afterEach(() => {
    // Every test sets its own hash; nothing here should leak into the next.
    window.location.hash = "";
  });

  it("reads the code from the fragment, never from the query string", async () => {
    let seenBody: unknown;
    let seenUrl = "";
    server.use(
      http.post(`${BASE}/v1/pair`, async ({ request }) => {
        seenBody = await request.json();
        seenUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    window.location.hash = "#7K2M-9QX4";
    render(<PairPage />);

    await waitFor(() => expect(seenBody).toEqual({ code: "7K2M-9QX4" }));
    expect(seenUrl).not.toContain("7K2M-9QX4");
  });

  it("clears the fragment from history after a successful pair", async () => {
    server.use(http.post(`${BASE}/v1/pair`, () => new HttpResponse(null, { status: 204 })));
    window.location.hash = "#7K2M-9QX4";
    render(<PairPage />);
    await waitFor(() => expect(window.location.hash).toBe(""));
  });

  it("routes to /app once the code is accepted", async () => {
    server.use(http.post(`${BASE}/v1/pair`, () => new HttpResponse(null, { status: 204 })));
    window.location.hash = "#7K2M-9QX4";
    render(<PairPage />);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
  });

  it("offers manual entry when there is no fragment", () => {
    window.location.hash = "";
    render(<PairPage />);
    expect(screen.getByLabelText(/pairing code/i)).toBeInTheDocument();
  });

  /**
   * Regression test for a real hydration mismatch: `phase`'s initial value
   * once came from `codeFromFragment() ? "exchanging" : "idle"`, computed
   * synchronously in the `useState` initializer. This route is a static
   * export (`output: "export"`) — the prerendered HTML is built with no
   * fragment in hand (fragments never reach a server at all), so it is
   * always the idle markup. React requires the first CLIENT render to match
   * that exact markup or it discards it and logs a mismatch; the old
   * initializer broke that the moment a real fragment was present, flipping
   * straight to "exchanging" before hydration had anything to reconcile
   * against.
   *
   * `render()` from Testing Library cannot exercise this directly: it always
   * mounts fresh via `createRoot()`, never `hydrateRoot()` against
   * pre-existing markup, so there is no server/client boundary for a
   * mismatch to fire across in jsdom regardless of whether this bug exists —
   * asserting "no console error" here would pass whether or not the
   * initializer read the fragment, which is exactly the kind of test that
   * cannot fail. `renderToStaticMarkup` is used instead because it performs
   * the one render pass that matters and genuinely cannot lie: React does
   * not run effects during it, so the output is *only* ever a function of
   * the initial state — precisely what both the real static export and the
   * real first client (pre-hydration) render also are. If the initializer
   * ever reads the fragment again, this fails outright, because the markup
   * below would say "Pairing…" instead.
   */
  it("renders the idle markup on the very first render pass even when a fragment is present", () => {
    window.location.hash = "#7K2M-9QX4";
    const html = renderToStaticMarkup(<PairPage />);
    expect(html).toContain('for="pairing-code"');
    expect(html).not.toContain("Checking the code from the QR you scanned.");
  });

  it("shows one message for every refusal, revealing nothing", async () => {
    server.use(
      http.post(`${BASE}/v1/pair`, () => HttpResponse.json({ detail: "unauthorized" }, { status: 401 })),
    );
    window.location.hash = "#AAAA-AAAA";
    render(<PairPage />);
    expect(await screen.findByText(/didn't work|expired or already used/i)).toBeVisible();
  });

  it("shows a distinct message when the daemon cannot be reached at all", async () => {
    server.use(http.post(`${BASE}/v1/pair`, () => HttpResponse.error()));
    window.location.hash = "#AAAA-AAAA";
    render(<PairPage />);
    expect(await screen.findByText(/can't reach her/i)).toBeVisible();
  });

  it("never renders the code into the DOM after submitting", async () => {
    server.use(http.post(`${BASE}/v1/pair`, () => new HttpResponse(null, { status: 204 })));
    window.location.hash = "#7K2M-9QX4";
    render(<PairPage />);
    await waitFor(() => expect(document.body.textContent).not.toContain("7K2M-9QX4"));
  });

  it("submits a manually typed code and clears the input immediately", async () => {
    let seenBody: unknown;
    server.use(
      http.post(`${BASE}/v1/pair`, async ({ request }) => {
        seenBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    window.location.hash = "";
    render(<PairPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/pairing code/i), "7K2M-9QX4");
    await user.click(screen.getByRole("button", { name: /pair/i }));

    // The field (and the code with it) is gone the instant submission starts
    // -- queried fresh, not from a reference held before the click, since a
    // stale DOM node can retain its last real value after being unmounted.
    expect(screen.queryByLabelText(/pairing code/i)).not.toBeInTheDocument();
    await waitFor(() => expect(seenBody).toEqual({ code: "7K2M-9QX4" }));
    expect(document.body.textContent).not.toContain("7K2M-9QX4");
  });

  it("rejects an empty manual submission without ever calling the daemon", async () => {
    let called = false;
    server.use(
      http.post(`${BASE}/v1/pair`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    window.location.hash = "";
    render(<PairPage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /pair/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/code/i);
    expect(called).toBe(false);
  });
});
