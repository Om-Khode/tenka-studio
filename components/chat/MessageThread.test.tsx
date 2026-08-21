import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MessageThread } from "./MessageThread";
import { useChatStore } from "@/store/chat-store";

describe("MessageThread", () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState(useChatStore.getInitialState());
    Object.assign(navigator, { clipboard: { writeText: () => Promise.resolve() } });
    // jsdom does not implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("shows a prompt hint when the conversation has no messages", () => {
    useChatStore.getState().createConversation();
    render(<MessageThread />);
    expect(screen.getByText(/ask her about/i)).toBeInTheDocument();
  });

  it("shows a start-a-conversation empty state when nothing is active", () => {
    render(<MessageThread />);
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });

  it("renders every message in the active conversation, in order", () => {
    useChatStore.getState().sendMessage("tell me about routing");
    render(<MessageThread />);
    const messages = screen.getAllByTestId(/^message-/);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveAttribute("data-role", "user");
    expect(messages[1]).toHaveAttribute("data-role", "assistant");
  });

  it("scrolls to the newest message when content arrives", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("re-scrolls when streamed content grows without a new message", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    const scrollMock = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const callsBeforeChunk = scrollMock.mock.calls.length;
    const { streamingMessageId, conversations, activeConversationId } =
      useChatStore.getState();
    const messagesBefore = conversations.find(
      (c) => c.id === activeConversationId,
    )?.messages.length;

    act(() => {
      useChatStore.getState().appendStreamChunk(streamingMessageId!, "some text");
    });

    const messagesAfter = useChatStore
      .getState()
      .conversations.find((c) => c.id === activeConversationId)?.messages
      .length;
    // The chunk mutates content in place — message count is unchanged.
    expect(messagesAfter).toBe(messagesBefore);
    // But the effect must still re-fire because lastContent changed.
    expect(scrollMock.mock.calls.length).toBeGreaterThan(callsBeforeChunk);
  });

  // jsdom reports 0 for every layout box, so a scroller has to be faked.
  const CLIENT_HEIGHT = 300;

  function setGeometry(
    el: HTMLElement,
    distanceFromBottom: number,
    scrollHeight = 1000,
  ) {
    Object.defineProperty(el, "clientHeight", {
      value: CLIENT_HEIGHT,
      configurable: true,
    });
    Object.defineProperty(el, "scrollHeight", {
      value: scrollHeight,
      configurable: true,
    });
    Object.defineProperty(el, "scrollTop", {
      value: scrollHeight - CLIENT_HEIGHT - distanceFromBottom,
      configurable: true,
      writable: true,
    });
  }

  function fakeScroll(el: HTMLElement, distanceFromBottom: number) {
    setGeometry(el, distanceFromBottom);
    fireEvent.scroll(el);
  }

  function streamChunk(text = "more") {
    act(() => {
      useChatStore
        .getState()
        .appendStreamChunk(useChatStore.getState().streamingMessageId!, text);
    });
  }

  it("stops auto-scrolling once the user scrolls away from the bottom", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    fakeScroll(screen.getByTestId("thread-scroller"), 600);

    const scrollMock = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const callsBeforeChunk = scrollMock.mock.calls.length;

    act(() => {
      useChatStore
        .getState()
        .appendStreamChunk(useChatStore.getState().streamingMessageId!, "more");
    });

    expect(scrollMock.mock.calls.length).toBe(callsBeforeChunk);
  });

  it("resumes auto-scrolling when the user scrolls back to the bottom", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    const scroller = screen.getByTestId("thread-scroller");
    fakeScroll(scroller, 600);
    fakeScroll(scroller, 0);

    const scrollMock = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const callsBeforeChunk = scrollMock.mock.calls.length;

    act(() => {
      useChatStore
        .getState()
        .appendStreamChunk(useChatStore.getState().streamingMessageId!, "more");
    });

    expect(scrollMock.mock.calls.length).toBeGreaterThan(callsBeforeChunk);
  });

  it("re-pins to the bottom when a new message arrives", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    fakeScroll(screen.getByTestId("thread-scroller"), 600);

    const scrollMock = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const callsBeforeSend = scrollMock.mock.calls.length;

    act(() => {
      useChatStore.getState().finishStreaming();
      useChatStore.getState().sendMessage("cost");
    });

    expect(scrollMock.mock.calls.length).toBeGreaterThan(callsBeforeSend);
  });

  it("hides the jump-to-bottom button while the thread is at the bottom", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    fakeScroll(screen.getByTestId("thread-scroller"), 0);

    expect(screen.queryByTestId("jump-to-bottom")).not.toBeInTheDocument();
  });

  it("keeps the jump-to-bottom button hidden for a small scroll up", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    // Past PIN_SLACK_PX, so auto-follow stops — but nowhere near far enough
    // up to be worth an affordance.
    fakeScroll(screen.getByTestId("thread-scroller"), 100);

    expect(screen.queryByTestId("jump-to-bottom")).not.toBeInTheDocument();
  });

  it("shows the jump-to-bottom button once the reader is far from the bottom", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    fakeScroll(screen.getByTestId("thread-scroller"), 600);

    expect(screen.getByTestId("jump-to-bottom")).toBeInTheDocument();
  });

  it("shows the button when streamed content pushes the bottom out of reach", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    const scroller = screen.getByTestId("thread-scroller");
    fakeScroll(scroller, 100);
    expect(screen.queryByTestId("jump-to-bottom")).not.toBeInTheDocument();

    // No scroll event here — the thread grew underneath a stationary reader.
    setGeometry(scroller, 700, 1600);
    streamChunk();

    expect(screen.getByTestId("jump-to-bottom")).toBeInTheDocument();
  });

  it("scrolls back to the bottom and hides the button when it is clicked", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    fakeScroll(screen.getByTestId("thread-scroller"), 600);

    const scrollMock = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const callsBeforeClick = scrollMock.mock.calls.length;

    fireEvent.click(screen.getByTestId("jump-to-bottom"));

    expect(scrollMock.mock.calls.length).toBeGreaterThan(callsBeforeClick);
    expect(screen.queryByTestId("jump-to-bottom")).not.toBeInTheDocument();
  });

  it("resumes following the stream after the button is clicked", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    fakeScroll(screen.getByTestId("thread-scroller"), 600);
    fireEvent.click(screen.getByTestId("jump-to-bottom"));

    const scrollMock = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const callsBeforeChunk = scrollMock.mock.calls.length;
    streamChunk();

    expect(scrollMock.mock.calls.length).toBeGreaterThan(callsBeforeChunk);
  });

  it("hides the button when a new message re-pins the thread", () => {
    useChatStore.getState().sendMessage("routing");
    render(<MessageThread />);
    fakeScroll(screen.getByTestId("thread-scroller"), 600);
    expect(screen.getByTestId("jump-to-bottom")).toBeInTheDocument();

    act(() => {
      useChatStore.getState().finishStreaming();
      useChatStore.getState().sendMessage("cost");
    });

    expect(screen.queryByTestId("jump-to-bottom")).not.toBeInTheDocument();
  });

  it("marks only the streaming message as streaming", () => {
    useChatStore.getState().sendMessage("tell me about routing");
    useChatStore.getState().finishStreaming();
    useChatStore.getState().sendMessage("now tell me about cost");

    render(<MessageThread />);

    const carets = screen.getAllByTestId("stream-caret");
    expect(carets).toHaveLength(1);

    const messages = screen.getAllByTestId(/^message-/);
    const assistantMessages = messages.filter(
      (m) => m.getAttribute("data-role") === "assistant",
    );
    expect(assistantMessages).toHaveLength(2);

    // The caret belongs to the second (newer, still-streaming) assistant
    // message, not the first (already finished).
    expect(
      within(assistantMessages[0]).queryByTestId("stream-caret"),
    ).not.toBeInTheDocument();
    expect(
      within(assistantMessages[1]).getByTestId("stream-caret"),
    ).toBeInTheDocument();
  });

  it("enables regenerate only on the last assistant message", () => {
    // Two completed turns → two assistant messages, only the newer is regenerable.
    useChatStore.getState().sendMessage("tell me about routing");
    useChatStore.getState().finishStreaming();
    useChatStore.getState().sendMessage("now tell me about cost");
    useChatStore.getState().finishStreaming();

    render(<MessageThread />);
    const regenButtons = screen.getAllByRole("button", { name: /regenerate/i });
    expect(regenButtons).toHaveLength(2);
    expect(regenButtons[0]).toBeDisabled();
    expect(regenButtons[1]).toBeEnabled();
  });
});
