import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TextControl } from "./TextControl";
import type { SettingDef } from "@/types/settings";

const DEF: SettingDef = {
  key: "assistant_name", group: "Assistant Identity", label: "assistant name", kind: "text",
  default: "TENKA", needsRestart: true, source: "default",
  description: "Her display name.",
};

describe("TextControl", () => {
  it("reports what was typed", () => {
    const onChange = vi.fn();
    render(<TextControl def={DEF} value="TENKA" onChange={onChange} disabled={false} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "AKNET" } });
    expect(onChange).toHaveBeenCalledWith("AKNET");
  });

  it("is read-only when disabled", () => {
    render(<TextControl def={DEF} value="TENKA" onChange={() => {}} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
