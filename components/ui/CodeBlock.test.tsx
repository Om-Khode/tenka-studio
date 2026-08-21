import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const codeToHtml = vi.fn(() => "<pre class='shiki'><code>highlighted</code></pre>");
const createHighlighter = vi.fn<(...args: unknown[]) => Promise<{ codeToHtml: typeof codeToHtml }>>(
  async () => ({ codeToHtml }),
);

vi.mock("shiki", () => ({ createHighlighter: (...args: unknown[]) => createHighlighter(...args) }));

import { CodeBlock } from "./CodeBlock";
import { resetHighlighterForTests } from "@/lib/shiki";

describe("CodeBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHighlighterForTests();
  });

  it("renders the raw source as a plain-mono fallback before the highlighter resolves", () => {
    render(<CodeBlock language="python" code="print('hi')" />);
    expect(screen.getByText("print('hi')")).toBeInTheDocument();
  });

  it("swaps in highlighted markup once the highlighter resolves", async () => {
    render(<CodeBlock language="python" code="print('hi')" />);
    await waitFor(() => {
      expect(screen.getByText("highlighted")).toBeInTheDocument();
    });
  });

  it("tags the block with its language for styling and tests", () => {
    render(<CodeBlock language="sql" code="SELECT 1" />);
    expect(screen.getByTestId("code-block")).toHaveAttribute("data-language", "sql");
  });

  it("falls back to plain mono when the highlighter rejects", async () => {
    createHighlighter.mockRejectedValueOnce(new Error("chunk load failed"));
    render(<CodeBlock language="python" code="print('hi')" />);
    await waitFor(() => {
      expect(screen.getByText("print('hi')")).toBeInTheDocument();
    });
    expect(screen.queryByText("highlighted")).not.toBeInTheDocument();
  });

  it("retries after a rejection instead of replaying it forever", async () => {
    createHighlighter.mockRejectedValueOnce(new Error("chunk load failed"));
    const { unmount } = render(<CodeBlock language="python" code="a" />);
    await waitFor(() => expect(createHighlighter).toHaveBeenCalledTimes(1));
    unmount();

    render(<CodeBlock language="python" code="b" />);
    await waitFor(() => {
      expect(screen.getByText("highlighted")).toBeInTheDocument();
    });
    expect(createHighlighter).toHaveBeenCalledTimes(2);
  });
});
