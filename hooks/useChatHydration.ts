import { useEffect } from "react";
import { useChatStore } from "@/store/chat-store";

/**
 * The store is created with skipHydration so it never reads localStorage
 * during a server render. Rehydrate once, on the client.
 *
 * onRehydrateStorage's callback (see store/chat-store.ts) mutates the
 * draft state object directly instead of calling set() -- Zustand's
 * hydrate() only notifies subscribers for the set(stateFromStorage, true)
 * call that happens *before* that callback runs. The hasHydrated: true
 * flip inside the callback is therefore silent: ConversationList's
 * useChatStore((s) => s.hasHydrated) selector never re-renders and its
 * skeleton would stay up forever. Re-assert hasHydrated through a real
 * set() call after rehydrate() resolves so subscribers actually fire.
 *
 * Called from app/demo/layout.tsx rather than the Chat page: the layout
 * renders on every /demo/* route (Sidebar's live conversation-count badge
 * needs the store hydrated there too), while the Chat page only mounts
 * once the user navigates to /demo/chat.
 */
export function useChatHydration() {
  useEffect(() => {
    void Promise.resolve(useChatStore.persist.rehydrate()).then(() => {
      useChatStore.setState({ hasHydrated: true });
    });
  }, []);
}
