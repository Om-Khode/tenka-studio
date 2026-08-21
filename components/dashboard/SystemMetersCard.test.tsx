import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { SystemMetersCard } from "./SystemMetersCard";
import { useDemoStore } from "@/store/demo-engine";

describe("SystemMetersCard", () => {
  beforeEach(() => {
    useDemoStore.setState(useDemoStore.getInitialState());
  });

  it("renders CPU, RAM, and battery readouts from the store", () => {
    render(<SystemMetersCard />);
    expect(screen.getByText(/34/)).toBeInTheDocument();
    expect(screen.getByText(/6\.2/)).toBeInTheDocument();
    expect(screen.getByText(/82/)).toBeInTheDocument();
  });
});
