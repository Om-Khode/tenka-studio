import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ToggleControl } from "./ToggleControl";
import type { SettingDef } from "@/types/settings";

const DEF: SettingDef = {
  key: "camera_enabled", group: "Camera / Face", label: "camera", kind: "toggle",
  default: true, needsRestart: true, source: "default", description: "Camera on or off.",
};

describe("ToggleControl", () => {
  it("reflects the value", () => {
    render(<ToggleControl def={DEF} value={false} onChange={() => {}} disabled={false} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("reports the flipped value", () => {
    const onChange = vi.fn();
    render(<ToggleControl def={DEF} value={false} onChange={onChange} disabled={false} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("cannot be changed when disabled", () => {
    const onChange = vi.fn();
    render(<ToggleControl def={DEF} value={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
