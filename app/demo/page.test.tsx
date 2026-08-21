import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import DemoDashboardPage from "./page";
import { useDemoStore } from "@/store/demo-engine";

describe("Dashboard page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDemoStore.setState(useDemoStore.getInitialState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the hero headline and StatBar immediately, every card after its skeleton delay", () => {
    render(<DemoDashboardPage />);
    expect(screen.getByText(/she's awake/i)).toBeInTheDocument();
    expect(screen.getByText(/tasks today/i)).toBeInTheDocument();
    expect(screen.getByText(/zero-vision/i)).toBeInTheDocument();
    expect(screen.getByText(/spend today/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByText(/Play Bohemian Rhapsody on Spotify/)).toBeInTheDocument();
    expect(screen.getByText(/active model/i)).toBeInTheDocument();
    expect(screen.getByText(/recent commands/i)).toBeInTheDocument();
    expect(screen.getByText(/what she learned today/i)).toBeInTheDocument();
    expect(screen.getByText(/warmth/i)).toBeInTheDocument();
  });

  it("does not render the cost card, matching the live dashboard", () => {
    render(<DemoDashboardPage />);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Asserted, not merely deleted from the list above: dropping the old
    // assertion would leave the card free to come back unnoticed, and it is
    // absent on purpose in both trees (app/app/page.tsx says why).
    expect(screen.queryByText(/cost — with vs without routing/i)).not.toBeInTheDocument();
  });
});
