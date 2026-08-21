"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/store/settings-store";

/** Mirrors useMemoryHydration and useFileHydration. */
export function useSettingsHydration() {
  useEffect(() => {
    void Promise.resolve(useSettingsStore.persist.rehydrate())
      .catch(() => {
        // onRehydrateStorage already falls back to no overrides.
      })
      .then(() => {
        useSettingsStore.setState({ hasHydrated: true });
      });
  }, []);
}
