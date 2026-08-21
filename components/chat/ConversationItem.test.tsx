import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { ConversationItem } from "./ConversationItem";
import { useChatStore } from "@/store/chat-store";
import type { Conversation } from "@/types/chat";

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    title: "Routing questions",
    messages: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("ConversationItem", () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState(useChatStore.getInitialState());
  });

  it("renders the conversation title", () => {
    render(<ConversationItem conversation={makeConversation()} isActive={false} />);
    expect(screen.getByText("Routing questions")).toBeInTheDocument();
  });

  it("activates the conversation when clicked", () => {
    render(<ConversationItem conversation={makeConversation()} isActive={false} />);
    fireEvent.click(screen.getByText("Routing questions"));
    expect(useChatStore.getState().activeConversationId).toBe("conv-1");
  });

  it("marks the active item with aria-current", () => {
    render(<ConversationItem conversation={makeConversation()} isActive />);
    expect(screen.getByTestId("conversation-conv-1")).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("enters rename mode on double click and commits on Enter", () => {
    useChatStore.setState({ conversations: [makeConversation()] });
    render(<ConversationItem conversation={makeConversation()} isActive />);

    fireEvent.doubleClick(screen.getByText("Routing questions"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Cost math" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useChatStore.getState().conversations[0].title).toBe("Cost math");
  });

  it("cancels rename on Escape without changing the title", () => {
    useChatStore.setState({ conversations: [makeConversation()] });
    render(<ConversationItem conversation={makeConversation()} isActive />);

    fireEvent.doubleClick(screen.getByText("Routing questions"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(useChatStore.getState().conversations[0].title).toBe("Routing questions");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("resets the draft to the original title after a rejected (blank) rename", () => {
    useChatStore.setState({ conversations: [makeConversation()] });
    render(<ConversationItem conversation={makeConversation()} isActive />);

    fireEvent.doubleClick(screen.getByText("Routing questions"));
    let input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Store ignores blank/whitespace-only renames.
    expect(useChatStore.getState().conversations[0].title).toBe("Routing questions");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.doubleClick(screen.getByText("Routing questions"));
    input = screen.getByRole("textbox");
    expect(input).toHaveValue("Routing questions");
  });

  it("commits rename on blur", () => {
    useChatStore.setState({ conversations: [makeConversation()] });
    render(<ConversationItem conversation={makeConversation()} isActive />);

    fireEvent.doubleClick(screen.getByText("Routing questions"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Memory notes" } });
    fireEvent.blur(input);

    expect(useChatStore.getState().conversations[0].title).toBe("Memory notes");
  });

  it("asks for confirmation before deleting and does not delete on cancel", () => {
    useChatStore.setState({
      conversations: [makeConversation()],
      activeConversationId: "conv-1",
    });
    render(<ConversationItem conversation={makeConversation()} isActive />);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(screen.getByText(/delete this conversation/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(useChatStore.getState().conversations).toHaveLength(1);
  });

  it("deletes on confirm", () => {
    useChatStore.setState({
      conversations: [makeConversation()],
      activeConversationId: "conv-1",
    });
    render(<ConversationItem conversation={makeConversation()} isActive />);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /^confirm/i }));
    expect(useChatStore.getState().conversations).toEqual([]);
  });
});
