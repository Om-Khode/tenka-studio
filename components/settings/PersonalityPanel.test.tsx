import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PersonalityPanel } from "./PersonalityPanel";
import { usePersonalityStore } from "@/store/personality-store";
import { useToastStore } from "@/store/toast-store";
import type { PersonalityPayload } from "@/services/repos/types";

const WARM: PersonalityPayload = {
  base: "warm_honest",
  available: ["warm_honest", "tsundere", "minimal"],
  traits: { warmth: 72, curiosity: 60, directness: 65, playfulness: 45, discipline: 55, patience: 70 },
  sampleLine: "That will break on the second run — want me to fix it now, or note it and move on?",
};

const TSUNDERE: PersonalityPayload = {
  base: "tsundere",
  available: ["warm_honest", "tsundere", "minimal"],
  traits: { warmth: 35, curiosity: 55, directness: 85, playfulness: 70, discipline: 60, patience: 30 },
  sampleLine: "It is already broken. I fixed it. Do not make a thing of it.",
};

function ready(payload: PersonalityPayload) {
  usePersonalityStore.setState({ status: "ready", payload, saving: false });
}

describe("PersonalityPanel", () => {
  beforeEach(() => {
    usePersonalityStore.setState(usePersonalityStore.getInitialState());
    useToastStore.setState(useToastStore.getInitialState());
  });

  it("shows a skeleton before the repository resolves", () => {
    usePersonalityStore.setState({ status: "loading", payload: null });
    render(<PersonalityPanel />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("offers a retry when the load failed", () => {
    usePersonalityStore.setState({ status: "error", payload: null });
    render(<PersonalityPanel />);
    expect(screen.getByText(/could not reach her personality/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("loads on mount when idle", async () => {
    const load = vi.fn(async () => ready(WARM));
    usePersonalityStore.setState({ load });
    render(<PersonalityPanel />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });

  it("renders whatever traits the repository returns, by key, not a hardcoded set", () => {
    ready(WARM);
    render(<PersonalityPanel />);
    for (const trait of ["warmth", "curiosity", "directness", "playfulness", "discipline", "patience"]) {
      expect(screen.getByText(trait)).toBeInTheDocument();
    }
  });

  it("shows the current base's traits and sample line", () => {
    ready(WARM);
    render(<PersonalityPanel />);
    expect(screen.getByTestId("trait-warmth")).toHaveAttribute("aria-valuenow", "72");
    expect(screen.getByTestId("personality-sample").textContent).toContain(WARM.sampleLine);
  });

  it("offers exactly the repository's available bases as options", () => {
    ready(WARM);
    render(<PersonalityPanel />);
    expect(screen.getByRole("combobox", { name: "personality base" })).toHaveTextContent("warm honest");
  });

  it("switches base immediately, no separate save step", async () => {
    const setBase = vi.fn(async (base: string) => {
      ready({ ...TSUNDERE, base });
    });
    ready(WARM);
    usePersonalityStore.setState({ setBase });
    render(<PersonalityPanel />);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "tsundere" }));

    expect(setBase).toHaveBeenCalledWith("tsundere");
    await waitFor(() => {
      expect(screen.getByTestId("trait-warmth")).toHaveAttribute("aria-valuenow", "35");
    });
    expect(screen.getByTestId("personality-sample").textContent).toContain(TSUNDERE.sampleLine);
  });

  it("toasts a failed switch instead of throwing into the void", async () => {
    const setBase = vi.fn(async () => {
      throw new Error("could not reach the daemon");
    });
    ready(WARM);
    usePersonalityStore.setState({ setBase });
    render(<PersonalityPanel />);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "tsundere" }));

    await waitFor(() => {
      expect(useToastStore.getState().toasts[0]?.title).toMatch(/could not switch personality/i);
    });
  });
});
