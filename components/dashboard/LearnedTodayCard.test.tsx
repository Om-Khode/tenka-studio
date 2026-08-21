import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { LearnedTodayCard } from "./LearnedTodayCard";
import { useDemoStore } from "@/store/demo-engine";

describe("LearnedTodayCard", () => {
  beforeEach(() => {
    useDemoStore.setState(useDemoStore.getInitialState());
  });

  it("shows an empty state when no facts have been learned yet", () => {
    render(<LearnedTodayCard />);
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
  });

  it("lists learned facts from the store", () => {
    useDemoStore.setState({
      learnedFacts: [{ id: "f1", text: "you ship on Fridays.", createdAt: Date.now() }],
    });
    render(<LearnedTodayCard />);
    expect(screen.getByText("you ship on Fridays.")).toBeInTheDocument();
  });
});
