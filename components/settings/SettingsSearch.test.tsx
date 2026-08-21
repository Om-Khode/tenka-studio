import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { SettingsSearch } from "./SettingsSearch";
import { useSettingsStore } from "@/store/settings-store";

describe("SettingsSearch", () => {
  beforeEach(() => useSettingsStore.setState(useSettingsStore.getInitialState()));

  it("writes the query into the store", () => {
    render(<SettingsSearch />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "wake" } });
    expect(useSettingsStore.getState().query).toBe("wake");
  });

  it("drops the group filter while searching, so results are not hidden by it", () => {
    useSettingsStore.setState({ activeGroup: "Messaging" });
    render(<SettingsSearch />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "wake" } });
    expect(useSettingsStore.getState().activeGroup).toBeNull();
  });
});
