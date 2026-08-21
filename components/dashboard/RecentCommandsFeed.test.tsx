import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { RecentCommandsFeed } from "./RecentCommandsFeed";
import { useDemoStore } from "@/store/demo-engine";

describe("RecentCommandsFeed", () => {
  beforeEach(() => {
    useDemoStore.setState(useDemoStore.getInitialState());
  });

  it("shows an empty state when no tasks have completed", () => {
    render(<RecentCommandsFeed />);
    expect(screen.getByText(/no commands yet/i)).toBeInTheDocument();
  });

  it("lists completed tasks most-recent-first with their stack tag", () => {
    useDemoStore.getState().advanceStep(); // s1 done
    useDemoStore.getState().advanceStep(); // s2 fails
    useDemoStore.getState().advanceStep(); // s3 done
    useDemoStore.getState().advanceStep(); // s4 done → task completes
    render(<RecentCommandsFeed />);
    expect(screen.getByText(/Play Bohemian Rhapsody on Spotify/)).toBeInTheDocument();
  });
});
