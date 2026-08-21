import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { SliderControl, roundToStep } from "./SliderControl";
import type { SettingDef } from "@/types/settings";

// Stub ResizeObserver for Radix Slider, which uses it to measure track width.
// This is scoped to SliderControl tests only to avoid silencing resize assertions elsewhere.
class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const DEF: SettingDef = {
  key: "tts_speed", group: "Voice I/O", label: "speech rate", kind: "slider",
  default: 1, min: 0.5, max: 2, step: 0.05, needsRestart: false, source: "default",
  description: "TTS speech rate multiplier.",
};

describe("SliderControl", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the bounds and current value", () => {
    render(<SliderControl def={DEF} value={1.25} onChange={() => {}} disabled={false} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuenow", "1.25");
    expect(slider).toHaveAttribute("aria-valuemin", "0.5");
    expect(slider).toHaveAttribute("aria-valuemax", "2");
  });

  it("prints the current value so the number is readable without dragging", () => {
    render(<SliderControl def={DEF} value={1.25} onChange={() => {}} disabled={false} />);
    expect(screen.getByText("1.25")).toBeInTheDocument();
  });

  it("prints unrepresentable values with correct precision", () => {
    // 1.2000000000000002 is not exactly representable in binary float.
    // With step 0.05 (2 decimals), it must render as "1.20", not the noisy string.
    render(<SliderControl def={DEF} value={1.2000000000000002} onChange={() => {}} disabled={false} />);
    expect(screen.getByText("1.20")).toBeInTheDocument();
  });

  it("marks itself disabled", () => {
    render(<SliderControl def={DEF} value={1} onChange={() => {}} disabled />);
    expect(screen.getByRole("slider")).toHaveAttribute("data-disabled");
  });
});

describe("roundToStep", () => {
  it("rounds float-noisy values to the step precision", () => {
    // Binary float rounding error: 0.1 + 0.1 + 0.1 === 0.30000000000000004
    expect(roundToStep(0.30000000000000004, 0.1)).toBe(0.3);
  });

  it("rounds Radix slider output with step 0.05", () => {
    // Common output from Radix with small steps
    expect(roundToStep(1.2000000000000002, 0.05)).toBe(1.2);
  });

  it("preserves exact values", () => {
    expect(roundToStep(1.25, 0.05)).toBe(1.25);
  });

  it("returns integer when step is 1", () => {
    expect(roundToStep(5.9999999999, 1)).toBe(6);
  });
});

describe("a slider key the registry has never seen", () => {
  // SettingsRepo.load()'s contract: the daemon may report a key the registry
  // has no presentation data for. Bounds come from the registry only, so this
  // is the reachable case, not a hypothetical one.
  const unbounded = {
    key: "some.unregistered.knob",
    label: "Some unregistered knob",
    group: "Voice",
    kind: "slider" as const,
    default: 0,
    description: "",
    needsRestart: false,
    source: "default" as const,
  };

  it("does not draw a real value against an invented 0..1 scale", () => {
    render(<SliderControl def={unbounded} value={5} onChange={() => {}} disabled={false} />);

    // The old code passed min={0} max={1}, so 5 pinned the thumb at the right
    // edge and announced aria-valuemax=1 -- "at maximum" about a range nobody
    // stated. No slider must be rendered at all when the bounds are unknown.
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("still shows the value, via a control that claims no range", () => {
    render(<SliderControl def={unbounded} value={5} onChange={() => {}} disabled={false} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(5);
  });
});
