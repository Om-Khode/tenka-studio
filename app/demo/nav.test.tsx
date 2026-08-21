import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/demo/chat",
}));

import DemoLayout from "./layout";

describe("Demo AppShell routing", () => {
  /**
   * getAllByRole, not getByRole: the shell renders TWO navs now -- the sidebar
   * at `lg` and up, the bottom bar below it -- and exactly one of them is
   * visible at any width. Asserting on whichever one the query happened to
   * return first would leave the other free to drift, which is the failure
   * this shape exists to catch: a route marked active in the sidebar and not
   * in the bottom bar is a phone with no "you are here".
   */
  it("marks the Chat nav link active in every nav when on /demo/chat", () => {
    render(
      <DemoLayout>
        <div>page content</div>
      </DemoLayout>
    );
    const chatLinks = screen.getAllByRole("link", { name: /chat/i });
    expect(chatLinks).toHaveLength(2);
    for (const link of chatLinks) {
      expect(link).toHaveAttribute("aria-current", "page");
    }
    expect(screen.getByText("STUDIO / CHAT")).toBeInTheDocument();
  });
});
