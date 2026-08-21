import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders paragraphs and inline formatting", () => {
    render(<MarkdownContent content="Plain text with **bold** and `code`." />);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
  });

  it("renders a bullet list", () => {
    render(<MarkdownContent content={"- first\n- second"} />);
    expect(screen.getByText("first").closest("li")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders a GFM table (requires remark-gfm)", () => {
    const md = ["| path | cost |", "| --- | --- |", "| routed | $0.0041 |"].join("\n");
    render(<MarkdownContent content={md} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("routed")).toBeInTheDocument();
  });

  it("renders a fenced code block with its language recorded", () => {
    const md = ["```python", "def route(goal): pass", "```"].join("\n");
    render(<MarkdownContent content={md} />);
    const block = screen.getByTestId("code-block");
    expect(block).toBeInTheDocument();
    expect(block).toHaveAttribute("data-language", "python");
    expect(block.textContent).toContain("def route(goal): pass");
  });

  it("renders a fenced block with no language as plain code", () => {
    const md = ["```", "just text", "```"].join("\n");
    render(<MarkdownContent content={md} />);
    const block = screen.getByTestId("code-block");
    expect(block).toHaveAttribute("data-language", "text");
  });

  it("renders an empty string without crashing", () => {
    const { container } = render(<MarkdownContent content="" />);
    expect(container).toBeInTheDocument();
  });
});
