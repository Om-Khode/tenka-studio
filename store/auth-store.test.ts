import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase } from "@/services/http";
import { clearDevToken } from "@/services/token";
import { CAPABILITIES, isCapability } from "@/types/session";
import { useAuthStore, initAuth } from "./auth-store";

const BASE = apiBase();
const envelope = <T,>(data: T) => ({
  data,
  meta: { requestId: "r1", generatedAt: "2026-08-15T00:00:00Z" },
});

function session(
  overrides: Partial<{
    grants: string[];
    effective: string[];
    policy: string;
    raised: string[];
    raiseExpiresInSeconds: number | null;
  }> = {},
) {
  server.use(
    http.get(`${BASE}/v1/session`, () =>
      HttpResponse.json(
        envelope({
          deviceId: "d1",
          label: "phone",
          grants: overrides.grants ?? ["observe", "recall", "files", "system_control"],
          effective: overrides.effective ?? ["observe"],
          raised: overrides.raised ?? [],
          raiseExpiresInSeconds: overrides.raiseExpiresInSeconds ?? null,
          policy: overrides.policy ?? "funnel",
        }),
      ),
    ),
  );
}

describe("auth store", () => {
  beforeEach(() => {
    clearDevToken();
    localStorage.clear();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  it("starts undecided, not unauthorised -- the gate must be able to tell those apart", () => {
    expect(useAuthStore.getState().phase).toBe("unknown");
    expect(useAuthStore.getState().session).toBeNull();
  });

  it("becomes authorised on a session the daemon answers", async () => {
    session();

    await useAuthStore.getState().probe();

    const { phase, session: s } = useAuthStore.getState();
    expect(phase).toBe("authorized");
    expect(s?.deviceId).toBe("d1");
    expect(s?.policy).toBe("funnel");
  });

  /**
   * The whole reason `GET /v1/session` returns two lists. This device was
   * issued `files` at pairing and genuinely holds it -- but it is reaching her
   * down a tunnel whose ceiling is `observe`, so on THIS connection it cannot
   * browse files. A `canUse()` reading `granted` would enable a control that
   * then fails at the daemon, and the failure would be unexplainable at the UI.
   */
  it("gates on effective, not granted", async () => {
    session({ grants: ["observe", "files"], effective: ["observe"] });

    await useAuthStore.getState().probe();

    const s = useAuthStore.getState().session!;
    expect(s.canUse("observe")).toBe(true);
    expect(s.canUse("files")).toBe(false);
    // ...and still reports the grant, so the UI can say WHICH of the two
    // stories this is.
    expect(s.granted).toContain("files");
    expect(s.effective).not.toContain("files");
  });

  /**
   * Milestone 6b's third case. `raised` names which of `effective`'s
   * capabilities are only there because someone deliberately, temporarily
   * lifted the ceiling -- so a raise banner reading it can say a floor was
   * raised rather than rendering an ordinary, permanent-looking control.
   */
  it("carries a live raise's capabilities and countdown separately from effective", async () => {
    session({
      effective: ["observe", "execute"],
      raised: ["execute"],
      raiseExpiresInSeconds: 1800,
    });

    await useAuthStore.getState().probe();

    const s = useAuthStore.getState().session!;
    expect(s.canUse("execute")).toBe(true);
    expect(s.raised).toEqual(["execute"]);
    expect(s.raiseExpiresInSeconds).toBe(1800);
  });

  it("reports no raise as an empty list and a null countdown, not as undefined", async () => {
    session({ effective: ["observe"] });

    await useAuthStore.getState().probe();

    const s = useAuthStore.getState().session!;
    expect(s.raised).toEqual([]);
    expect(s.raiseExpiresInSeconds).toBeNull();
  });

  it("reports a 401 as unauthorised, and says so was the daemon's answer", async () => {
    server.use(
      http.get(`${BASE}/v1/session`, () =>
        HttpResponse.json({ detail: "unauthorized" }, { status: 401 }),
      ),
    );

    await useAuthStore.getState().probe();

    expect(useAuthStore.getState().phase).toBe("unauthorized");
    expect(useAuthStore.getState().refusal).toBe("unauthorized");
  });

  /**
   * Both end up at the connect screen, but "she doesn't know this device" and
   * "she isn't running" are different sentences and only one of them is fixed
   * by pairing again. Collapsing them here would make that message
   * unwriteable later.
   */
  it("distinguishes an unreachable daemon from a refusal", async () => {
    server.use(http.get(`${BASE}/v1/session`, () => HttpResponse.error()));

    await useAuthStore.getState().probe();

    expect(useAuthStore.getState().phase).toBe("unauthorized");
    expect(useAuthStore.getState().refusal).toBe("unreachable");
  });

  it("clear() ends the session without a network call", async () => {
    session({ effective: ["observe"] });
    await useAuthStore.getState().probe();
    expect(useAuthStore.getState().phase).toBe("authorized");

    // No handler is registered for this; if clear() went to the network at all
    // MSW's onUnhandledRequest: "error" would fail the test.
    useAuthStore.getState().clear();

    expect(useAuthStore.getState().phase).toBe("unauthorized");
    expect(useAuthStore.getState().session).toBeNull();
  });

  it("initAuth wipes a pre-6a token without needing the daemon", () => {
    localStorage.setItem("tenka-studio-device-token", "old-token");
    localStorage.setItem("tenka.token", "old-token");

    // Deliberately no session handler: startup housekeeping must not depend on
    // her being reachable.
    initAuth();

    expect(localStorage.getItem("tenka-studio-device-token")).toBeNull();
    expect(localStorage.getItem("tenka.token")).toBeNull();
  });

  it("a later probe replaces an earlier answer rather than merging with it", async () => {
    session({ effective: ["observe", "files"] });
    await useAuthStore.getState().probe();
    expect(useAuthStore.getState().session!.canUse("files")).toBe(true);

    server.resetHandlers();
    session({ effective: ["observe"] });
    await useAuthStore.getState().probe();

    expect(useAuthStore.getState().session!.canUse("files")).toBe(false);
  });

  it("does not hold a stale session behind an unauthorised status", async () => {
    session();
    await useAuthStore.getState().probe();

    server.resetHandlers();
    server.use(
      http.get(`${BASE}/v1/session`, () =>
        HttpResponse.json({ detail: "unauthorized" }, { status: 401 }),
      ),
    );
    await useAuthStore.getState().probe();

    expect(useAuthStore.getState().session).toBeNull();
  });
});

/**
 * The capability set changed under this repo in 6a: `chat` split into
 * `observe` and `recall`. A comparison against a member the daemon never
 * sends again does not error -- it returns false, disables a control, and
 * costs somebody an afternoon. `canUse()` takes the union type so the call
 * site is a compile error; this is the runtime half of the same guard.
 */
describe("the capability set", () => {
  it("has no member named `chat`", () => {
    expect(CAPABILITIES as readonly string[]).not.toContain("chat");
    expect(isCapability("chat")).toBe(false);
  });

  it("carries both halves of the split, and the send capability that did not change", () => {
    for (const member of ["observe", "recall", "chat_send"]) {
      expect(isCapability(member)).toBe(true);
    }
  });
});
