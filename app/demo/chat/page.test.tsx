import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import ChatPage from "./page";
import { useChatStore } from "@/store/chat-store";

describe("Chat page", () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState(useChatStore.getInitialState());
    useChatStore.setState({ hasHydrated: true });
    Object.assign(navigator, { clipboard: { writeText: () => Promise.resolve() } });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders the three-column shell: list, thread, composer", () => {
    render(<ChatPage />);
    expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /message/i })).toBeInTheDocument();
  });

  it("sending from the composer puts both messages in the thread", () => {
    render(<ChatPage />);
    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "tell me about routing" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    const messages = screen.getAllByTestId(/^message-/);
    expect(messages).toHaveLength(2);
    // Scoped to the thread: the auto-created conversation's title is copied
    // verbatim from this same short message, so the sidebar also renders
    // this exact text — an unscoped getByText is ambiguous between the two.
    expect(within(messages[0]).getByText("tell me about routing")).toBeInTheDocument();
  });

  it("creating a conversation from the list shows the prompt hint", () => {
    render(<ChatPage />);
    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    expect(screen.getByText(/ask her about/i)).toBeInTheDocument();
  });
});

// The real rehydrate-flow test used to live here, rendering <ChatPage />
// directly. Store hydration moved to app/demo/layout.tsx (useChatHydration)
// so every /demo/* route hydrates, not just this page -- see
// hooks/useChatHydration.test.ts for the subscriber-notification coverage
// and app/demo/layout.test.tsx for the Sidebar-badge regression test.
