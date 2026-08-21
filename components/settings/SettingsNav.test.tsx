import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { SettingsNav } from "./SettingsNav";
import { useSettingsStore } from "@/store/settings-store";
import { SETTING_GROUPS } from "@/store/settings-registry";

describe("SettingsNav", () => {
  beforeEach(() => useSettingsStore.setState(useSettingsStore.getInitialState()));

  it("lists every group the registry declares", () => {
    render(<SettingsNav />);
    for (const group of SETTING_GROUPS) {
      expect(screen.getByRole("button", { name: group })).toBeInTheDocument();
    }
  });

  it("selects a group", () => {
    render(<SettingsNav />);
    fireEvent.click(screen.getByRole("button", { name: "Wake Word" }));
    expect(useSettingsStore.getState().activeGroup).toBe("Wake Word");
  });

  it("clicking the active group clears the filter", () => {
    useSettingsStore.setState({ activeGroup: "Wake Word" });
    render(<SettingsNav />);
    fireEvent.click(screen.getByRole("button", { name: "Wake Word" }));
    expect(useSettingsStore.getState().activeGroup).toBeNull();
  });
});
