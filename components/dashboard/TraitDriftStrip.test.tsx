import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TraitDriftStrip } from "./TraitDriftStrip";

describe("TraitDriftStrip", () => {
  it("renders all 6 real trait names", () => {
    render(<TraitDriftStrip />);
    ["warmth", "curiosity", "directness", "playfulness", "discipline", "patience"].forEach(
      (name) => expect(screen.getByText(new RegExp(name, "i"))).toBeInTheDocument()
    );
  });
});
