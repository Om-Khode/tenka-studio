import { describe, it, expect } from "vitest";
import { refusalFor, isRefusalError, capabilityState, GENERIC_REFUSAL_MESSAGE } from "./refusal";
import { CAPABILITIES, type Capability, type Session } from "@/types/session";

function session(
  granted: Capability[],
  effective: Capability[],
  policy = "local",
  raised: Capability[] = [],
  raiseExpiresInSeconds: number | null = null,
): Session {
  const usable = new Set<string>(effective);
  return {
    deviceId: "d1",
    label: "Pixel 8",
    granted,
    effective,
    policy,
    raised,
    raiseExpiresInSeconds,
    canUse: (c) => usable.has(c),
  };
}

describe("refusalFor", () => {
  it("says nothing about a capability this connection actually has", () => {
    expect(refusalFor(session(["files"], ["files"]), "files")).toBeNull();
  });

  it("says nothing when there is no session -- unknown is not refused", () => {
    // The demo tree never probes. A helper that returned a refusal for a null
    // session would put "your device wasn't given..." on every demo error.
    expect(refusalFor(null, "files")).toBeNull();
  });

  it("blames the pairing when the device was never granted it", () => {
    const r = refusalFor(session(["observe"], ["observe"]), "files");
    expect(r?.reason).toBe("device");
    expect(r?.message).toBe(
      "Your device wasn't given access to her files when it paired. Pair it again from her machine to change that.",
    );
  });

  it("blames the connection when the grant exists but the listener won't carry it", () => {
    // granted has it, effective does not -- a phone reaching her over funnel.
    // Different fact, different fix: reconnect, don't re-pair.
    const r = refusalFor(session(["files", "observe"], ["observe"], "funnel"), "files");
    expect(r?.reason).toBe("connection");
    expect(r?.message).toBe(
      "Your device has access to her files, but the connection you're on won't carry it. The funnel listener is capped lower than the device is. Open Studio on her machine to use it.",
    );
  });

  it("still writes a usable sentence when the daemon reports no policy name", () => {
    const r = refusalFor(session(["files"], [], ""), "files");
    expect(r?.reason).toBe("connection");
    expect(r?.message).not.toContain("undefined");
    expect(r?.message).toContain("won't carry it. Open Studio");
  });

  it("names every capability, so a seventh one cannot ship with an empty sentence", () => {
    for (const capability of CAPABILITIES) {
      const r = refusalFor(session([], [], "local"), capability);
      expect(r?.message ?? "").not.toMatch(/wasn't given\s+when/);
      expect(r?.message.length ?? 0).toBeGreaterThan(40);
    }
  });

  it("never phrases a refusal as a connection failure", () => {
    for (const capability of CAPABILITIES) {
      expect(refusalFor(session([], [], "local"), capability)?.message).not.toMatch(
        /could not reach/i,
      );
    }
    expect(GENERIC_REFUSAL_MESSAGE).not.toMatch(/could not reach/i);
  });
});

describe("capabilityState", () => {
  it("reports granted for an ordinary effective capability, no raise involved", () => {
    expect(capabilityState(session(["files"], ["files"]), "files")).toEqual({ kind: "granted" });
  });

  it("reports refused, carrying the same reason/message refusalFor would, for a denied capability", () => {
    const state = capabilityState(session(["observe"], ["observe"]), "files");
    expect(state.kind).toBe("refused");
    if (state.kind === "refused") {
      expect(state.reason).toBe("device");
      expect(state.message).toContain("wasn't given access to her files");
    }
  });

  it("reports raised -- not granted, not refused -- for a capability only live because of a raise", () => {
    // effective includes execute (the daemon already folded the raise in),
    // and `raised` names it as the reason.
    const state = capabilityState(
      session(["observe", "execute"], ["observe", "execute"], "tailnet", ["execute"], 1800),
      "execute",
    );
    expect(state.kind).toBe("raised");
    if (state.kind === "raised") {
      expect(state.message).toContain("raised it at the keyboard");
      expect(state.message).toContain("30 minutes");
    }
  });

  it("takes raised over refused/granted even when raised is otherwise indistinguishable from granted", () => {
    // A control lit up by a raise must render differently from one always
    // enabled, even though both are technically usable right now.
    const raised = capabilityState(
      session(["execute"], ["execute"], "tailnet", ["execute"], 60),
      "execute",
    );
    const granted = capabilityState(session(["execute"], ["execute"], "tailnet"), "execute");
    expect(raised.kind).toBe("raised");
    expect(granted.kind).toBe("granted");
  });

  it("singularises the one-minute case rather than reading '1 minutes'", () => {
    const state = capabilityState(
      session(["execute"], ["execute"], "tailnet", ["execute"], 60),
      "execute",
    );
    expect(state.kind).toBe("raised");
    if (state.kind === "raised") expect(state.message).toContain("1 minute.");
  });

  it("omits the countdown sentence entirely when the daemon reports none", () => {
    const state = capabilityState(
      session(["execute"], ["execute"], "tailnet", ["execute"], null),
      "execute",
    );
    expect(state.kind).toBe("raised");
    if (state.kind === "raised") expect(state.message).not.toContain("Ends in");
  });
});

describe("isRefusalError", () => {
  it("recognises a 403 without importing ApiError", () => {
    expect(isRefusalError({ status: 403, code: "forbidden" })).toBe(true);
  });

  it("leaves every other failure alone", () => {
    expect(isRefusalError({ status: 500 })).toBe(false);
    expect(isRefusalError({ status: 0, code: "unreachable" })).toBe(false);
    expect(isRefusalError(new Error("offline"))).toBe(false);
    expect(isRefusalError(undefined)).toBe(false);
    expect(isRefusalError(null)).toBe(false);
  });
});
