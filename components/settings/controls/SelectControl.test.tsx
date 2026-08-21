import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SelectControl } from "./SelectControl";
import type { SettingDef } from "@/types/settings";

const DEF: SettingDef = {
  key: "personality", group: "Voice I/O", label: "personality base", kind: "select",
  default: "warm_honest", needsRestart: false, source: "db",
  description: "Active personality base.",
  options: [
    { value: "warm_honest", label: "warm honest" },
    { value: "tsundere", label: "tsundere" },
    { value: "minimal", label: "minimal" },
  ],
};

describe("SelectControl", () => {
  it("shows the label of the current value, not its raw key", () => {
    render(<SelectControl def={DEF} value="warm_honest" onChange={() => {}} disabled={false} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("warm honest");
  });

  it("names itself for assistive tech", () => {
    render(<SelectControl def={DEF} value="minimal" onChange={() => {}} disabled={false} />);
    expect(screen.getByRole("combobox", { name: "personality base" })).toBeInTheDocument();
  });

  it("is disabled when told to be", () => {
    render(<SelectControl def={DEF} value="minimal" onChange={() => {}} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
