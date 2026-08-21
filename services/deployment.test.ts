import { describe, it, expect, vi, afterEach } from "vitest";
import { isPublicDemoBuild } from "./deployment";

describe("isPublicDemoBuild", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is false when the variable is unset -- local dev and the test suite keep the whole tree", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", undefined);
    expect(isPublicDemoBuild()).toBe(false);
  });

  it('is true for exactly "1"', () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "1");
    expect(isPublicDemoBuild()).toBe(true);
  });

  it('is false for "0"', () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "0");
    expect(isPublicDemoBuild()).toBe(false);
  });

  it('is false for "false" -- the case strict comparison exists to reject', () => {
    // A Vercel env row reading `false` is the realistic mistake. Under
    // truthiness it is a non-empty string, which would gate the entire live
    // tree while the dashboard shows a value that reads as "off".
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "false");
    expect(isPublicDemoBuild()).toBe(false);
  });

  it('is false for "true" -- one spelling of on, and it is "1"', () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ONLY", "true");
    expect(isPublicDemoBuild()).toBe(false);
  });
});
