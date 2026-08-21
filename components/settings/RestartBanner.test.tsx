import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { RestartBanner } from "./RestartBanner";
import { useSettingsStore } from "@/store/settings-store";

describe("RestartBanner", () => {
  beforeEach(() => useSettingsStore.setState(useSettingsStore.getInitialState()));

  it("shows nothing when no restart is pending", () => {
    const { container } = render(<RestartBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the keys waiting on a restart", () => {
    useSettingsStore.setState({ pendingRestart: ["wake_word_enabled", "camera_enabled"] });
    render(<RestartBanner />);
    expect(screen.getByText(/wake_word_enabled/)).toBeInTheDocument();
    expect(screen.getByText(/camera_enabled/)).toBeInTheDocument();
  });

  it("dismisses", () => {
    useSettingsStore.setState({ pendingRestart: ["wake_word_enabled"] });
    render(<RestartBanner />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(useSettingsStore.getState().pendingRestart).toEqual([]);
  });
});
