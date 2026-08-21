import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageActions } from "./MessageActions";

describe("MessageActions", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("copies the message content to the clipboard", async () => {
    render(<MessageActions content="hello there" onRegenerate={() => {}} canRegenerate />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello there");
  });

  it("shows a copied confirmation after a successful copy", async () => {
    render(<MessageActions content="hello" onRegenerate={() => {}} canRegenerate />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("reports a failure when the clipboard rejects", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<MessageActions content="hello" onRegenerate={() => {}} canRegenerate />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(await screen.findByText(/couldn't copy/i)).toBeInTheDocument();
  });

  it("calls onRegenerate when regenerate is clicked", () => {
    const onRegenerate = vi.fn();
    render(<MessageActions content="x" onRegenerate={onRegenerate} canRegenerate />);
    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("disables regenerate when canRegenerate is false", () => {
    render(
      <MessageActions content="x" onRegenerate={() => {}} canRegenerate={false} />
    );
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeDisabled();
  });
});
