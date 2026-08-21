import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import { useMemoryStore } from "@/store/memory-store";
import { seedMemory } from "@/store/memory-scripts";

// Only the first test needs this: it reproduces the Critical fix (memory
// hydration + load() moved from the Memory page to app/demo/layout.tsx) by
// rendering the real layout on a route that is not /demo/memory.
vi.mock("next/navigation", () => ({ usePathname: () => "/demo/settings" }));

import DemoLayout from "@/app/demo/layout";

describe("Sidebar memory badge", () => {
  beforeEach(() => useMemoryStore.setState(useMemoryStore.getInitialState()));

  it("shows the count once the layout hydrates and loads memory, even from a non-Memory route", async () => {
    // Before the fix, only app/demo/memory/page.tsx's mount effect called
    // load() -- so the badge stayed blank on every other route no matter how
    // long the user waited. Rendering DemoLayout on /demo/settings here is
    // exactly that "never visited /demo/memory" case.
    render(
      <DemoLayout>
        <div>settings page content</div>
      </DemoLayout>,
    );

    // getAllByRole: the layout renders two navs now (the sidebar at `lg` and
    // up, components/shell/BottomNav.tsx below it), and both read this badge
    // from the same hook. Asserting on all of them is what keeps the fix from
    // half-regressing -- see app/demo/nav.test.tsx.
    await waitFor(
      () => {
        const links = screen.getAllByRole("link", { name: /memory/i });
        expect(links).toHaveLength(2);
        for (const link of links) {
          expect(link.textContent).not.toBe("Memory");
        }
      },
      { timeout: 2000 },
    );
  });

  it("counts what she currently knows", () => {
    const seed = seedMemory();
    useMemoryStore.setState({ ...seed, status: "ready" });
    render(<Sidebar activePath="/demo" basePath="/demo" mode="demo" />);
    const link = screen.getByRole("link", { name: /memory/i });
    expect(link.textContent).toContain(String(seed.entities.length));
  });

  it("drops as she forgets", () => {
    const seed = seedMemory();
    useMemoryStore.setState({ ...seed, status: "ready" });
    useMemoryStore.getState().forgetAll();
    render(<Sidebar activePath="/demo" basePath="/demo" mode="demo" />);
    expect(screen.getByRole("link", { name: /memory/i }).textContent).toBe("Memory");
  });
});
