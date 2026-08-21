import { create } from "zustand";
import { getRepos } from "@/services/repo-registry";
import type { LoadStatus } from "@/types/action";
import type { PersonalityPayload } from "@/services/repos/types";

/**
 * Personality's own store (milestone 5b, Task 5) -- it used to live on the
 * settings store as a `select`-kind row (setDraft("personality", ...),
 * batched behind the global Save button), but that mechanism cannot occur
 * live at all: `runtime_config` has no enum cast to populate a select's
 * `options` with, so the daemon exposes personality through dedicated
 * `GET/PATCH /v1/personality` + `POST /v1/personality/reset` routes instead.
 * Reading is gated on `observe`; both writes on `system_control`
 * (`routes/settings.py`). A phone paired for conversation alone can see which
 * personality is active and cannot change it -- switching how she behaves is a
 * machine change, exactly like a runtime setting.
 *
 * `setBase`/`reset` apply immediately through PersonalityRepo, same as the
 * real PATCH does -- there is no draft/save step here the way the other ~39
 * settings have one, because the daemon does not have one either.
 *
 * Deliberately NOT persisted: `payload` is the daemon's (or the demo
 * repo's) own state, restated on every load(), not a local override to
 * survive a reload the way settings' `overrides` does.
 */
export interface PersonalityState {
  status: LoadStatus;
  payload: PersonalityPayload | null;
  saving: boolean;

  load: () => Promise<void>;
  /** Applies immediately. Rejects on a daemon error -- callers toast it. */
  setBase: (base: string) => Promise<void>;
  /** Applies immediately. Rejects on a daemon error -- callers toast it. */
  reset: () => Promise<void>;
}

export const usePersonalityStore = create<PersonalityState>((set) => ({
  status: "idle",
  payload: null,
  saving: false,

  load: async () => {
    set({ status: "loading" });
    try {
      const payload = await getRepos().personality.load();
      set({ payload, status: "ready" });
    } catch {
      // An uncaught rejection would otherwise leave status stuck on
      // "loading" forever instead of reaching PersonalityPanel's error
      // branch, same reasoning as memory-store/settings-store's load().
      set({ status: "error" });
    }
  },

  setBase: async (base) => {
    set({ saving: true });
    // finally, not a trailing set() after the await: a rejected PATCH must
    // not leave `saving` stuck true and the picker permanently disabled --
    // the reject itself still propagates, so the caller's own catch is what
    // decides whether that failure becomes a toast.
    try {
      const payload = await getRepos().personality.setBase(base);
      set({ payload });
    } finally {
      set({ saving: false });
    }
  },

  reset: async () => {
    set({ saving: true });
    try {
      const payload = await getRepos().personality.reset();
      set({ payload });
    } finally {
      set({ saving: false });
    }
  },
}));
