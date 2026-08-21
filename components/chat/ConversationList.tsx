"use client";

import { Plus, Search } from "lucide-react";
import { ConversationItem } from "./ConversationItem";
import { Skeleton } from "@/components/ui/skeleton";
import { useChatStore } from "@/store/chat-store";
import { getRepoMode } from "@/services/repo-registry";
import type { Conversation } from "@/types/chat";

function matches(conversation: Conversation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (conversation.title.toLowerCase().includes(q)) return true;
  return conversation.messages.some((m) => m.content.toLowerCase().includes(q));
}

/**
 * `w-full lg:w-64`: below `lg` this pane is shown alone, never beside the
 * thread (components/chat/ChatPane.tsx owns that swap), so a 16rem column
 * would leave two thirds of a phone screen empty. The right-hand border is
 * likewise a divider between two panes, so it only exists when there are two.
 */
export function ConversationList({ onSelect }: { onSelect?: () => void }) {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const createConversation = useChatStore((s) => s.createConversation);
  const hasHydrated = useChatStore((s) => s.hasHydrated);

  if (!hasHydrated) {
    return (
      <div
        data-testid="conversation-list-skeleton"
        className="flex w-full flex-1 flex-col gap-2 border-border p-4 lg:w-64 lg:border-r"
      >
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const visible = conversations.filter((c) => matches(c, searchQuery));

  return (
    // flex-1: this is no longer a direct child of the pane's flex row (a
    // mobile-only back button shares a column with it), so it has to be told
    // to fill that column -- otherwise it is content-height and its right-hand
    // divider stops halfway down the page.
    <div className="flex min-h-0 w-full flex-1 flex-col border-border lg:w-64 lg:border-r">
      <div className="flex flex-col gap-2 p-4">
        {/* Live mode has no second conversation to create. `POST /v1/chat`
            takes `{ text }` and nothing else -- ChatRequest in openapi.json is
            `additionalProperties: false` -- so Studio cannot address a
            conversation at all, and the daemon answers every turn of a run
            with the same session id. A second pane could never be routed
            anywhere: its messages would go to the first conversation's turn
            queue and its history would be that one's. Hidden rather than
            disabled-with-a-tooltip because there is no state in which it
            becomes available; hidden rather than repurposed as "clear this
            chat" because settleLiveTurn refetches the session's whole history
            on the very next turn, so a cleared pane would refill itself and
            the control would be lying twice. Demo keeps it -- its replies are
            local and per-conversation -- and `=== "demo"` (Task 12), because
            only a proven demo registry has them. */}
        {getRepoMode() === "demo" && (
          <button
            onClick={() => createConversation()}
            className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-bone transition-colors hover:border-border-strong hover:bg-card"
          >
            <Plus size={13} />
            new chat
          </button>
        )}
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-bone-ghost"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search conversations"
            className="w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-2 text-xs text-bone placeholder:text-bone-ghost focus-visible:border-border-strong focus-visible:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {conversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-bone-ghost">
            No conversations yet.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-bone-ghost">
            No conversations match.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {visible.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
