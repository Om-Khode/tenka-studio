import { renderHook } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { useLoopbackAdminGate, LOOPBACK_ADMIN_REFUSED_MESSAGE } from "./useLoopbackAdminGate";
import { useAuthStore } from "@/store/auth-store";
import type { Capability } from "@/types/session";

function authorize(granted: Capability[], effective: Capability[], policy: string) {
  const usable = new Set<string>(effective);
  useAuthStore.setState({
    phase: "authorized",
    refusal: null,
    session: {
      deviceId: "d1",
      label: "This desktop",
      granted,
      effective,
      policy,
      canUse: (c) => usable.has(c),
    },
  });
}

describe("useLoopbackAdminGate", () => {
  afterEach(() => useAuthStore.setState(useAuthStore.getInitialState(), true));

  it("is neither known nor refused before the probe lands", () => {
    const { result } = renderHook(() => useLoopbackAdminGate());
    expect(result.current.known).toBe(false);
    expect(result.current.refused).toBe(false);
    expect(result.current.message).toBeNull();
  });

  it("allows an admin session on the loopback listener", () => {
    authorize(["system_control"], ["system_control"], "local");
    const { result } = renderHook(() => useLoopbackAdminGate());
    expect(result.current.known).toBe(true);
    expect(result.current.refused).toBe(false);
    expect(result.current.message).toBeNull();
  });

  /**
   * PROOF-OF-FAILURE (fault 2). The gate refuses on TWO conditions and used to
   * name only the first. A person on 127.0.0.1 with an observe-only device was
   * told "she refuses it from anywhere else, including a tunnel" -- a statement
   * about where they were standing, and a false one, which sent them hunting a
   * networking problem that did not exist.
   */
  it("names the missing capability when the refusal is the capability", () => {
    authorize(["observe"], ["observe"], "local");
    const { result } = renderHook(() => useLoopbackAdminGate());
    expect(result.current.refused).toBe(true);
    expect(result.current.message).toBe(
      "Your device wasn't given system control when it paired. Pair it again from her machine to change that.",
    );
    expect(result.current.message).not.toContain("anywhere else");
    expect(result.current.message).not.toContain("tunnel");
  });

  it("still names the listener when the refusal really is the listener", () => {
    authorize(["system_control"], ["system_control"], "funnel");
    const { result } = renderHook(() => useLoopbackAdminGate());
    expect(result.current.refused).toBe(true);
    expect(result.current.message).toBe(LOOPBACK_ADMIN_REFUSED_MESSAGE);
  });

  it("prefers the listener when both conditions fail, because it is the cause", () => {
    // Off-loopback strips system_control from `effective` anyway, so reporting
    // the missing capability there would describe the symptom and hide why.
    authorize(["observe"], ["observe"], "funnel");
    const { result } = renderHook(() => useLoopbackAdminGate());
    expect(result.current.message).toBe(LOOPBACK_ADMIN_REFUSED_MESSAGE);
  });
});
