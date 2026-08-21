"use client";

import { MarkdownContent } from "./MarkdownContent";
import { MessageActions } from "./MessageActions";
import { useChatStore } from "@/store/chat-store";
import { getRepoMode } from "@/services/repo-registry";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/chat";

export function MessageBubble({
  message,
  isStreaming,
  isLastAssistant,
}: {
  message: Message;
  isStreaming: boolean;
  /** Only the conversation's last assistant message may be regenerated. */
  isLastAssistant: boolean;
}) {
  const regenerateLast = useChatStore((s) => s.regenerateLast);
  const isUser = message.role === "user";
  // regenerateLast() returns immediately in live mode -- it can only cycle
  // chat-scripts.ts's scripted variants, which would replace her real reply
  // with fabricated demo text. Offering an enabled button for that is worse
  // than offering none: it did nothing, silently, with no toast. Not turned
  // into a real re-send instead, because ChatRepo only has sendMessage(text)
  // and the daemon appends -- the user would get a duplicate question and a
  // second answer under a button labelled "regenerate".
  // `=== "demo"` (Task 12), matching chat-store's own guard exactly: an
  // unbound registry is not a licence to fabricate either, and a button that
  // disagreed with the action about which modes count would be back to doing
  // nothing silently.
  const canRegenerate = isLastAssistant && getRepoMode() === "demo";

  return (
    <div
      data-testid={`message-${message.id}`}
      data-role={message.role}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-3",
          isUser
            ? "border border-border bg-card text-sm text-bone"
            : "bg-transparent"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <MarkdownContent content={message.content} />
            {isStreaming ? (
              <span
                data-testid="stream-caret"
                className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-bone align-middle"
              />
            ) : (
              <MessageActions
                content={message.content}
                onRegenerate={regenerateLast}
                canRegenerate={canRegenerate}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
