import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readDevToken,
  setDevToken,
  clearDevToken,
  clearLegacyTokens,
  revokeSession,
  onSessionRevoked,
} from "./token";

const DEV_TOKEN_KEY = "tenka-studio-dev-token";
const LEGACY_TOKEN_KEYS = ["tenka-studio-device-token", "tenka.token"];

describe("dev-token storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing has been written", () => {
    expect(readDevToken()).toBeNull();
  });

  it("round-trips a written token", () => {
    setDevToken("device-secret-1");
    expect(readDevToken()).toBe("device-secret-1");
    expect(window.localStorage.getItem(DEV_TOKEN_KEY)).toBe("device-secret-1");
  });

  it("clearDevToken removes it", () => {
    setDevToken("device-secret-1");
    clearDevToken();
    expect(readDevToken()).toBeNull();
  });

  it("overwrites rather than appending on a second write", () => {
    setDevToken("first");
    setDevToken("second");
    expect(readDevToken()).toBe("second");
  });

  it("readDevToken swallows a storage access error instead of throwing", () => {
    const spy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: storage disabled");
    });
    expect(() => readDevToken()).not.toThrow();
    expect(readDevToken()).toBeNull();
    spy.mockRestore();
  });

  it("setDevToken swallows a storage write error instead of throwing", () => {
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => setDevToken("x")).not.toThrow();
    spy.mockRestore();
  });
});

describe("revocation", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("drops the dev token and tells every listener", () => {
    setDevToken("refused-token");
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribes = [onSessionRevoked(first), onSessionRevoked(second)];

    revokeSession();

    expect(readDevToken()).toBeNull();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    for (const unsubscribe of unsubscribes) unsubscribe();
  });

  it("clears before it notifies, so nothing a listener does can re-present the refused credential", () => {
    setDevToken("refused-token");
    let seenDuringNotify: string | null = "unset";
    const unsubscribe = onSessionRevoked(() => {
      seenDuringNotify = readDevToken();
    });

    revokeSession();

    expect(seenDuringNotify).toBeNull();
    unsubscribe();
  });

  it("stops notifying once unsubscribed -- an unmounted shell must not be woken", () => {
    const listener = vi.fn();
    onSessionRevoked(listener)();

    revokeSession();

    expect(listener).not.toHaveBeenCalled();
  });

  it("survives a listener that unsubscribes itself mid-notification", () => {
    const later = vi.fn();
    const unsubscribeLater = onSessionRevoked(later);
    const unsubscribeSelf = onSessionRevoked(() => unsubscribeSelf());

    expect(() => revokeSession()).not.toThrow();
    expect(later).toHaveBeenCalledTimes(1);

    unsubscribeLater();
  });
});

/**
 * A pre-6a build wrote the real device token to localStorage. The daemon
 * stopped accepting those the moment pairing moved to an httpOnly cookie, so
 * the value is dead -- but "dead" is not something a stolen string
 * advertises, and an injected script can still read it. Cleared at startup,
 * not merely left unread.
 */
describe("legacy tokens", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("removes every key a pre-6a build is known to have written", () => {
    for (const key of LEGACY_TOKEN_KEYS) window.localStorage.setItem(key, "old-token");

    clearLegacyTokens();

    for (const key of LEGACY_TOKEN_KEYS) expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("leaves the dev token alone -- it lives under a key of its own precisely so this cannot eat it", () => {
    setDevToken("still-needed-on-localhost");

    clearLegacyTokens();

    expect(readDevToken()).toBe("still-needed-on-localhost");
  });

  it("swallows a storage error rather than taking startup down with it", () => {
    const spy = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError: storage disabled");
    });
    expect(() => clearLegacyTokens()).not.toThrow();
    spy.mockRestore();
  });

  it("never shares a key with the dev token", () => {
    expect(LEGACY_TOKEN_KEYS).not.toContain(DEV_TOKEN_KEY);
  });
});
