import { useEffect } from "react";
import { useChatStore } from "@/store/chat-store";

/** Delay between streamed words. Fast enough to feel live, slow enough to read. */
const WORD_DELAY_MS = 55;

export function useMessageStream() {
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      timeoutId = setTimeout(() => {
        if (cancelled) return;

        const store = useChatStore.getState();
        const target = store.getStreamingTarget();

        if (!target) {
          // Self-heal a dangling streamingMessageId: it no longer resolves
          // to any message (e.g. its owning conversation was deleted, or a
          // persist rehydrate dropped a still-empty trailing assistant
          // message on the next mount). Without this, getStreamingTarget()
          // returns null forever and the composer stays soft-locked.
          if (store.streamingMessageId) store.stopStreaming();
          tick();
          return;
        }

        if (target.written.length >= target.fullText.length) {
          store.finishStreaming();
          tick();
          return;
        }

        // Advance by one whitespace-delimited word, keeping the original spacing.
        const remaining = target.fullText.slice(target.written.length);
        const match = remaining.match(/^\s*\S+/);
        const chunk = match ? match[0] : remaining;

        store.appendStreamChunk(target.messageId, chunk);
        tick();
      }, WORD_DELAY_MS);
    }

    tick();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);
}
