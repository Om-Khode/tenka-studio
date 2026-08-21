import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMessageStream } from "./useMessageStream";
import { useChatStore } from "@/store/chat-store";

function activeAssistantContent(): string {
  const c = useChatStore.getState().conversations[0];
  return c.messages[c.messages.length - 1].content;
}

describe("useMessageStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    useChatStore.setState(useChatStore.getInitialState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("streams nothing while there is no streaming target", () => {
    renderHook(() => useMessageStream());
    vi.advanceTimersByTime(2000);
    expect(useChatStore.getState().conversations).toEqual([]);
  });

  it("appends words incrementally to the streaming message", () => {
    useChatStore.getState().sendMessage("routing");
    renderHook(() => useMessageStream());

    expect(activeAssistantContent()).toBe("");
    vi.advanceTimersByTime(60);
    const afterOne = activeAssistantContent();
    expect(afterOne.length).toBeGreaterThan(0);

    vi.advanceTimersByTime(300);
    expect(activeAssistantContent().length).toBeGreaterThan(afterOne.length);
  });

  it("streams the full scripted text and then clears the streaming target", () => {
    useChatStore.getState().sendMessage("routing");
    const expected = useChatStore.getState().getStreamingTarget()!.fullText;
    renderHook(() => useMessageStream());

    // Advance generously — enough ticks to exhaust the whole reply.
    vi.advanceTimersByTime(60 * (expected.split(/\s+/).length + 5));

    expect(activeAssistantContent()).toBe(expected);
    expect(useChatStore.getState().streamingMessageId).toBeNull();
  });

  it("stops appending after stopStreaming is called", () => {
    useChatStore.getState().sendMessage("routing");
    renderHook(() => useMessageStream());
    vi.advanceTimersByTime(180);
    const partial = activeAssistantContent();

    useChatStore.getState().stopStreaming();
    vi.advanceTimersByTime(1000);

    expect(activeAssistantContent()).toBe(partial);
  });

  it("stops scheduling work after unmount", () => {
    useChatStore.getState().sendMessage("routing");
    const appendSpy = vi.spyOn(useChatStore.getState(), "appendStreamChunk");
    const { unmount } = renderHook(() => useMessageStream());
    unmount();
    vi.advanceTimersByTime(2000);
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it("self-heals a dangling streamingMessageId that no longer resolves to any message", () => {
    useChatStore.getState().sendMessage("routing");
    const convoId = useChatStore.getState().activeConversationId!;
    // Simulate the owning conversation disappearing out from under the
    // stream without going through deleteConversation's own clear (e.g. a
    // future code path that removes a conversation directly) --
    // getStreamingTarget() now returns null forever unless the hook itself
    // self-heals.
    useChatStore.setState({
      conversations: useChatStore.getState().conversations.filter((c) => c.id !== convoId),
    });
    expect(useChatStore.getState().streamingMessageId).not.toBeNull();

    renderHook(() => useMessageStream());
    vi.advanceTimersByTime(60);

    expect(useChatStore.getState().streamingMessageId).toBeNull();
  });

  it("picks up a regenerated stream on the same message", () => {
    useChatStore.getState().sendMessage("routing");
    renderHook(() => useMessageStream());
    const expected = useChatStore.getState().getStreamingTarget()!.fullText;
    vi.advanceTimersByTime(60 * (expected.split(/\s+/).length + 5));
    expect(useChatStore.getState().streamingMessageId).toBeNull();

    useChatStore.getState().regenerateLast();
    const regenerated = useChatStore.getState().getStreamingTarget()!.fullText;
    expect(regenerated).not.toBe(expected);

    vi.advanceTimersByTime(60 * (regenerated.split(/\s+/).length + 5));
    expect(activeAssistantContent()).toBe(regenerated);
  });
});
