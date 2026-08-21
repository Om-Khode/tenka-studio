import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useChatHydration } from "./useChatHydration";
import { useChatStore } from "@/store/chat-store";

const STORAGE_KEY = "tenka-studio-chat";

describe("useChatHydration (real rehydrate flow)", () => {
  it("notifies a real subscriber with hasHydrated: true, not just get()", async () => {
    // NOTE on why this isn't a skeleton-visibility test: window.localStorage
    // is synchronous, and zustand's persist middleware (middleware.js's
    // `toThenable`) resolves a synchronous storage read through its .then()
    // chain eagerly, in the same callstack -- there is no microtask gap
    // between hydrate()'s notifying `set(stateFromStorage, true)` and
    // onRehydrateStorage's silent mutation. React Testing Library's
    // renderHook() flushes the hook's rehydrate effect to completion (via
    // act()) before returning, so by the time any assertion runs, both the
    // notify AND the silent mutation have already happened -- there is no
    // observable instant where a hasHydrated-gated consumer's skeleton is
    // still on screen. Confirmed empirically: temporarily reverting the fix
    // to a bare `void useChatStore.persist.rehydrate();` still leaves
    // get().hasHydrated true immediately after renderHook(), because
    // useSyncExternalStore always re-reads getSnapshot() fresh at the time
    // its deferred re-render actually runs, which is after the mutation.
    //
    // What *does* distinguish fixed from unfixed is who gets told, not
    // what the value becomes. useChatStore.subscribe() mirrors exactly
    // what React's binding is notified with: without the hook's follow-up
    // set() call, hydrate()'s only notify happens *before* the silent
    // mutation (state.hasHydrated is still false at that instant), so no
    // subscriber is ever notified with hasHydrated: true even though
    // get().hasHydrated ends up true. That gap is the real bug this test
    // exists to catch, and it is what would leave a subscriber (e.g. a
    // future async-storage backend, or any consumer that trusts
    // notifications instead of polling get()) stuck believing hydration
    // never finished.
    localStorage.clear();
    useChatStore.setState(useChatStore.getInitialState());

    // Seed localStorage the way a previous session would have left it, then
    // wipe in-memory state but keep storage -- the `simulateReload()`
    // pattern from chat-store-persist.test.ts. persist's setState writes
    // through to localStorage on every call (including this wipe), so the
    // storage snapshot has to be taken first and restored after, or the
    // wipe would erase what was just seeded.
    useChatStore.getState().createConversation();
    const id = useChatStore.getState().activeConversationId!;
    useChatStore.getState().renameConversation(id, "Persisted convo");
    const snapshot = localStorage.getItem(STORAGE_KEY);
    useChatStore.setState(useChatStore.getInitialState());
    if (snapshot !== null) localStorage.setItem(STORAGE_KEY, snapshot);

    // Unlike a force-set beforeEach, hasHydrated is NOT force-set here --
    // this test exercises the real hook rehydrate flow.
    expect(useChatStore.getState().hasHydrated).toBe(false);

    const hasHydratedSeenBySubscribers: boolean[] = [];
    const unsubscribe = useChatStore.subscribe((state) => {
      hasHydratedSeenBySubscribers.push(state.hasHydrated);
    });

    renderHook(() => useChatHydration());

    // The hook's follow-up useChatStore.setState({ hasHydrated: true }) runs
    // inside Promise.resolve(rehydrate()).then(...) -- a native Promise,
    // which always defers its callback to a microtask even when the value
    // being adopted is already settled. renderHook()'s synchronous act()
    // flushes synchronous work but not that microtask, so it must be
    // awaited here.
    await waitFor(() => {
      expect(hasHydratedSeenBySubscribers).toContain(true);
    });

    unsubscribe();

    expect(useChatStore.getState().hasHydrated).toBe(true);
    expect(useChatStore.getState().conversations[0]?.title).toBe("Persisted convo");
  });
});
