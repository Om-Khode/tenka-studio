"use client";

import { useEffect } from "react";
import { useMemoryStore } from "@/store/memory-store";

/**
 * Mirrors hooks/useFileHydration.ts. The store is created with skipHydration
 * so it never reads localStorage during a server render. onRehydrateStorage
 * mutates the draft directly, so the hasHydrated flip inside it is silent --
 * re-assert it through a real set() once rehydrate() resolves.
 */
export function useMemoryHydration() {
  useEffect(() => {
    void Promise.resolve(useMemoryStore.persist.rehydrate())
      .catch(() => {
        // The store's onRehydrateStorage already falls back to an empty
        // overlay. Swallow so hasHydrated still flips.
      })
      .then(() => {
        useMemoryStore.setState({ hasHydrated: true });
      });
  }, []);
}
