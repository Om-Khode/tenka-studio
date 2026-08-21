"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/chat";

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: {
  conversation: Conversation;
  isActive: boolean;
  /**
   * Fired after the store's selection changes, for a caller that has to react
   * to the CHOICE rather than to the resulting state. components/chat/
   * ChatPane.tsx is the one: below `lg` the list and the thread share the
   * width, so picking a conversation is also the gesture that closes the list.
   * Optional -- the desktop split has nothing to do here.
   */
  onSelect?: () => void;
}) {
  const renameConversation = useChatStore((s) => s.renameConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conversation.title);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isCancellingRef = useRef(false);

  // Keep the draft in sync with the stored title whenever we're not actively
  // editing: renameConversation() silently no-ops on blank input, and the
  // title can also change from outside this row while it stays mounted.
  // Without this, a rejected rename leaves a stale/blank draft behind for
  // the next time rename mode opens.
  useEffect(() => {
    if (!isRenaming) {
      setDraftTitle(conversation.title);
    }
  }, [conversation.title, isRenaming]);

  function commitRename() {
    if (isCancellingRef.current) return;
    renameConversation(conversation.id, draftTitle);
    setIsRenaming(false);
  }

  function cancelRename() {
    isCancellingRef.current = true;
    setDraftTitle(conversation.title);
    setIsRenaming(false);
  }

  // Delete is offered in live mode too, deliberately, and it is local-only:
  // it removes the Studio pane and nothing on the daemon. That is honest
  // rather than a gap. A pane is a local object with its own id (never the
  // daemon's session id -- see chat-store.ts's sendLiveMessage), the daemon
  // exposes no DELETE verb on any route (openapi.json has none at all), and
  // settleLiveTurn now merges this turn's reply into the pane that asked for
  // it instead of assigning the session transcript over it -- so a deleted
  // pane's turns no longer reappear inside a surviving one. Gating the
  // control in live mode would leave the only mode anyone actually runs with
  // no way to clear a pane, in exchange for a promise the wire cannot keep.
  if (isConfirmingDelete) {
    return (
      <div className="rounded-md border border-fail/40 bg-fail/5 p-3">
        <p className="text-xs text-bone">Delete this conversation?</p>
        <div className="mt-2 flex gap-2 font-mono text-[10px] uppercase tracking-wide">
          <button
            onClick={() => deleteConversation(conversation.id)}
            className="rounded-sm border border-fail/40 px-2 py-1 text-fail hover:bg-fail/10"
          >
            confirm
          </button>
          <button
            onClick={() => setIsConfirmingDelete(false)}
            className="rounded-sm border border-border px-2 py-1 text-bone-dim hover:border-border-strong"
          >
            cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`conversation-${conversation.id}`}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "group flex items-center gap-2 rounded-md px-3 py-2 transition-colors",
        isActive ? "bg-card text-bone" : "text-bone-dim hover:bg-card hover:text-bone"
      )}
    >
      {isRenaming ? (
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") cancelRename();
          }}
          aria-label="Conversation title"
          className="flex-1 rounded-sm border border-border-strong bg-bg px-1 py-0.5 text-sm text-bone focus-visible:outline-none"
        />
      ) : (
        <button
          onClick={() => {
            setActiveConversation(conversation.id);
            onSelect?.();
          }}
          onDoubleClick={() => {
            isCancellingRef.current = false;
            setIsRenaming(true);
          }}
          className="flex-1 truncate text-left text-sm"
          title={`${conversation.title} — double-click to rename`}
        >
          {conversation.title}
        </button>
      )}
      <button
        onClick={() => setIsConfirmingDelete(true)}
        aria-label="Delete conversation"
        className="text-bone-ghost opacity-0 transition-opacity hover:text-fail focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
