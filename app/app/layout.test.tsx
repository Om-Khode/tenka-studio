import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase } from "@/services/http";
import { clearDevToken, revokeSession } from "@/services/token";
import { useAuthStore } from "@/store/auth-store";
import { configureRepos, getRepoMode } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import { liveRepoBundle } from "@/services/repos/http";
import { useMemoryStore } from "@/store/memory-store";
import { useSystemStore } from "@/store/system-store";
import { seedMemory, HUB_ENTITY_ID } from "@/store/memory-scripts";
import type { MemorySnapshot } from "@/services/repos/types";

const replace = vi.fn();
const push = vi.fn();
// notFound is listed because app/app/layout.tsx imports it for the public-demo
// gate (see its comment). This file's tests all run with the flag off, so it is
// never called here -- but a factory that omits an imported export makes Vitest
// throw on the identifier rather than on the assertion.
//
// vi.hoisted() (rather than a bare vi.fn()) is required specifically for this
// one: replace/push are only ever read from inside the lazily-invoked
// useRouter() closure below, so their TDZ is irrelevant by the time anything
// calls them. notFound is referenced directly (as a bare value) in the
// returned object, and this file's own AppLayout/ConnectPage imports get
// hoisted above ordinary top-level consts when Vitest rewrites the module --
// so a plain const here would still be in its temporal dead zone the moment
// the mock factory runs. vi.hoisted pins the declaration to the same hoisted
// position as vi.mock itself.
const notFound = vi.hoisted(() => vi.fn());
let pathname = "/app";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace, push }),
  notFound,
}));

import AppLayout from "./layout";
import ConnectPage from "../connect/page";

const ROOT = join(import.meta.dirname, "..", "..");

/**
 * The layout components Next.js wraps `route` in, outermost first, as a
 * repo-relative path each. Read off the filesystem rather than hardcoded,
 * because the thing under test IS the route tree: a test that assumed the
 * shape it is trying to verify would verify nothing.
 *
 * `app/layout.tsx` (the root) is excluded on purpose. It gates nothing --
 * it is `<html><body>` and the fonts -- and rendering an <html> element
 * inside jsdom's container div is not valid nesting anyway. Every layout
 * BELOW it is a segment layout that can, and in this repo's case does,
 * decide whether its children render at all.
 */
function segmentLayoutsFor(route: string): string[] {
  const found: string[] = [];
  const walked: string[] = [];
  for (const segment of route.split("/").filter(Boolean)) {
    walked.push(segment);
    if (existsSync(join(ROOT, "app", ...walked, "layout.tsx"))) {
      found.push(`app/${walked.join("/")}/layout.tsx`);
    }
  }
  return found;
}

function pageFileFor(route: string): string {
  return join(ROOT, "app", ...route.split("/").filter(Boolean), "page.tsx");
}

/** Every segment layout this file knows how to render. An unmapped one is a
 * failure below, never a silent skip -- a chain quietly dropped on the floor
 * would turn this whole test back into the standalone render that missed the
 * bug in the first place. */
const SEGMENT_LAYOUTS: Record<string, React.ComponentType<{ children: React.ReactNode }>> = {
  "app/app/layout.tsx": AppLayout,
};

const EMPTY_SNAPSHOT: MemorySnapshot = {
  entities: [],
  facts: [],
  relationships: [],
  preferences: [],
  procedures: [],
};

/**
 * The layout mounts useEventStream() once a token is present (milestone 5b
 * Task 10). jsdom ships a real WebSocket, so without this stub every test
 * below that renders the authorized shell would open a TCP connection to a
 * daemon that is not running. The stream's own behaviour is
 * hooks/useEventStream.test.ts's subject, not this file's.
 */
class InertSocket {
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close() {}
}

const BASE = apiBase();
const envelope = <T,>(data: T) => ({
  data,
  meta: { requestId: "r1", generatedAt: "2026-08-15T00:00:00Z" },
});

/**
 * The gate no longer reads storage -- it asks `GET /v1/session`, because since
 * 6a the credential is an httpOnly cookie that script cannot see. So "signed
 * in" and "not signed in" are both a stubbed daemon answer here, not a
 * localStorage write, and every assertion below is necessarily async: there is
 * a round trip between mount and the decision.
 */
function grantSession(effective: string[] = ["observe", "recall", "chat_send", "files"]) {
  server.use(
    http.get(`${BASE}/v1/session`, () =>
      HttpResponse.json(
        envelope({
          deviceId: "d1",
          label: "desktop",
          grants: effective,
          effective,
          raised: [],
          raiseExpiresInSeconds: null,
          policy: "local",
        }),
      ),
    ),
  );
}

/** The daemon's single constant-shape 401 -- "not authorised", not "error". */
function refuseSession() {
  server.use(
    http.get(`${BASE}/v1/session`, () =>
      HttpResponse.json({ detail: "unauthorized" }, { status: 401 }),
    ),
  );
}

describe("AppLayout", () => {
  beforeEach(() => {
    // stubGlobal, not a plain assignment: jsdom installs WebSocket as a
    // read-only property on the global object.
    vi.stubGlobal("WebSocket", InertSocket);
    clearDevToken();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    replace.mockClear();
    pathname = "/app";
    // Every setState() on a persist-wrapped store writes through immediately
    // (see services/persist.ts's docstring) -- an earlier test's mode
    // transition can leave a real, harmless write sitting under a key this
    // test then reads, unless storage starts clean for each one.
    localStorage.clear();
    useMemoryStore.setState(useMemoryStore.getInitialState(), true);
  });

  afterEach(() => {
    // Every other test file's stores rely on demo mode being bound with zero
    // setup -- restore it so this file's mode switching cannot bleed into a
    // later test elsewhere in the suite.
    configureRepos("demo", demoRepoBundle);
    vi.unstubAllGlobals();
  });

  it("unauthorised: redirects to the connect screen and renders no page content", async () => {
    refuseSession();

    const { container } = render(
      <AppLayout>
        <div>page content</div>
      </AppLayout>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/connect"));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("page content")).not.toBeInTheDocument();
  });

  /**
   * The probe is a round trip, so there is a real window where the answer is
   * not in yet. Rendering the shell during it fires requests certain to 401;
   * redirecting during it bounces an authorised user out on every page load.
   * "Undecided" has to be its own state, and this is the half that a boolean
   * `authorized` could not express.
   */
  it("while the probe is still in flight: renders nothing AND redirects nowhere", async () => {
    let answer: (() => void) | undefined;
    server.use(
      http.get(`${BASE}/v1/session`, async () => {
        await new Promise<void>((resolve) => {
          answer = resolve;
        });
        return HttpResponse.json({ detail: "unauthorized" }, { status: 401 });
      }),
    );

    const { container } = render(
      <AppLayout>
        <div>page content</div>
      </AppLayout>,
    );

    await waitFor(() => expect(answer).toBeDefined());
    expect(container).toBeEmptyDOMElement();
    expect(replace).not.toHaveBeenCalled();

    answer!();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/connect"));
  });

  /**
   * The test above and app/connect/page.test.tsx were both green while a
   * first-time user could not reach the token field at all: one rendered the
   * gate and asserted the container was empty, the other rendered the connect
   * page with no layout around it, and nobody rendered the page Next.js
   * actually resolves for the redirect INSIDE the layouts that enclose it.
   * That composition is this test, and it is the only one here that can fail
   * if the connect route is ever moved back under a gated segment.
   */
  it("unauthorised: the redirect target actually renders the token field", async () => {
    refuseSession();

    render(
      <AppLayout>
        <div>page content</div>
      </AppLayout>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalled());

    const target = replace.mock.calls[0]?.[0] as string | undefined;
    expect(typeof target).toBe("string");
    expect(existsSync(pageFileFor(target!))).toBe(true);

    let tree = <ConnectPage />;
    for (const layout of segmentLayoutsFor(target!).reverse()) {
      const Layout = SEGMENT_LAYOUTS[layout];
      if (!Layout) throw new Error(`${layout} encloses ${target} and this test cannot render it`);
      const inner = tree;
      tree = <Layout>{inner}</Layout>;
    }

    render(tree);
    expect(screen.getByLabelText(/device token/i)).toBeInTheDocument();
  });

  it("authorised: renders the shell and children, and never redirects", async () => {
    grantSession();
    vi.spyOn(liveRepoBundle.memory, "load").mockResolvedValue(EMPTY_SNAPSHOT);

    render(
      <AppLayout>
        <div>page content</div>
      </AppLayout>,
    );

    await waitFor(() => expect(screen.getByText("page content")).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it("binds the live bundle synchronously in render, before memory-store's own load() effect ever calls getRepos()", async () => {
    grantSession();
    const order: string[] = [];
    const loadSpy = vi
      .spyOn(liveRepoBundle.memory, "load")
      .mockImplementation(async () => {
        order.push(getRepoMode() === "live" ? "getRepos-was-live" : "getRepos-was-NOT-live");
        return EMPTY_SNAPSHOT;
      });

    render(
      <AppLayout>
        <div>page content</div>
      </AppLayout>,
    );

    await waitFor(() => expect(loadSpy).toHaveBeenCalled());
    expect(order).toEqual(["getRepos-was-live"]);
  });

  it("a revoked session tears the shell down and routes back out, rather than leaving every pane failing on its own", async () => {
    grantSession();
    vi.spyOn(liveRepoBundle.memory, "load").mockResolvedValue(EMPTY_SNAPSHOT);

    render(
      <AppLayout>
        <div>page content</div>
      </AppLayout>,
    );
    await waitFor(() => expect(screen.getByText("page content")).toBeInTheDocument());

    // What a 401 in services/http.ts or a 1008 close in useEventStream does.
    act(() => revokeSession());

    // The shell is gone (so the socket is unmounted and no pane can fire
    // another request against a credential she has refused) AND the user is
    // sent somewhere they can fix it -- neither alone is a recovery.
    await waitFor(() => expect(screen.queryByText("page content")).not.toBeInTheDocument());
    expect(replace).toHaveBeenCalledWith("/connect");
  });

  it("a revoked session resets the load gates, so re-pairing cannot show the previous session's data", async () => {
    grantSession();
    vi.spyOn(liveRepoBundle.memory, "load").mockResolvedValue(EMPTY_SNAPSHOT);

    render(
      <AppLayout>
        <div>page content</div>
      </AppLayout>,
    );
    await waitFor(() => expect(screen.getByText("page content")).toBeInTheDocument());

    // Stand in for panes that loaded under the now-revoked session. system-store
    // is the sharpest case: its data is the machine's enrolled voices and faces.
    useSystemStore.setState({
      status: "ready",
      voices: [
        {
          id: "v9",
          name: "PreviousInstall",
          sampleCount: 4,
          enrolledAt: "2026-07-01T00:00:00.000Z",
          lastHeardAt: null,
        },
      ],
    });

    act(() => revokeSession());

    // Re-pairing returns to /app with the mode still "live", so switchMode()
    // short-circuits and never resets anything. Unless the revocation itself
    // resets, every pane stays "ready" and never loads again -- the user reads
    // the previous install's data under a new session.
    expect(useSystemStore.getState().status).toBe("idle");
    expect(useSystemStore.getState().voices.some((v) => v.name === "PreviousInstall")).toBe(false);
  });

  it("keeps demo's forgotten-entity overlay and live's overlay under separate storage keys", async () => {
    configureRepos("demo", demoRepoBundle);
    useMemoryStore.setState({ ...seedMemory(), status: "ready" });
    useMemoryStore.getState().forgetEntity(HUB_ENTITY_ID);

    const demoRaw = localStorage.getItem("tenka-studio-memory");
    expect(demoRaw).not.toBeNull();
    expect(JSON.parse(demoRaw!).state.overlay.forgottenEntities).toEqual([HUB_ENTITY_ID]);

    // Simulate the /app tree's first-ever load in its own session: memory
    // resets, storage does not. Mirrors store/chat-store-persist.test.ts's
    // simulateReload(): a bare setState() writes through immediately (every
    // persist-wrapped store's setState does, per services/persist.ts's own
    // docstring), so the demo key has to be snapshotted and restored around
    // the reset rather than trusted to survive it untouched -- that write-
    // through is exactly why switchMode() itself only ever touches
    // status/hasHydrated, never a persisted field like `overlay`.
    useMemoryStore.setState(useMemoryStore.getInitialState(), true);
    localStorage.setItem("tenka-studio-memory", demoRaw!);

    configureRepos("live", demoRepoBundle);
    expect(localStorage.getItem("tenka-studio-memory:live")).toBeNull();

    await useMemoryStore.persist.rehydrate();
    expect(useMemoryStore.getState().overlay.forgottenEntities).toEqual([]);

    // And the demo key on disk is exactly what it was before the switch.
    expect(localStorage.getItem("tenka-studio-memory")).toBe(demoRaw);
  });
});
