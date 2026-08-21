import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, afterEach } from "vitest";
import { SessionCapabilities } from "./SessionCapabilities";
import { useAuthStore } from "@/store/auth-store";
import type { Capability } from "@/types/session";

function authorize(
  granted: Capability[],
  effective: Capability[],
  policy: string,
  raised: Capability[] = [],
  raiseExpiresInSeconds: number | null = null,
) {
  const usable = new Set<string>(effective);
  useAuthStore.setState({
    phase: "authorized",
    refusal: null,
    session: {
      deviceId: "phone-1",
      label: "Pixel 8",
      granted,
      effective,
      policy,
      raised,
      raiseExpiresInSeconds,
      canUse: (c: string) => usable.has(c),
    },
  });
}

describe("SessionCapabilities", () => {
  afterEach(() => useAuthStore.setState(useAuthStore.getInitialState(), true));

  it("renders nothing before a session exists", () => {
    const { container } = render(<SessionCapabilities />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Milestone 6b fix round 3, live-test item 5. jsdom does not lay out text
   * or compute font metrics, so this cannot assert the rendered pixel size
   * the way a screenshot comparison would -- this is a class-pin, standing
   * in for "matches the neighbouring controls' scale" by asserting the same
   * `text-[11px]` Topbar's own reconnect control (and this button, before it
   * moved) uses, and that no responsive variant silently drops it on one
   * viewport.
   */
  it("renders at the same font scale as the other controls beside it, on every viewport", () => {
    authorize(["observe"], ["observe"], "local");
    render(<SessionCapabilities />);
    const button = screen.getByRole("button", { name: /capabilities/i });
    expect(button.className).toMatch(/(?:^|\s)text-\[11px\](?:\s|$)/);
    expect(button.className).not.toMatch(/\b(?:sm|md|lg|xl):text-/);
  });

  it("opens a dialog naming every capability's status", async () => {
    authorize(["observe", "execute"], ["observe", "execute"], "tailnet", ["execute"], 1800);
    render(<SessionCapabilities />);
    await userEvent.click(screen.getByRole("button", { name: /capabilities/i }));

    expect(screen.getByText(/what this device may do/i)).toBeInTheDocument();
    // Seven rows, one per capability -- this build must never silently drop one.
    for (const label of ["Observe", "Recall", "Chat send", "Screen", "Files", "System control", "Execute"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("distinguishes granted, refused and raised on the SAME device -- the whole point of the three states", async () => {
    // observe: granted outright. files: refused (never issued). execute: raised.
    authorize(
      ["observe", "execute"],
      ["observe", "execute"],
      "tailnet",
      ["execute"],
      600,
    );
    render(<SessionCapabilities />);
    await userEvent.click(screen.getByRole("button", { name: /capabilities/i }));

    const observeRow = screen.getByText("Observe").closest("li")!;
    expect(observeRow).toHaveTextContent("granted");
    expect(observeRow).not.toHaveTextContent("raised it at the keyboard");

    const filesRow = screen.getByText("Files").closest("li")!;
    expect(filesRow).toHaveTextContent("refused");
    expect(filesRow).toHaveTextContent(/wasn't given access to her files/i);

    const executeRow = screen.getByText("Execute").closest("li")!;
    expect(executeRow).toHaveTextContent("raised");
    expect(executeRow).toHaveTextContent(/raised it at the keyboard/i);
    expect(executeRow).toHaveTextContent(/10 minutes/i);
  });

  it("shows a raise this device holds even off the loopback listener, where RaiseBanner cannot see it", async () => {
    // policy "tailnet", no system_control -- the admin gate RaiseBanner sits
    // behind would refuse this session outright. This component must not.
    authorize(["execute"], ["execute"], "tailnet", ["execute"], 60);
    render(<SessionCapabilities />);
    await userEvent.click(screen.getByRole("button", { name: /capabilities/i }));

    expect(screen.getByText("Execute").closest("li")).toHaveTextContent("raised");
  });
});
