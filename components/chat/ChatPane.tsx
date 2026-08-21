"use client";

import { useState } from "react";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { Composer } from "./Composer";
import { cn } from "@/lib/utils";

/**
 * The chat page's layout, shared by /demo/chat and /app/chat -- the two pages
 * differ only in whether they mount useMessageStream (see app/app/chat/
 * page.tsx), and that difference does not reach in here.
 *
 * Desktop is the list beside the thread, unchanged. Below `lg` there is only
 * room for one of them, so the pane shows one at a time.
 *
 * Thread-first, and the list is the thing you go and get -- the inverse of
 * Memory and Files, which show their list first. `activeConversationId` is
 * never null (chat-store always has one selected), so a list-first phone view
 * would appear on the very first render and never again; and the thread is
 * what a chat page is *for*, while the list is navigation between threads.
 *
 * Local state rather than the store: which pane a narrow viewport is showing
 * is this component's business and nothing else's, it must not persist across
 * a reload the way chat-store's contents do, and the desktop split ignores it
 * entirely. Both panes stay mounted and are toggled with `hidden lg:flex`, so
 * neither the thread's scroll position nor an in-flight turn is lost by
 * looking at the list.
 */
export function ChatPane() {
  const [showList, setShowList] = useState(false);

  return (
    <div className="flex h-full overflow-hidden rounded-lg border border-border">
      {/* flex-1 below `lg`, where this pane is the whole width; lg:flex-none
          above it, so ConversationList's own `lg:w-64` is what sizes the
          column and the thread keeps the rest. */}
      <div className={cn("min-h-0 flex-1 lg:flex lg:flex-none", showList ? "flex" : "hidden")}>
        {/* The way out without choosing anything. Picking a conversation also
            closes the list -- that is ConversationList's `onSelect` below --
            but a user who opened it to look must not be stuck here. */}
        <div className="flex min-h-0 w-full flex-col">
          <button
            type="button"
            onClick={() => setShowList(false)}
            className="flex items-center gap-2 border-b border-border px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-bone-dim transition-colors hover:text-bone lg:hidden"
          >
            <ArrowLeft size={14} aria-hidden />
            back to chat
          </button>
          <ConversationList onSelect={() => setShowList(false)} />
        </div>
      </div>

      <div className={cn("flex-1 flex-col overflow-hidden lg:flex", showList ? "hidden" : "flex")}>
        <button
          type="button"
          onClick={() => setShowList(true)}
          className="flex items-center gap-2 border-b border-border px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-bone-dim transition-colors hover:text-bone lg:hidden"
        >
          <MessagesSquare size={14} aria-hidden />
          conversations
        </button>
        <MessageThread />
        <Composer />
      </div>
    </div>
  );
}
