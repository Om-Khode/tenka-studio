import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import MemoryPage from "./page";
import { useMemoryStore } from "@/store/memory-store";
import { seedMemory } from "@/store/memory-scripts";

// jsdom virtualizer geometry stub -- same as components/memory/EntityList.test.tsx
// and components/files/FileList.test.tsx. Without it, the virtualizer sees a
// zero-sized viewport and renders no rows at all.
const VIEWPORT_HEIGHT = 400;
let rectSpy: ReturnType<typeof vi.spyOn>;
let offsetHeightSpy: ReturnType<typeof vi.spyOn>;
let offsetWidthSpy: ReturnType<typeof vi.spyOn>;

function ready() {
  useMemoryStore.setState({
    ...useMemoryStore.getInitialState(),
    ...seedMemory(),
    status: "ready",
  });
}

function confirmForget() {
  fireEvent.click(screen.getByRole("button", { name: /forget this/i }));
  fireEvent.click(screen.getByRole("button", { name: /forget it/i }));
}

/**
 * These drive all three memory scopes end to end -- switch scope, select a
 * row, confirm the detail pane shows that row, forget it, and assert the
 * selection and the list land where they should. Task 2's fix (forgetPreference
 * and forgetProcedure clearing selectedId) has no other end-to-end coverage:
 * every other test either exercises the store directly or only ever touches
 * the knowledge scope.
 */
describe("Memory page", () => {
  beforeEach(() => {
    ready();
    rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 600, height: VIEWPORT_HEIGHT, top: 0, left: 0, bottom: VIEWPORT_HEIGHT, right: 600,
      x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    offsetHeightSpy = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(VIEWPORT_HEIGHT);
    offsetWidthSpy = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
  });

  afterEach(() => {
    rectSpy.mockRestore();
    offsetHeightSpy.mockRestore();
    offsetWidthSpy.mockRestore();
  });

  it("knowledge scope: selecting a row shows its detail, and forgetting it clears the pane and the row together", () => {
    render(<MemoryPage />);

    fireEvent.click(screen.getByText("Kirigaya Shirogane"));
    expect(screen.getByRole("heading", { name: "Kirigaya Shirogane" })).toBeInTheDocument();

    confirmForget();

    expect(screen.getByText(/pick something on the left/i)).toBeInTheDocument();
    expect(screen.queryByText("Kirigaya Shirogane")).not.toBeInTheDocument();
  });

  it("preferences scope: forgetting a non-last row clears the pane instead of silently re-pointing at the preference that slides into its slot", () => {
    render(<MemoryPage />);
    fireEvent.click(screen.getByRole("tab", { name: /preferences/i }));

    // Seeded order: music.player (0), coffee.roast (1), reply.length (2), ...
    // Selecting index 1 (not the last) is exactly the shape of Task 2's bug:
    // once coffee.roast is forgotten, index 1 would resolve to reply.length
    // instead of clearing, and the pane would silently show a DIFFERENT
    // preference with its own live "forget this" button.
    const options = screen.getAllByRole("option");
    fireEvent.click(options[1]);
    expect(screen.getByRole("heading", { name: "coffee.roast" })).toBeInTheDocument();

    confirmForget();

    expect(screen.getByText(/pick something on the left/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "reply.length" })).not.toBeInTheDocument();
  });

  it("procedures scope: forgetting the selected procedure clears the pane instead of leaving a live forget button on a procedure already gone from the list", () => {
    render(<MemoryPage />);
    fireEvent.click(screen.getByRole("tab", { name: /procedures/i }));

    fireEvent.click(screen.getByText("morning setup"));
    expect(screen.getByRole("heading", { name: "morning setup" })).toBeInTheDocument();

    confirmForget();

    expect(screen.getByText(/pick something on the left/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "morning setup" })).not.toBeInTheDocument();
    // Gone from the list too, not just the pane.
    expect(screen.queryByText("morning setup")).not.toBeInTheDocument();
  });
});
