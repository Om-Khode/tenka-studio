import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Lock this PC?"
      body="She will lock the screen immediately."
      confirmLabel="lock it"
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe("ConfirmDialog", () => {
  it("renders nothing while closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the title and body when open", () => {
    setup();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Lock this PC?")).toBeInTheDocument();
    expect(screen.getByText("She will lock the screen immediately.")).toBeInTheDocument();
  });

  it("labels the confirm button from the prop, not a generic OK", () => {
    setup();
    expect(screen.getByRole("button", { name: "lock it" })).toBeInTheDocument();
  });

  it("calls onConfirm and closes when confirmed", () => {
    const { onConfirm, onOpenChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "lock it" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes without calling onConfirm when cancelled", () => {
    const { onConfirm, onOpenChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes without confirming on Escape", () => {
    const { onConfirm, onOpenChange } = setup();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("marks the confirm button as destructive when asked", () => {
    setup({ destructive: true, confirmLabel: "delete" });
    expect(screen.getByRole("button", { name: "delete" })).toHaveAttribute(
      "data-destructive",
      "true",
    );
  });
});
