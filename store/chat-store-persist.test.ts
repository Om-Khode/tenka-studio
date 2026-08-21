import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useChatStore } from "./chat-store";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";

const STORAGE_KEY = "tenka-studio-chat";

function reset() {
  localStorage.clear();
  useChatStore.setState(useChatStore.getInitialState());
}

/**
 * Zustand v5's persist middleware reassigns the store's public `setState`
 * (what `useChatStore.setState` calls) to write through to storage after
 * EVERY call, external or internal — confirmed in zustand's own source
 * (persist.ts: `api.setState = (state, replace) => { savedSetState(...); return setItem(); }`)
 * and in its migration docs. So calling `useChatStore.setState({...})` to
 * wipe in-memory state also overwrites localStorage with that wiped state,
 * before `rehydrate()` ever gets to read it back — defeating the "keep
 * localStorage" simulation. Snapshot storage first and restore it after the
 * wipe so only the in-memory state is cleared, which is what a real reload
 * actually does (memory resets, storage doesn't).
 */
function simulateReload() {
  const snapshot = localStorage.getItem(STORAGE_KEY);
  useChatStore.setState({ conversations: [], activeConversationId: null });
  if (snapshot !== null) {
    localStorage.setItem(STORAGE_KEY, snapshot);
  }
}

describe("chat-store persistence", () => {
  beforeEach(reset);

  it("writes conversations to localStorage under the expected key", async () => {
    useChatStore.getState().createConversation();
    // persist writes synchronously after the set() in this adapter
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.conversations).toHaveLength(1);
  });

  it("does not persist transient UI state", () => {
    useChatStore.getState().sendMessage("routing");
    useChatStore.getState().setSearchQuery("cost");
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!).state;
    expect(persisted.streamingMessageId).toBeUndefined();
    expect(persisted.searchQuery).toBeUndefined();
    expect(persisted.hasHydrated).toBeUndefined();
  });

  it("restores conversations on rehydrate", async () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().renameConversation(id, "Cost math");

    // Simulate a fresh page load: wipe in-memory state, keep localStorage.
    simulateReload();
    await useChatStore.persist.rehydrate();

    const s = useChatStore.getState();
    expect(s.conversations).toHaveLength(1);
    expect(s.conversations[0].title).toBe("Cost math");
    expect(s.activeConversationId).toBe(id);
  });

  it("sets hasHydrated after rehydrate", async () => {
    expect(useChatStore.getState().hasHydrated).toBe(false);
    await useChatStore.persist.rehydrate();
    expect(useChatStore.getState().hasHydrated).toBe(true);
  });

  it("drops a trailing empty assistant message left behind by a mid-stream reload", async () => {
    useChatStore.getState().sendMessage("routing");
    // streaming never completed — the assistant message is still empty
    expect(useChatStore.getState().conversations[0].messages).toHaveLength(2);

    simulateReload();
    await useChatStore.persist.rehydrate();

    const messages = useChatStore.getState().conversations[0].messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
  });

  it("keeps a partially-streamed assistant message (non-empty content survives)", async () => {
    useChatStore.getState().sendMessage("routing");
    const id = useChatStore.getState().streamingMessageId!;
    useChatStore.getState().appendStreamChunk(id, "Three stacks");

    simulateReload();
    await useChatStore.persist.rehydrate();

    const messages = useChatStore.getState().conversations[0].messages;
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe("Three stacks");
  });

  describe("mode-namespaced persistence", () => {
    afterEach(() => configureRepos("demo", demoRepoBundle));

    it("writes under a distinct key in live mode, leaving the demo key's last write untouched", () => {
      useChatStore.getState().createConversation();

      configureRepos("live", demoRepoBundle);
      useChatStore.getState().createConversation();

      // Resetting the store on a mode switch is Task 9's job, not this
      // seam's -- so the in-memory store still carries both conversations,
      // and that's exactly what the live write should snapshot. The point
      // under test is the KEY, not the count: the demo key keeps its last
      // write from before the switch (one conversation), while everything
      // written after the switch lands under the live key instead of
      // overwriting the demo one.
      const demoWritten = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      const liveWritten = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:live`)!);
      expect(demoWritten.state.conversations).toHaveLength(1);
      expect(liveWritten.state.conversations).toHaveLength(2);
    });
  });
});
