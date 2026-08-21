import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase } from "@/services/http";
import { configureRepos, getRepoMode } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import { clearDevToken } from "@/services/token";
import { useAuthStore } from "@/store/auth-store";

const replace = vi.fn();
const push = vi.fn();
/**
 * The real notFound() THROWS -- that is how it stops a render. A vi.fn() that
 * returns undefined would let every line below the gate run, and this whole
 * file would pass while the gate did nothing at all.
 *
 * vi.hoisted() (rather than a bare vi.fn()) is required: this file's
 * component-under-test imports (AppLayout, ConnectPage) sit below this mock
 * block, and Vitest hoists those imports above ordinary top-level const
 * declarations when it rewrites the module -- so a plain const would still be
 * in its temporal dead zone the moment the mock factory runs, since notFound
 * is referenced directly (as a bare value), not from inside a closure called
 * later. vi.hoisted pins the declaration to the same hoisted position as
 * vi.mock itself.
 */
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ replace, push }),
  notFound,
}));

import AppLayout from "./app/layout";
import ConnectPage from "./connect/page";
import PairPage from "./pair/page";

describe("public demo build: the live tree is excluded", () => {
  beforeEach(() => {
    notFound.mockClear();
    replace.mockClear();
    clearDevToken();
    localStorage.clear();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    // The mode every other test file assumes. Asserted below to still be
    // "demo" after a gated render -- that is the real subject here.
    configureRepos("demo", demoRepoBundle);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    configureRepos("demo", demoRepoBundle);
  });

  it("AppLayout 404s instead of rendering the shell", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "1");

    expect(() =>
      render(
        <AppLayout>
          <div>page content</div>
        </AppLayout>,
      ),
    ).toThrow(/NEXT_NOT_FOUND/);

    expect(notFound).toHaveBeenCalled();
    expect(screen.queryByText("page content")).not.toBeInTheDocument();
  });

  /**
   * The assertion that matters, and the reason this is not simply "a 404
   * results". switchMode("live", liveRepoBundle) binds the HTTP repo bundle to
   * module-singleton stores on every render of that layout. In a build that can
   * never reach a daemon, binding it means every hydration hook and every store
   * action in the tree is pointed at an unreachable base URL. The gate has to
   * come BEFORE that line, and only an ordering assertion can hold it there --
   * milestone 5b's C1 was a gate test that proved the gate and not the route.
   */
  it("AppLayout 404s without binding the live repo bundle", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "1");

    expect(() =>
      render(
        <AppLayout>
          <div>page content</div>
        </AppLayout>,
      ),
    ).toThrow(/NEXT_NOT_FOUND/);

    expect(getRepoMode()).toBe("demo");
  });

  it("ConnectPage 404s instead of offering a token field", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "1");

    expect(() => render(<ConnectPage />)).toThrow(/NEXT_NOT_FOUND/);

    expect(notFound).toHaveBeenCalled();
    expect(screen.queryByLabelText(/device token/i)).not.toBeInTheDocument();
  });

  it("with the flag off, ConnectPage still renders the token field", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", undefined);

    render(<ConnectPage />);

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/device token/i)).toBeInTheDocument();
  });

  it("PairPage 404s instead of offering to exchange a pairing code", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "1");
    window.location.hash = "";

    expect(() => render(<PairPage />)).toThrow(/NEXT_NOT_FOUND/);

    expect(notFound).toHaveBeenCalled();
    expect(screen.queryByLabelText(/pairing code/i)).not.toBeInTheDocument();
  });

  it("with the flag off, PairPage still offers manual entry", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", undefined);
    window.location.hash = "";

    render(<PairPage />);

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/pairing code/i)).toBeInTheDocument();
  });

  it("with the flag off, AppLayout still redirects an unauthorised visitor to /connect", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", undefined);
    // The gate asks the daemon now (GET /v1/session) rather than reading a
    // token out of storage -- the credential is an httpOnly cookie as of 6a,
    // so "unauthorised" is a stubbed 401, not an empty localStorage.
    server.use(
      http.get(`${apiBase()}/v1/session`, () =>
        HttpResponse.json({ detail: "unauthorized" }, { status: 401 }),
      ),
    );

    render(
      <AppLayout>
        <div>page content</div>
      </AppLayout>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/connect"));
    expect(notFound).not.toHaveBeenCalled();
  });
});
