"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { useChatStore } from "@/store/chat-store";

// How far from the bottom, in px, still counts as "following the stream". A
// little slack absorbs the chunk that lands between a scroll event and the
// effect that reacts to it, so ordinary streaming never unpins itself.
const PIN_SLACK_PX = 64;

// The jump button needs a much coarser threshold than the pin: nudging a few
// lines up should quietly stop the auto-follow, not throw a control on screen.
// Half a viewport scales with the window; the floor keeps it sane when short.
const JUMP_VISIBLE_FLOOR_PX = 200;

function jumpThreshold(clientHeight: number) {
  return Math.max(JUMP_VISIBLE_FLOOR_PX, clientHeight * 0.5);
}

export function MessageThread() {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  // A live turn's placeholder bubble gets the same pulsing-caret treatment
  // as a demo stream in progress -- there is no partial text to reveal (no
  // token frame exists on the wire), so this is the only signal a live
  // reply is still pending rather than the daemon having sent back nothing.
  const liveAssistantMessageId = useChatStore((s) => s.liveTurn?.assistantMessageId ?? null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Whether the thread should follow new content. Starts true and only goes
  // false when the reader scrolls up — a ref, not state, so tracking the
  // scroll position never re-renders the thread mid-stream.
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const conversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;
  const messages = conversation?.messages ?? [];
  const lastContent = messages[messages.length - 1]?.content ?? "";
  // Only the final assistant message may be regenerated — the store's
  // regenerateLast() always targets it, so offering the button on an older
  // bubble would silently rewrite a different message.
  const lastAssistantId =
    [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;

  const messageCount = messages.length;

  // Re-reads the live scroll position. setShowJump with an unchanged value is
  // a no-op in React, so the per-chunk calls below cost nothing while the
  // reader is following along.
  function syncScrollState() {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distance <= PIN_SLACK_PX;
    setShowJump(distance > jumpThreshold(el.clientHeight));
  }

  function jumpToBottom() {
    pinnedRef.current = true;
    setShowJump(false);
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  // A new message — the user sending, or a fresh assistant turn — re-pins.
  // Growing content inside the message already on screen does not, which is
  // what lets the reader scroll up mid-stream and stay there. Declared before
  // the scroll effect so it runs first on the render that adds the message.
  useEffect(() => {
    pinnedRef.current = true;
    setShowJump(false);
  }, [messageCount, activeConversationId]);

  useEffect(() => {
    if (pinnedRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
      return;
    }
    // Unpinned: the reader is stationary but the thread is growing beneath
    // them, so the distance to the bottom changes with no scroll event to
    // announce it. Re-measure or the button would never appear.
    syncScrollState();
  }, [messageCount, lastContent]);

  if (!conversation) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-bone-ghost">Start a conversation.</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <div>
          <p className="font-display text-lg font-bold text-bone">
            She&apos;s listening.
          </p>
          <p className="mt-2 text-sm text-bone-dim">
            Ask her about routing, cost, or memory.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        onScroll={syncScrollState}
        data-testid="thread-scroller"
        className="flex-1 overflow-y-auto px-8 py-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isStreaming={message.id === streamingMessageId || message.id === liveAssistantMessageId}
              isLastAssistant={message.id === lastAssistantId}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Opaque, not translucent: the disc floats over live text, and letting
          the words show through it reads as a rendering glitch. */}
      {showJump && (
        <button
          type="button"
          onClick={jumpToBottom}
          data-testid="jump-to-bottom"
          aria-label="Scroll to latest message"
          className="absolute bottom-5 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border-strong bg-bg text-bone-dim shadow-lg transition hover:border-amber hover:text-amber"
        >
          <ArrowDown className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
