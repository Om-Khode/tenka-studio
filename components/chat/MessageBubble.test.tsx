import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MessageBubble } from "./MessageBubble";
import { useChatStore } from "@/store/chat-store";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import { liveRepoBundle } from "@/services/repos/http";
import type { Message } from "@/types/chat";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    role: "assistant",
    content: "Three stacks, and I never ask a model which one to use.",
    createdAt: 1,
    replyId: "reply-routing",
    variantIndex: 0,
    ...overrides,
  };
}

describe("MessageBubble", () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState(useChatStore.getInitialState());
    Object.assign(navigator, {
      clipboard: { writeText: () => Promise.resolve() },
    });
  });

  it("renders a user message with its raw text and no actions", () => {
    render(
      <MessageBubble
        message={makeMessage({ role: "user", content: "tell me about routing" })}
        isStreaming={false}
        isLastAssistant={false}
      />
    );
    expect(screen.getByText("tell me about routing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /regenerate/i })).not.toBeInTheDocument();
  });

  it("renders an assistant message as markdown with actions", () => {
    render(<MessageBubble message={makeMessage()} isStreaming={false} isLastAssistant />);
    expect(screen.getByText(/Three stacks/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
  });

  it("marks the streaming assistant message with a caret and hides its actions", () => {
    render(<MessageBubble message={makeMessage()} isStreaming isLastAssistant />);
    expect(screen.getByTestId("stream-caret")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument();
  });

  it("labels each message with its role for assistive tech", () => {
    render(
      <MessageBubble
        message={makeMessage({ role: "user" })}
        isStreaming={false}
        isLastAssistant={false}
      />
    );
    expect(screen.getByTestId("message-m1")).toHaveAttribute("data-role", "user");
  });

  it("disables regenerate but keeps copy enabled for a non-last assistant message", () => {
    render(
      <MessageBubble message={makeMessage()} isStreaming={false} isLastAssistant={false} />
    );
    expect(screen.getByRole("button", { name: /copy/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeDisabled();
  });

  describe("in live mode", () => {
    beforeEach(() => configureRepos("live", liveRepoBundle));
    afterEach(() => configureRepos("demo", demoRepoBundle));

    it("disables regenerate even on the last assistant message -- the store refuses it there, so an enabled button would do nothing at all", () => {
      render(<MessageBubble message={makeMessage()} isStreaming={false} isLastAssistant />);
      expect(screen.getByRole("button", { name: /regenerate/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /copy/i })).toBeEnabled();
    });
  });
});
