"use client";

import { useEffect } from "react";
import { useFileStore } from "@/store/file-store";

/**
 * Mirrors hooks/useChatHydration.ts. The store is created with skipHydration so
 * it never reads localStorage during a server render.
 *
 * As with the chat store, onRehydrateStorage's callback mutates the draft
 * directly rather than calling set(), so the hasHydrated flip inside it is
 * silent -- subscribers never re-render. Re-assert it through a real set()
 * once rehydrate() resolves.
 */
export function useFileHydration() {
  useEffect(() => {
    void Promise.resolve(useFileStore.persist.rehydrate())
      .catch(() => {
        // Nothing recoverable here -- the store's onRehydrateStorage already
        // falls back to the pristine seed. Swallow so hasHydrated still flips.
      })
      .then(() => {
        useFileStore.setState({ hasHydrated: true });
      });
  }, []);
}
