"use client";

import { useEffect, useState } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/store/chat-store";

export function Composer() {
  const [draft, setDraft] = useState("");
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  // Demo's word-by-word reveal and a live turn awaiting its reply are two
  // different pending states (see LiveTurn's own doc in chat-store.ts), but
  // the composer only cares that ONE of them is true -- "busy either way".
  const isStreaming = useChatStore((s) => s.streamingMessageId !== null || s.liveTurn !== null);
  const rejectedDraft = useChatStore((s) => s.rejectedDraft);
  const clearRejectedDraft = useChatStore((s) => s.clearRejectedDraft);

  const canSend = draft.trim().length > 0 && !isStreaming;

  // A send the daemon refused (409 busy, or unreachable) rolls its bubbles
  // back in the store, but the textarea was cleared the moment handleSend
  // ran -- so the toast said "try again" with the words already gone. Put
  // them back, unless the user started typing something new while the
  // request was in flight: overwriting THAT would be a second loss, and
  // nothing gates the textarea during the send (liveTurn is only set once
  // the response lands).
  useEffect(() => {
    if (rejectedDraft === null) return;
    setDraft((current) => (current.length > 0 ? current : rejectedDraft));
    clearRejectedDraft();
  }, [rejectedDraft, clearRejectedDraft]);

  function handleSend() {
    if (!canSend) return;
    sendMessage(draft);
    setDraft("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-border px-4 py-3 lg:px-8 lg:py-4">
      <div className="mx-auto flex max-w-3xl items-end gap-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Ask her something…"
          aria-label="Message"
          className="max-h-40 min-h-[44px] flex-1 resize-y rounded-md border border-border bg-card px-3 py-3 text-sm text-bone placeholder:text-bone-ghost focus-visible:border-border-strong focus-visible:outline-none"
        />
        {isStreaming ? (
          <Button variant="secondary" size="md" onClick={stopStreaming} aria-label="Stop generating">
            <Square size={14} />
            stop
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
          >
            <Send size={14} />
            send
          </Button>
        )}
      </div>
    </div>
  );
}
