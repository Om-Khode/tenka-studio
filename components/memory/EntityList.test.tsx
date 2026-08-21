import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EntityList } from "./EntityList";
import { useMemoryStore } from "@/store/memory-store";
import { seedMemory } from "@/store/memory-scripts";

function ready() {
  useMemoryStore.setState({
    ...useMemoryStore.getInitialState(),
    ...seedMemory(),
    status: "ready",
  });
}

// jsdom gives every element a zero-sized box, so the virtualizer would compute
// an empty visible range and render no rows at all. Give it a real viewport,
// same as components/files/FileList.test.tsx does for the same virtualizer.
const VIEWPORT_HEIGHT = 400;
let rectSpy: ReturnType<typeof vi.spyOn>;
let offsetHeightSpy: ReturnType<typeof vi.spyOn>;
let offsetWidthSpy: ReturnType<typeof vi.spyOn>;

describe("EntityList", () => {
  beforeEach(() => {
    useMemoryStore.setState(useMemoryStore.getInitialState());
    rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        width: 600,
        height: VIEWPORT_HEIGHT,
        top: 0,
        left: 0,
        bottom: VIEWPORT_HEIGHT,
        right: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    offsetHeightSpy = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(VIEWPORT_HEIGHT);
    offsetWidthSpy = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(600);
  });

  afterEach(() => {
    rectSpy.mockRestore();
    offsetHeightSpy.mockRestore();
    offsetWidthSpy.mockRestore();
  });

  it("shows a skeleton while loading", () => {
    useMemoryStore.setState({ status: "loading" });
    render(<EntityList />);
    expect(screen.getByLabelText("Loading memory")).toBeInTheDocument();
  });

  it("offers a retry when the load failed", () => {
    useMemoryStore.setState({ status: "error" });
    render(<EntityList />);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("renders rows once ready", () => {
    ready();
    render(<EntityList />);
    expect(screen.getByText("Kirigaya Shirogane")).toBeInTheDocument();
  });

  // Mirrors components/files/FileList.test.tsx's "virtualizes: an 800-entry
  // folder..." test. The seed's filler entities (60 of the 69 seeded) exist
  // for exactly this: without it, a component that abandoned virtualization
  // (rendering every row into the DOM) would still pass every test above.
  it("virtualizes: renders a small fraction of the seeded rows, not all of them", () => {
    ready();
    render(<EntityList />);
    const total = useMemoryStore.getState().entities.length;
    const rendered = screen.getAllByRole("option").length;
    expect(total).toBeGreaterThan(60);
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(total);
  });

  it("explains an empty search differently from an empty store", () => {
    ready();
    useMemoryStore.setState({ query: "zzzznothing" });
    const { rerender } = render(<EntityList />);
    expect(screen.getByText(/no match/i)).toBeInTheDocument();

    useMemoryStore.getState().forgetAll();
    useMemoryStore.setState({ query: "" });
    rerender(<EntityList />);
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
  });
});
