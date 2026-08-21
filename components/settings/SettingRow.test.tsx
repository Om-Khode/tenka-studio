import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { SettingRow } from "./SettingRow";
import { useSettingsStore, effectiveValue } from "@/store/settings-store";
import { findSetting } from "@/store/settings-registry";
import type { SettingDef } from "@/types/settings";

const TTS = findSetting("tts_speed")!;
const ENV_LOCKED = findSetting("vocal_casual_language")!;
const RESTART = findSetting("wake_word_enabled")!;

// Stub ResizeObserver for Radix Slider (TTS is a slider row), which uses it
// to measure track width. Scoped to this file, same as SliderControl.test.tsx.
class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("SettingRow", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
    localStorage.clear();
  });

  it("shows the label and the description verbatim", () => {
    render(<SettingRow def={TTS} />);
    expect(screen.getByText(TTS.label)).toBeInTheDocument();
    expect(screen.getByText(TTS.description)).toBeInTheDocument();
  });

  it("writes edits into the store as a draft", () => {
    render(<SettingRow def={RESTART} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(useSettingsStore.getState().drafts.wake_word_enabled).toBe(false);
  });

  it("locks an env-owned row and states why", () => {
    render(<SettingRow def={ENV_LOCKED} />);
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText(/set by an environment variable/i)).toBeInTheDocument();
  });

  it("badges a restart-flagged row, and only a restart-flagged row", () => {
    const { rerender } = render(<SettingRow def={RESTART} />);
    expect(screen.getByText(/needs restart/i)).toBeInTheDocument();

    // TTS.needsRestart is false in the real registry — an implementation
    // that rendered the badge unconditionally would pass the assertion
    // above but must fail this one.
    rerender(<SettingRow def={TTS} />);
    expect(screen.queryByText(/needs restart/i)).not.toBeInTheDocument();
  });

  it("offers reset only once the value differs from the default, and clears override/draft/error together", () => {
    const { rerender } = render(<SettingRow def={TTS} />);
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();

    // A draft AND a pre-existing override AND a pre-existing error, so the
    // reset has three distinct things to clear. Setting overrides/errors via
    // setState directly (not through setDraft, which itself deletes the
    // key's error) keeps them independent of the draft write below.
    useSettingsStore.getState().setDraft("tts_speed", 1.5);
    useSettingsStore.setState({
      overrides: { tts_speed: 1.75 },
      errors: { tts_speed: "rejected by the daemon" },
    });
    rerender(<SettingRow def={TTS} />);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));

    // Assert the store state itself, not just the resolved value: a "reset"
    // that merely wrote setDraft(key, def.default) would also make
    // effectiveValue resolve to the default, while leaving the override and
    // draft entries behind. Only a real resetKey call clears all three.
    const state = useSettingsStore.getState();
    expect(state.overrides).not.toHaveProperty("tts_speed");
    expect(state.drafts).not.toHaveProperty("tts_speed");
    expect(state.errors).not.toHaveProperty("tts_speed");
    expect(effectiveValue(state, "tts_speed")).toBe(TTS.default);
  });

  it("shows a per-key save error", () => {
    useSettingsStore.setState({ errors: { tts_speed: "rejected by the daemon" } });
    render(<SettingRow def={TTS} />);
    expect(screen.getByText("rejected by the daemon")).toBeInTheDocument();
  });

  it("degrades an unknown control kind to read-only rather than blanking", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const alien = { ...TTS, key: "from_the_future", kind: "colorwheel" } as unknown as SettingDef;
    render(<SettingRow def={alien} />);
    expect(screen.getByText(/this build has no control for/i)).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
