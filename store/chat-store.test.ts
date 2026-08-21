import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useChatStore } from "./chat-store";
import { DEFAULT_CONVERSATION_TITLE, resolveReply } from "./chat-scripts";
import { useToastStore } from "./toast-store";
import { configureRepos } from "@/services/repo-registry";
import { liveRepoBundle } from "@/services/repos/http";
import { demoRepoBundle } from "@/services/repos/demo";
import { ApiError } from "@/services/http";

function reset() {
  useChatStore.setState(useChatStore.getInitialState());
  useToastStore.setState(useToastStore.getInitialState());
}

/** Drains the microtask queue so a live sendMessage's internal await settles. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("chat-store: conversation CRUD", () => {
  beforeEach(reset);

  it("starts with no conversations and nothing active", () => {
    const s = useChatStore.getState();
    expect(s.conversations).toEqual([]);
    expect(s.activeConversationId).toBeNull();
  });

  it("createConversation adds a conversation, returns its id, and activates it", () => {
    const id = useChatStore.getState().createConversation();
    const s = useChatStore.getState();
    expect(s.conversations).toHaveLength(1);
    expect(s.conversations[0].id).toBe(id);
    expect(s.conversations[0].title).toBe(DEFAULT_CONVERSATION_TITLE);
    expect(s.conversations[0].messages).toEqual([]);
    expect(s.activeConversationId).toBe(id);
  });

  it("newest conversation is first in the list", () => {
    const first = useChatStore.getState().createConversation();
    const second = useChatStore.getState().createConversation();
    const ids = useChatStore.getState().conversations.map((c) => c.id);
    expect(ids).toEqual([second, first]);
  });

  it("renameConversation changes only the target's title", () => {
    const a = useChatStore.getState().createConversation();
    const b = useChatStore.getState().createConversation();
    useChatStore.getState().renameConversation(a, "Routing questions");
    const byId = Object.fromEntries(
      useChatStore.getState().conversations.map((c) => [c.id, c.title])
    );
    expect(byId[a]).toBe("Routing questions");
    expect(byId[b]).toBe(DEFAULT_CONVERSATION_TITLE);
  });

  it("renameConversation ignores an empty or whitespace-only title", () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().renameConversation(id, "   ");
    expect(useChatStore.getState().conversations[0].title).toBe(
      DEFAULT_CONVERSATION_TITLE
    );
  });

  it("renameConversation trims surrounding whitespace", () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().renameConversation(id, "  Cost math  ");
    expect(useChatStore.getState().conversations[0].title).toBe("Cost math");
  });

  it("deleteConversation removes the target and activates the next remaining one", () => {
    const first = useChatStore.getState().createConversation();
    const second = useChatStore.getState().createConversation();
    // second is active (created last)
    useChatStore.getState().deleteConversation(second);
    const s = useChatStore.getState();
    expect(s.conversations.map((c) => c.id)).toEqual([first]);
    expect(s.activeConversationId).toBe(first);
  });

  it("deleting a non-active conversation leaves the active one alone", () => {
    const first = useChatStore.getState().createConversation();
    const second = useChatStore.getState().createConversation();
    useChatStore.getState().deleteConversation(first);
    expect(useChatStore.getState().activeConversationId).toBe(second);
  });

  it("deleting a non-active conversation leaves the active one alone, even when the active one isn't first in the list", () => {
    // Order after creation (newest first): [third, second, first].
    const first = useChatStore.getState().createConversation();
    useChatStore.getState().createConversation();
    const third = useChatStore.getState().createConversation();
    // Move "active" away from the front of the list.
    useChatStore.getState().setActiveConversation(first);
    // Delete something that is neither the active one nor at remaining[0].
    useChatStore.getState().deleteConversation(third);
    // A buggy unconditional `remaining[0]` reassignment would report the
    // wrong id here; only a wasActive-gated implementation gets this right.
    expect(useChatStore.getState().activeConversationId).toBe(first);
  });

  it("deleting the last conversation clears activeConversationId", () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().deleteConversation(id);
    const s = useChatStore.getState();
    expect(s.conversations).toEqual([]);
    expect(s.activeConversationId).toBeNull();
  });

  it("deleteConversation clears streamingMessageId when the deleted conversation owns the in-flight stream", () => {
    useChatStore.getState().sendMessage("routing");
    const streamingConvoId = useChatStore.getState().activeConversationId!;
    expect(useChatStore.getState().streamingMessageId).not.toBeNull();

    useChatStore.getState().deleteConversation(streamingConvoId);

    expect(useChatStore.getState().streamingMessageId).toBeNull();
  });

  it("deleting an unrelated conversation leaves an in-flight stream in another conversation alone", () => {
    useChatStore.getState().sendMessage("routing"); // conversation A is now streaming
    const streamingId = useChatStore.getState().streamingMessageId;
    const a = useChatStore.getState().activeConversationId!;
    const b = useChatStore.getState().createConversation(); // unrelated conversation B

    useChatStore.getState().deleteConversation(b);

    expect(useChatStore.getState().streamingMessageId).toBe(streamingId);
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([a]);
  });

  it("setActiveConversation switches the active id", () => {
    const first = useChatStore.getState().createConversation();
    useChatStore.getState().createConversation();
    useChatStore.getState().setActiveConversation(first);
    expect(useChatStore.getState().activeConversationId).toBe(first);
  });

  it("setSearchQuery stores the query verbatim", () => {
    useChatStore.getState().setSearchQuery("cost");
    expect(useChatStore.getState().searchQuery).toBe("cost");
  });
});

describe("chat-store: sending messages", () => {
  beforeEach(reset);

  it("sendMessage with no active conversation creates one first", () => {
    useChatStore.getState().sendMessage("tell me about routing");
    const s = useChatStore.getState();
    expect(s.conversations).toHaveLength(1);
    expect(s.activeConversationId).toBe(s.conversations[0].id);
  });

  it("appends the user message then an empty assistant message", () => {
    useChatStore.getState().createConversation();
    useChatStore.getState().sendMessage("tell me about routing");
    const msgs = useChatStore.getState().conversations[0].messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("tell me about routing");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].content).toBe("");
  });

  it("marks the new assistant message as the streaming target", () => {
    useChatStore.getState().sendMessage("routing");
    const s = useChatStore.getState();
    const assistant = s.conversations[0].messages[1];
    expect(s.streamingMessageId).toBe(assistant.id);
  });

  it("records which scripted reply and variant the assistant message uses", () => {
    useChatStore.getState().sendMessage("what about cost?");
    const assistant = useChatStore.getState().conversations[0].messages[1];
    expect(assistant.replyId).toBe(resolveReply("what about cost?").id);
    expect(assistant.variantIndex).toBe(0);
  });

  it("titles a brand-new conversation from the first user message", () => {
    useChatStore.getState().sendMessage("tell me about routing please");
    expect(useChatStore.getState().conversations[0].title).toBe(
      "tell me about routing please"
    );
  });

  it("truncates a long first message when using it as the title", () => {
    const long = "a".repeat(80);
    useChatStore.getState().sendMessage(long);
    const title = useChatStore.getState().conversations[0].title;
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith("…")).toBe(true);
  });

  it("does not re-title on the second message", () => {
    useChatStore.getState().sendMessage("first message here");
    useChatStore.getState().finishStreaming();
    useChatStore.getState().sendMessage("a completely different second message");
    expect(useChatStore.getState().conversations[0].title).toBe("first message here");
  });

  it("ignores an empty or whitespace-only message", () => {
    useChatStore.getState().createConversation();
    useChatStore.getState().sendMessage("   ");
    expect(useChatStore.getState().conversations[0].messages).toEqual([]);
  });

  it("getStreamingTarget returns the message id, the full scripted text, and what's written so far", () => {
    useChatStore.getState().sendMessage("routing");
    const target = useChatStore.getState().getStreamingTarget();
    const reply = resolveReply("routing");
    expect(target).not.toBeNull();
    expect(target!.fullText).toBe(reply.variants[0]);
    expect(target!.written).toBe("");
  });

  it("getStreamingTarget's written reflects accumulated chunks", () => {
    useChatStore.getState().sendMessage("routing");
    const id = useChatStore.getState().streamingMessageId!;
    useChatStore.getState().appendStreamChunk(id, "Three");
    expect(useChatStore.getState().getStreamingTarget()!.written).toBe("Three");
  });

  it("getStreamingTarget still resolves after switching to another conversation", () => {
    useChatStore.getState().sendMessage("routing");
    const streamingId = useChatStore.getState().streamingMessageId!;
    const other = useChatStore.getState().createConversation();
    useChatStore.getState().setActiveConversation(other);

    const target = useChatStore.getState().getStreamingTarget();
    expect(target).not.toBeNull();
    expect(target!.messageId).toBe(streamingId);
  });

  it("getStreamingTarget is null when nothing is streaming", () => {
    expect(useChatStore.getState().getStreamingTarget()).toBeNull();
  });
});

describe("chat-store: streaming mechanics", () => {
  beforeEach(reset);

  it("appendStreamChunk accumulates content on the target message", () => {
    useChatStore.getState().sendMessage("routing");
    const id = useChatStore.getState().streamingMessageId!;
    useChatStore.getState().appendStreamChunk(id, "Three ");
    useChatStore.getState().appendStreamChunk(id, "stacks");
    const assistant = useChatStore.getState().conversations[0].messages[1];
    expect(assistant.content).toBe("Three stacks");
  });

  it("appendStreamChunk on a non-target id is ignored", () => {
    useChatStore.getState().sendMessage("routing");
    useChatStore.getState().appendStreamChunk("not-a-real-id", "junk");
    const assistant = useChatStore.getState().conversations[0].messages[1];
    expect(assistant.content).toBe("");
  });

  it("finishStreaming clears the streaming target and bumps updatedAt", () => {
    useChatStore.getState().sendMessage("routing");
    const before = useChatStore.getState().conversations[0].updatedAt;
    useChatStore.getState().finishStreaming();
    const s = useChatStore.getState();
    expect(s.streamingMessageId).toBeNull();
    expect(s.conversations[0].updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("finishStreaming bumps the streaming message's conversation, not whichever is active", () => {
    // Both conversations are created in the same millisecond under real
    // Date.now(), so control time explicitly rather than asserting on
    // wall-clock drift.
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);

    useChatStore.getState().sendMessage("routing"); // starts streaming in conversation A
    const a = useChatStore.getState().activeConversationId!;
    const aBefore = useChatStore.getState().getActiveConversation()!.updatedAt;

    const b = useChatStore.getState().createConversation(); // switches active to B
    const bBefore = useChatStore.getState().conversations.find((c) => c.id === b)!.updatedAt;

    nowSpy.mockReturnValue(2_000);
    useChatStore.getState().finishStreaming(); // stream belongs to A, not the now-active B

    const s = useChatStore.getState();
    const aAfter = s.conversations.find((c) => c.id === a)!.updatedAt;
    const bAfter = s.conversations.find((c) => c.id === b)!.updatedAt;

    expect(aAfter).toBe(2_000);
    expect(aAfter).not.toBe(aBefore);
    expect(bAfter).toBe(bBefore);

    nowSpy.mockRestore();
  });

  it("stopStreaming keeps partial content and clears the streaming target", () => {
    useChatStore.getState().sendMessage("routing");
    const id = useChatStore.getState().streamingMessageId!;
    useChatStore.getState().appendStreamChunk(id, "Three stacks, and");
    useChatStore.getState().stopStreaming();
    const s = useChatStore.getState();
    expect(s.streamingMessageId).toBeNull();
    expect(s.conversations[0].messages[1].content).toBe("Three stacks, and");
  });
});

describe("chat-store: regenerate", () => {
  beforeEach(reset);

  it("regenerateLast advances to the next variant and re-streams from empty", () => {
    useChatStore.getState().sendMessage("routing");
    const id = useChatStore.getState().streamingMessageId!;
    useChatStore.getState().appendStreamChunk(id, "whatever was streamed");
    useChatStore.getState().finishStreaming();

    useChatStore.getState().regenerateLast();
    const s = useChatStore.getState();
    const assistant = s.conversations[0].messages[1];
    expect(assistant.variantIndex).toBe(1);
    expect(assistant.content).toBe("");
    expect(s.streamingMessageId).toBe(assistant.id);
    expect(s.getStreamingTarget()!.fullText).toBe(resolveReply("routing").variants[1]);
  });

  it("regenerateLast wraps back to variant 0 after the last variant", () => {
    useChatStore.getState().sendMessage("routing");
    useChatStore.getState().finishStreaming();
    useChatStore.getState().regenerateLast(); // → 1
    useChatStore.getState().finishStreaming();
    useChatStore.getState().regenerateLast(); // → wraps to 0
    expect(useChatStore.getState().conversations[0].messages[1].variantIndex).toBe(0);
  });

  it("regenerateLast does not add a second assistant message", () => {
    useChatStore.getState().sendMessage("routing");
    useChatStore.getState().finishStreaming();
    useChatStore.getState().regenerateLast();
    expect(useChatStore.getState().conversations[0].messages).toHaveLength(2);
  });

  it("regenerateLast is a no-op while a stream is already running", () => {
    useChatStore.getState().sendMessage("routing");
    // still streaming — variantIndex must not move
    useChatStore.getState().regenerateLast();
    expect(useChatStore.getState().conversations[0].messages[1].variantIndex).toBe(0);
  });

  it("regenerateLast is a no-op when there is no assistant message", () => {
    useChatStore.getState().createConversation();
    useChatStore.getState().regenerateLast();
    expect(useChatStore.getState().conversations[0].messages).toEqual([]);
  });
});

describe("chat-store: getActiveConversation", () => {
  beforeEach(reset);

  it("returns null when nothing is active", () => {
    expect(useChatStore.getState().getActiveConversation()).toBeNull();
  });

  it("returns the active conversation", () => {
    const id = useChatStore.getState().createConversation();
    expect(useChatStore.getState().getActiveConversation()!.id).toBe(id);
  });
});

describe("chat-store: the live seam", () => {
  beforeEach(() => {
    reset();
    configureRepos("live", liveRepoBundle);
  });

  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    vi.restoreAllMocks();
  });

  it("sendMessage posts through ChatRepo, sets liveTurn, and never sets streamingMessageId", async () => {
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
      turnId: "t1",
      conversationId: "conv-server-1",
    });

    useChatStore.getState().sendMessage("what's the weather");
    await flush();

    const s = useChatStore.getState();
    expect(s.streamingMessageId).toBeNull();
    // The pane keeps the id it was created under. The daemon's answer is a
    // session id (one per assistant process run), not this conversation's
    // identity -- see sendLiveMessage's doc in chat-store.ts.
    const paneId = s.conversations[0].id;
    expect(paneId).not.toBe("conv-server-1");
    expect(s.activeConversationId).toBe(paneId);
    expect(s.liveTurn?.conversationId).toBe(paneId);
    expect(s.liveTurn?.daemonConversationId).toBe("conv-server-1");
    expect(s.conversations[0].messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(s.conversations[0].messages[1].content).toBe(""); // nothing to reveal yet
  });

  it("a second live conversation does not collide with the first, even though the daemon answers with one session id for the whole run", async () => {
    // The exact failure this guards: /app/chat -> send "hi" -> new chat ->
    // send "hello". `POST /v1/chat` returns get_current_session_id(), which
    // is ONE uuid for an entire TENKA process run, so both sends answer
    // "session-1". Adopting it as the pane id gave both conversations the
    // same id: MessageThread's `conversations.find(c => c.id === active)`
    // then rendered the FIRST one, so the message the user had just sent and
    // its reply never appeared; settleLiveTurn wrote into both; delete
    // removed both; ConversationList emitted duplicate React keys.
    const send = vi
      .spyOn(liveRepoBundle.chat, "sendMessage")
      .mockResolvedValue({ turnId: "t1", conversationId: "session-1" });
    const getConversation = vi.spyOn(liveRepoBundle.chat, "getConversation");

    getConversation.mockResolvedValue({
      id: "session-1",
      title: "session-1",
      messages: [
        { id: "d1", role: "user", content: "hi", createdAt: 1 },
        { id: "d2", role: "assistant", content: "Hi yourself.", createdAt: 2 },
      ],
    });
    useChatStore.getState().sendMessage("hi");
    await flush();
    const firstPane = useChatStore.getState().activeConversationId!;
    await useChatStore.getState().settleLiveTurn("t1");

    const secondPane = useChatStore.getState().createConversation();
    send.mockResolvedValue({ turnId: "t2", conversationId: "session-1" });
    getConversation.mockResolvedValue({
      id: "session-1",
      title: "session-1",
      messages: [
        { id: "d1", role: "user", content: "hi", createdAt: 1 },
        { id: "d2", role: "assistant", content: "Hi yourself.", createdAt: 2 },
        { id: "d3", role: "user", content: "hello", createdAt: 3 },
        { id: "d4", role: "assistant", content: "Still me.", createdAt: 4 },
      ],
    });
    useChatStore.getState().sendMessage("hello");
    await flush();
    await useChatStore.getState().settleLiveTurn("t2");

    const s = useChatStore.getState();
    const ids = s.conversations.map((c) => c.id);
    expect(new Set(ids).size).toBe(2); // no duplicate React keys
    expect(ids).not.toContain("session-1");
    expect(s.activeConversationId).toBe(secondPane);

    // What MessageThread renders: the pane the user is actually looking at,
    // holding the turn they just sent.
    const shown = s.conversations.find((c) => c.id === s.activeConversationId)!;
    expect(shown.id).toBe(secondPane);
    expect(shown.messages.map((m) => m.content)).toContain("hello");
    expect(shown.messages.map((m) => m.content)).toContain("Still me.");

    // And deleting one leaves the other standing.
    useChatStore.getState().deleteConversation(secondPane);
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([firstPane]);
  });

  it("sendMessage rolls back the optimistic bubbles and toasts on a busy (409)", async () => {
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockRejectedValue(new ApiError(409, "busy"));

    useChatStore.getState().sendMessage("again?");
    await flush();

    const s = useChatStore.getState();
    expect(s.conversations[0].messages).toEqual([]);
    expect(s.liveTurn).toBeNull();
    expect(useToastStore.getState().toasts.at(-1)?.title).toMatch(/mid-turn/i);
  });

  it("a rejected send hands the user's text back for the composer to restore", async () => {
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockRejectedValue(new ApiError(409, "busy"));

    useChatStore.getState().sendMessage("  the thing I typed  ");
    await flush();

    // Trimmed, matching what would actually have been sent.
    expect(useChatStore.getState().rejectedDraft).toBe("the thing I typed");
    useChatStore.getState().clearRejectedDraft();
    expect(useChatStore.getState().rejectedDraft).toBeNull();
  });

  it("settleLiveTurn replaces the placeholder with the daemon's real reply, fetching by the daemon's id and merging into the local pane", async () => {
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
      turnId: "t1",
      conversationId: "session-1",
    });
    const getConversation = vi
      .spyOn(liveRepoBundle.chat, "getConversation")
      .mockResolvedValue({
        id: "session-1",
        title: "Weather",
        messages: [
          { id: "m-user", role: "user", content: "what's the weather", createdAt: 1 },
          { id: "m-assistant", role: "assistant", content: "Overcast, 19°C.", createdAt: 2 },
        ],
      });

    useChatStore.getState().sendMessage("what's the weather");
    await flush();
    const paneId = useChatStore.getState().activeConversationId!;
    await useChatStore.getState().settleLiveTurn("t1");

    // The fetch key is the daemon's id; the merge target is the local pane.
    expect(getConversation).toHaveBeenCalledWith("session-1");
    const s = useChatStore.getState();
    expect(s.liveTurn).toBeNull();
    expect(s.conversations[0].id).toBe(paneId);
    expect(s.conversations[0].messages.map((m) => m.content)).toEqual([
      "what's the weather",
      "Overcast, 19°C.",
    ]);
  });

  it("settleLiveTurn keeps the local title when the daemon's is just the id again", async () => {
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
      turnId: "t1",
      conversationId: "session-1",
    });
    // What the daemon actually sends: `ConversationDetail(id, id, messages)`,
    // so `title` is the raw session id. Adopting it verbatim would rename the
    // sidebar entry to a uuid the moment the first live reply landed.
    vi.spyOn(liveRepoBundle.chat, "getConversation").mockResolvedValue({
      id: "session-1",
      title: "session-1",
      messages: [
        { id: "m-user", role: "user", content: "what's the weather", createdAt: 1 },
        { id: "m-assistant", role: "assistant", content: "Overcast, 19°C.", createdAt: 2 },
      ],
    });

    useChatStore.getState().sendMessage("what's the weather");
    await flush();
    await useChatStore.getState().settleLiveTurn("t1");

    expect(useChatStore.getState().conversations[0].title).toBe("what's the weather");
    expect(useChatStore.getState().conversations[0].messages).toHaveLength(2);
  });

  it("settleLiveTurn is a no-op for a turn that is not the pending one", async () => {
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
      turnId: "studio-4",
      conversationId: "session-1",
    });
    const getConversationSpy = vi.spyOn(liveRepoBundle.chat, "getConversation");

    useChatStore.getState().sendMessage("hi");
    await flush();
    await useChatStore.getState().settleLiveTurn("studio-3");

    expect(getConversationSpy).not.toHaveBeenCalled();
    expect(useChatStore.getState().liveTurn).not.toBeNull();
  });

  it("settleLiveTurn does not fetch when handed a conversation id instead of a turn id", async () => {
    // The guard used to compare `liveTurn.conversationId`, and live mode has
    // exactly one pane, so that string was identical for every turn the user
    // ever sent -- the guard degraded to `if (!liveTurn) return`. Neither the
    // pane's id nor the daemon's session id is a turn identity, and handing
    // either one here must settle nothing.
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
      turnId: "studio-1",
      conversationId: "session-1",
    });
    const getConversationSpy = vi.spyOn(liveRepoBundle.chat, "getConversation");

    useChatStore.getState().sendMessage("hi");
    await flush();
    await useChatStore.getState().settleLiveTurn(useChatStore.getState().activeConversationId!);
    await useChatStore.getState().settleLiveTurn("session-1");

    expect(getConversationSpy).not.toHaveBeenCalled();
    expect(useChatStore.getState().liveTurn).not.toBeNull();
  });

  it("settleLiveTurn merges her reply into the pane instead of adopting the daemon's session transcript", async () => {
    // `getConversation()` is keyed by the daemon's SESSION id, so what comes
    // back is `memory.get_recent(200, session)` -- every turn of the running
    // assistant process, voice turns included, and nothing from the run
    // before it. Assigning that array to the pane replaced a fresh pane with
    // up to 200 unrelated turns, and replaced a restored pane's persisted
    // history with only the current run's turns.
    useChatStore.setState({
      conversations: [
        {
          id: "pane-1",
          title: "Yesterday",
          messages: [
            { id: "old-1", role: "user", content: "yesterday's question", createdAt: 1 },
            { id: "old-2", role: "assistant", content: "yesterday's answer", createdAt: 2 },
          ],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      activeConversationId: "pane-1",
    });
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
      turnId: "studio-2",
      conversationId: "session-2",
    });
    vi.spyOn(liveRepoBundle.chat, "getConversation").mockResolvedValue({
      id: "session-2",
      title: "session-2",
      messages: [
        // A turn this pane never saw -- the user spoke it at the mic while
        // Studio was closed. It shares the session, not the conversation.
        { id: "studio-1-u", role: "user", content: "play something", createdAt: 10 },
        { id: "studio-1-a", role: "assistant", content: "Fine.", createdAt: 10 },
        { id: "studio-2-u", role: "user", content: "what's new", createdAt: 11 },
        { id: "studio-2-a", role: "assistant", content: "Nothing much.", createdAt: 11 },
      ],
    });

    useChatStore.getState().sendMessage("what's new");
    await flush();
    await useChatStore.getState().settleLiveTurn("studio-2");

    const pane = useChatStore.getState().conversations[0];
    expect(pane.messages.map((m) => m.content)).toEqual([
      "yesterday's question", // survived: local history is not stale data
      "yesterday's answer",
      "what's new", // the local optimistic bubble, not the daemon's copy
      "Nothing much.", // the only thing the transcript contributed
    ]);
    // The voice turn stayed where it belongs: in the daemon's session, not
    // in this pane.
    expect(pane.messages.map((m) => m.content)).not.toContain("play something");
    // And no duplicate ids, which is what a naive id-union would have left.
    expect(new Set(pane.messages.map((m) => m.id)).size).toBe(4);
  });

  it("a deleted conversation is not resurrected inside the next one to settle", async () => {
    // Deleting a conversation is local-only -- the daemon exposes no DELETE
    // verb on any route -- and while settling assigned the whole session
    // transcript over the pane, every deleted turn came straight back inside
    // whichever pane settled next. That is what made the control a lie; the
    // merge is what makes it mean something.
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
      turnId: "studio-2",
      conversationId: "session-1",
    });
    vi.spyOn(liveRepoBundle.chat, "getConversation").mockResolvedValue({
      id: "session-1",
      title: "session-1",
      messages: [
        { id: "studio-1-u", role: "user", content: "the deleted question", createdAt: 1 },
        { id: "studio-1-a", role: "assistant", content: "the deleted answer", createdAt: 1 },
        { id: "studio-2-u", role: "user", content: "a fresh question", createdAt: 2 },
        { id: "studio-2-a", role: "assistant", content: "A fresh answer.", createdAt: 2 },
      ],
    });

    const doomed = useChatStore.getState().createConversation();
    const survivor = useChatStore.getState().createConversation();
    useChatStore.getState().deleteConversation(doomed);
    useChatStore.getState().setActiveConversation(survivor);

    useChatStore.getState().sendMessage("a fresh question");
    await flush();
    await useChatStore.getState().settleLiveTurn("studio-2");

    const contents = useChatStore
      .getState()
      .conversations.flatMap((c) => c.messages.map((m) => m.content));
    expect(contents).toEqual(["a fresh question", "A fresh answer."]);
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([survivor]);
  });

  it("settleLiveTurn toasts and clears the bubble when the refetch fails outright", async () => {
    // `getConversation()` rethrows everything but a 404, and the `finally`
    // cleared the turn on every path -- so a 401 or a 500 unblocked the
    // composer over a permanently blank assistant bubble with no toast and
    // no error state. sendMessage already toasts on the same class of
    // failure; a settle going quiet reads as "she ignored me".
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
      turnId: "studio-1",
      conversationId: "session-1",
    });
    vi.spyOn(liveRepoBundle.chat, "getConversation").mockRejectedValue(
      new ApiError(500, "boom"),
    );

    useChatStore.getState().sendMessage("hi");
    await flush();
    await useChatStore.getState().settleLiveTurn("studio-1");

    const s = useChatStore.getState();
    expect(s.liveTurn).toBeNull(); // the composer still unblocks
    expect(useToastStore.getState().toasts.at(-1)?.ok).toBe(false);
    expect(useToastStore.getState().toasts.at(-1)?.title).toMatch(/reply/i);
    // Only the user's message is left -- an assistant bubble that renders
    // blank forever is the state this is replacing.
    expect(s.conversations[0].messages.map((m) => m.content)).toEqual(["hi"]);
  });

  it("settleLiveTurn drops the blank bubble when the conversation is gone server-side", async () => {
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
      turnId: "studio-1",
      conversationId: "session-1",
    });
    vi.spyOn(liveRepoBundle.chat, "getConversation").mockResolvedValue(null);

    useChatStore.getState().sendMessage("hi");
    await flush();
    await useChatStore.getState().settleLiveTurn("studio-1");

    const s = useChatStore.getState();
    expect(s.liveTurn).toBeNull();
    expect(s.conversations[0].messages.map((m) => m.content)).toEqual(["hi"]);
  });

  it("stopStreaming aborts a live turn and drops the empty placeholder rather than leaving a blank bubble", async () => {
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
      turnId: "t1",
      conversationId: "session-1",
    });
    const abortSpy = vi.spyOn(liveRepoBundle.chat, "abort").mockResolvedValue(true);

    useChatStore.getState().sendMessage("hi");
    await flush();
    useChatStore.getState().stopStreaming();
    await flush();

    expect(abortSpy).toHaveBeenCalled();
    expect(useChatStore.getState().liveTurn).toBeNull();
    expect(useChatStore.getState().conversations[0].messages).toHaveLength(1); // only the user's
  });

  it("regenerateLast is a no-op in live mode -- it would overwrite a real reply with a scripted one", async () => {
    vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
      turnId: "t1",
      conversationId: "session-1",
    });
    vi.spyOn(liveRepoBundle.chat, "getConversation").mockResolvedValue({
      id: "session-1",
      title: "Weather",
      messages: [
        { id: "m-user", role: "user", content: "hi", createdAt: 1 },
        { id: "m-assistant", role: "assistant", content: "Hello.", createdAt: 2 },
      ],
    });

    useChatStore.getState().sendMessage("hi");
    await flush();
    await useChatStore.getState().settleLiveTurn("t1");

    useChatStore.getState().regenerateLast();

    expect(useChatStore.getState().conversations[0].messages[1].content).toBe("Hello.");
  });
});
