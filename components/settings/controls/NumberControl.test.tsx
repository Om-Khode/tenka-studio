import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NumberControl } from "./NumberControl";
import type { SettingDef } from "@/types/settings";

const DEF: SettingDef = {
  key: "browser_cdp_port", group: "Browser CDP", label: "CDP port", kind: "number",
  default: 9222, min: 1024, max: 65535, step: 1, needsRestart: false, source: "default",
  description: "Port to probe for Chrome's CDP endpoint.",
};

describe("NumberControl", () => {
  it("carries its bounds onto the input", () => {
    render(<NumberControl def={DEF} value={9222} onChange={() => {}} disabled={false} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveAttribute("min", "1024");
    expect(input).toHaveAttribute("max", "65535");
  });

  it("reports a numeric value, never a string", () => {
    const onChange = vi.fn();
    render(<NumberControl def={DEF} value={9222} onChange={onChange} disabled={false} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "9333" } });
    expect(onChange).toHaveBeenCalledWith(9333);
  });

  it("ignores an unparseable entry rather than reporting NaN", () => {
    const onChange = vi.fn();
    render(<NumberControl def={DEF} value={9222} onChange={onChange} disabled={false} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
