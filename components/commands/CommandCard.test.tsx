import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CommandCard } from "./CommandCard";
import { COMMANDS } from "@/store/command-catalogue";

const chrome = COMMANDS.find((c) => c.id === "open-chrome")!;
const volumeUp = COMMANDS.find((c) => c.id === "volume-up")!;

describe("CommandCard", () => {
  it("renders the command label", () => {
    render(<CommandCard command={chrome} onFire={vi.fn()} />);
    expect(screen.getByText("Open Chrome")).toBeInTheDocument();
  });

  it("fires on click", () => {
    const onFire = vi.fn();
    render(<CommandCard command={chrome} onFire={onFire} />);
    fireEvent.click(screen.getByRole("button", { name: /open chrome/i }));
    expect(onFire).toHaveBeenCalledOnce();
  });

  it("is idle by default", () => {
    render(<CommandCard command={chrome} onFire={vi.fn()} />);
    expect(screen.getByTestId("command-card")).toHaveAttribute("data-state", "idle");
  });

  it("shows the step list and marks itself running while it holds the slot", () => {
    render(
      <CommandCard command={chrome} onFire={vi.fn()} running currentStepIndex={1} />,
    );
    expect(screen.getByTestId("command-card")).toHaveAttribute("data-state", "running");
    expect(screen.getByText("chrome running under another profile")).toBeInTheDocument();
  });

  it("does not fire again while running", () => {
    const onFire = vi.fn();
    render(<CommandCard command={chrome} onFire={onFire} running currentStepIndex={0} />);
    fireEvent.click(screen.getByRole("button", { name: /open chrome/i }));
    expect(onFire).not.toHaveBeenCalled();
  });

  it("is disabled, and says why, while another command holds the slot", () => {
    const onFire = vi.fn();
    render(<CommandCard command={chrome} onFire={onFire} disabled />);
    const button = screen.getByRole("button", { name: /open chrome/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onFire).not.toHaveBeenCalled();
    expect(screen.getByTestId("command-card")).toHaveAttribute("data-state", "disabled");
  });

  it("never disables an instant command, even while the slot is taken", () => {
    const onFire = vi.fn();
    render(<CommandCard command={volumeUp} onFire={onFire} disabled />);
    const button = screen.getByRole("button", { name: /volume up/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onFire).toHaveBeenCalledOnce();
  });

  it("shows no step list for an instant command", () => {
    render(<CommandCard command={volumeUp} onFire={vi.fn()} />);
    expect(screen.queryByTestId("command-progress")).not.toBeInTheDocument();
  });

  it("marks the guarded command so the grid can flag it", () => {
    const lock = COMMANDS.find((c) => c.id === "lock-pc")!;
    render(<CommandCard command={lock} onFire={vi.fn()} />);
    expect(screen.getByTestId("command-card")).toHaveAttribute("data-kind", "guarded");
  });
});
