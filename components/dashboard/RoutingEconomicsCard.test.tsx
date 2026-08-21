import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { RoutingEconomicsCard } from "./RoutingEconomicsCard";
import { useDemoStore } from "@/store/demo-engine";

describe("RoutingEconomicsCard", () => {
  beforeEach(() => {
    useDemoStore.setState(useDemoStore.getInitialState());
  });

  it("shows with-routing spend from the store and a vision-only comparison", () => {
    render(<RoutingEconomicsCard />);
    expect(screen.getByText(/\$0\.0000/)).toBeInTheDocument(); // spendTodayUsd starts at 0
    expect(screen.getByText(/vision on everything/i)).toBeInTheDocument();
  });

  it("vision-only estimate is always higher than with-routing spend", () => {
    useDemoStore.setState({ spendTodayUsd: 0.0041, tasksCompletedToday: 1 });
    render(<RoutingEconomicsCard />);
    const withRouting = screen.getByTestId("cost-with-routing").textContent;
    const visionOnly = screen.getByTestId("cost-vision-only").textContent;
    expect(parseFloat(visionOnly!.replace(/[^0-9.]/g, ""))).toBeGreaterThan(
      parseFloat(withRouting!.replace(/[^0-9.]/g, ""))
    );
  });
});
