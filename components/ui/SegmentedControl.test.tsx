import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

const ITEMS = [
  { value: "a", label: "alpha" },
  { value: "b", label: "beta" },
];

describe("SegmentedControl", () => {
  it("marks only the active item as selected", () => {
    render(<SegmentedControl items={ITEMS} value="b" onChange={() => {}} label="Letters" />);
    expect(screen.getByRole("tab", { name: "beta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "alpha" })).toHaveAttribute("aria-selected", "false");
  });

  it("reports the clicked value", () => {
    const onChange = vi.fn();
    render(<SegmentedControl items={ITEMS} value="a" onChange={onChange} label="Letters" />);
    fireEvent.click(screen.getByRole("tab", { name: "beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("names the tablist for screen readers", () => {
    render(<SegmentedControl items={ITEMS} value="a" onChange={() => {}} label="Letters" />);
    expect(screen.getByRole("tablist", { name: "Letters" })).toBeInTheDocument();
  });
});
