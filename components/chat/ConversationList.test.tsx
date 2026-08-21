import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConversationList } from "./ConversationList";
import { useChatStore } from "@/store/chat-store";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import { liveRepoBundle } from "@/services/repos/http";

describe("ConversationList", () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState(useChatStore.getInitialState());
    useChatStore.setState({ hasHydrated: true });
  });

  it("shows a skeleton until the store has hydrated", () => {
    useChatStore.setState({ hasHydrated: false });
    render(<ConversationList />);
    expect(screen.getByTestId("conversation-list-skeleton")).toBeInTheDocument();
  });

  it("creates a conversation when the new-chat button is clicked", () => {
    render(<ConversationList />);
    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    expect(useChatStore.getState().conversations).toHaveLength(1);
  });

  it("shows an empty state when there are no conversations", () => {
    render(<ConversationList />);
    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
  });

  it("lists existing conversations", () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().renameConversation(id, "Routing questions");
    render(<ConversationList />);
    expect(screen.getByText("Routing questions")).toBeInTheDocument();
  });

  it("filters conversations by title", () => {
    const a = useChatStore.getState().createConversation();
    useChatStore.getState().renameConversation(a, "Routing questions");
    const b = useChatStore.getState().createConversation();
    useChatStore.getState().renameConversation(b, "Cost math");

    render(<ConversationList />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "cost" } });

    expect(screen.getByText("Cost math")).toBeInTheDocument();
    expect(screen.queryByText("Routing questions")).not.toBeInTheDocument();
  });

  it("filters conversations by message content, not just title", () => {
    // The first message becomes the conversation's title, so the search
    // term must appear only in a LATER message — never in the title —
    // or a match here could be coming from the title check alone.
    useChatStore.getState().sendMessage("first question");
    useChatStore.getState().finishStreaming();
    useChatStore.getState().sendMessage("what about memory");
    useChatStore.getState().finishStreaming();

    const other = useChatStore.getState().createConversation();
    useChatStore.getState().renameConversation(other, "Unrelated");

    render(<ConversationList />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "memory" } });

    // ConversationItem renders only the title, never message content, so
    // assert on the title of the conversation whose match came from its
    // second message's content.
    expect(screen.getByText("first question")).toBeInTheDocument();
    expect(screen.queryByText("Unrelated")).not.toBeInTheDocument();
  });

  it("shows a no-matches state when the search excludes everything", () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().renameConversation(id, "Routing questions");
    render(<ConversationList />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz" } });
    expect(screen.getByText(/no conversations match/i)).toBeInTheDocument();
  });

  it("search is case-insensitive", () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().renameConversation(id, "Routing questions");
    render(<ConversationList />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ROUTING" } });
    expect(screen.getByText("Routing questions")).toBeInTheDocument();
  });

  describe("in live mode", () => {
    beforeEach(() => configureRepos("live", liveRepoBundle));
    afterEach(() => configureRepos("demo", demoRepoBundle));

    it("hides new chat entirely -- a second live pane is one the daemon could never be told about", () => {
      render(<ConversationList />);
      expect(screen.queryByRole("button", { name: /new chat/i })).not.toBeInTheDocument();
      // Everything else the sidebar does still works.
      expect(screen.getByRole("searchbox")).toBeInTheDocument();
    });
  });
});
