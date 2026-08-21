import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MessageSquare } from "lucide-react";
import { ComingSoon } from "./coming-soon";

describe("ComingSoon", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders the page title and spec number after the skeleton delay", () => {
    render(<ComingSoon title="Chat" specNumber={2} icon={<MessageSquare />} />);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText(/spec 2/i)).toBeInTheDocument();
  });
});
