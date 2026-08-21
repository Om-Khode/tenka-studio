import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChatStore } from "@/store/chat-store";

vi.mock("next/navigation", () => ({
  usePathname: () => "/demo/settings",
}));

import DemoLayout from "./layout";

const STORAGE_KEY = "tenka-studio-chat";

describe("Demo layout hydration (Sidebar badge on a non-Chat route)", () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState(useChatStore.getInitialState());
  });

  it("hydrates the chat store from /demo/settings so the Sidebar shows the persisted conversation count", async () => {
    // Seed localStorage the way a previous session would have left it, then
    // wipe in-memory state but keep storage -- the `simulateReload()`
    // pattern from chat-store-persist.test.ts / page.test.tsx.
    useChatStore.getState().createConversation();
    useChatStore.getState().createConversation();
    const snapshot = localStorage.getItem(STORAGE_KEY);
    useChatStore.setState(useChatStore.getInitialState());
    if (snapshot !== null) localStorage.setItem(STORAGE_KEY, snapshot);

    expect(useChatStore.getState().hasHydrated).toBe(false);
    expect(useChatStore.getState().conversations).toEqual([]);

    // This is /demo/settings, never /demo/chat -- before the fix, only the
    // Chat page's mount effect rehydrated the store, so a hard load of any
    // other /demo/* route left the Sidebar badge permanently absent no
    // matter how many conversations were persisted.
    render(
      <DemoLayout>
        <div>settings page content</div>
      </DemoLayout>
    );

    // Both navs -- the sidebar and the bottom bar -- read the same badge, and
    // the point of the hydration fix is that neither is left blank. See
    // app/demo/nav.test.tsx for why these queries are plural now.
    await waitFor(() => {
      const chatLinks = screen.getAllByRole("link", { name: /chat/i });
      expect(chatLinks).toHaveLength(2);
      for (const link of chatLinks) {
        expect(link.textContent).toContain("2");
      }
    });
  });
});
