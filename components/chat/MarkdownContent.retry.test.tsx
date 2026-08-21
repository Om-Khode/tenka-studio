import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

const { createHighlighterMock } = vi.hoisted(() => ({
  createHighlighterMock: vi.fn(),
}));

vi.mock("shiki", () => ({
  createHighlighter: createHighlighterMock,
}));

describe("MarkdownContent shiki load-failure retry", () => {
  beforeEach(() => {
    createHighlighterMock.mockReset();
  });

  it("retries the highlighter after a transient failure instead of caching the rejection forever", async () => {
    const md = ["```python", "def route(goal): pass", "```"].join("\n");

    createHighlighterMock.mockRejectedValueOnce(new Error("chunk load failed"));
    const { unmount } = render(<MarkdownContent content={md} />);
    await waitFor(() => expect(createHighlighterMock).toHaveBeenCalledTimes(1));
    // Failure path: falls back to plain mono, exactly like before this fix.
    expect(screen.getByTestId("code-block").innerHTML).not.toContain("data-hl");
    unmount();

    // A fresh mount after the failure. If the rejected promise were still
    // cached (the bug), getHighlighter() would hand back that same
    // permanently-rejected promise and createHighlighter would never be
    // called again — the block would stay stuck in plain-mono forever even
    // though the "network" has recovered.
    createHighlighterMock.mockResolvedValueOnce({
      codeToHtml: (code: string) => `<pre data-hl="true">${code}</pre>`,
    });
    render(<MarkdownContent content={md} />);

    await waitFor(() => {
      expect(screen.getAllByTestId("code-block").at(-1)!.innerHTML).toContain("data-hl");
    });
    expect(createHighlighterMock).toHaveBeenCalledTimes(2);
  });
});
