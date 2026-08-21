import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SETTINGS_REGISTRY, findSetting } from "./settings-registry";
import { getRepos, getRepoMode, namespacedStorage } from "@/services/repo-registry";
import { ApiError } from "@/services/http";
import type { ActionResult, LoadStatus } from "@/types/action";
import type { SaveOutcome, SettingDef, SettingValue } from "@/types/settings";

// The demo repository's scripted constants (REJECTED_KEY, REJECTED_REASON,
// SETTINGS_LOAD_DELAY_MS, SETTINGS_SAVE_DELAY_MS) used to be re-exported from
// here for test back-compat. They are demo fixtures, and the entire live tree
// imports this store -- so every live bundle carried a "camera is in use by
// another process" string it can never produce. The two test files that read
// them now import them from services/repos/demo/settings.ts, where they live.

export interface SettingsState {
  status: LoadStatus;
  hasHydrated: boolean;
  saving: boolean;

  /**
   * The current def list, daemon-first (milestone 5b, Task 5). Seeded to
   * the static registry so pre-load reads (and every one of demo's ~180
   * pre-existing tests, which never call load()) behave exactly as before
   * this field existed; load() replaces it wholesale with whatever the
   * configured repository resolves -- demo hands back the registry
   * unchanged, HttpSettingsRepo hands back the daemon's rows merged with
   * the registry's presentation data. This is deliberately NOT persisted:
   * a stale def list surviving a reload could describe a setting the
   * daemon has since stopped reporting.
   */
  defs: SettingDef[];
  /** Only what differs from the registry default. */
  overrides: Record<string, SettingValue>;
  /** Unsaved edits. */
  drafts: Record<string, SettingValue>;
  /** Per-key save failures, cleared when the key is edited again. */
  errors: Record<string, string>;
  /** Applied keys whose change needs a restart to take effect. */
  pendingRestart: string[];

  query: string;
  activeGroup: string | null;

  load: () => Promise<void>;
  setDraft: (key: string, value: SettingValue) => void;
  resetKey: (key: string) => void;
  revertAll: () => void;
  /**
   * Async and result-bearing since the milestone-5b fix round: in live mode
   * this is a real PATCH that can be partly refused or refused outright, and
   * the caller must report what actually happened rather than assuming.
   */
  resetAllToDefaults: () => Promise<ActionResult>;
  save: () => Promise<SaveOutcome>;
  dismissRestart: () => void;
  setQuery: (query: string) => void;
  setActiveGroup: (group: string | null) => void;
}

/**
 * Fix round, milestone 5b Task 5: `overrides` used to survive every
 * load() untouched, which meant a local save could shadow the daemon
 * forever. TENKA's settings change out of band by design -- a voice
 * phrase, `/set <key> <value>`, another Studio tab -- so a stale
 * `overrides["tts_speed"] = 1.4` sitting in localStorage would keep
 * outvoting a freshly-loaded `def.value = 1.1` on every read, looking
 * clean (not dirty) while showing a value the assistant is not using.
 *
 * The daemon is authoritative the moment a fresh load states a value for
 * a key, so that key's override is dropped here unconditionally -- not
 * only when it disagrees, because "happens to still match" and "is still
 * the source of truth" are different claims and only load() can tell
 * them apart. A def with no stated `value` (demo's registry-only defs
 * never set this field) leaves the matching override untouched, which is
 * what keeps this from wiping every override on every demo load() --
 * demo has no daemon to defer to, so nothing here is entitled to overrule
 * a saved local change.
 */
function reconcileOverrides(
  overrides: Record<string, SettingValue>,
  defs: SettingDef[],
): Record<string, SettingValue> {
  const next = { ...overrides };
  for (const def of defs) {
    if (def.value !== undefined && def.key in next) {
      delete next[def.key];
    }
  }
  return next;
}

/**
 * A key the daemon currently holds at something other than its default, and
 * that the user is actually allowed to change.
 *
 * `value === undefined` means nothing has stated a current value at all
 * (demo's registry-only defs are like this) -- there is nothing to PATCH
 * back, and the local override IS the saved state there. `source === "env"`
 * means the assistant will not accept a change to that key no matter who
 * asks (SettingRow renders those locked), so including one buys a guaranteed
 * rejection and nothing else.
 */
/**
 * Keys whose default would sever the connection Studio is issuing the request
 * over. `studio_api_enabled` defaults to false, so a reset-all sent from
 * Studio switched off the daemon Studio was talking to -- the request
 * succeeded and the next one could not be made. Port and origins are the same
 * shape: reset either and the browser can no longer reach her.
 *
 * Matched by prefix rather than listed one by one, so a fourth studio_api_*
 * setting is covered the day it is added rather than the day someone notices.
 * These stay individually resettable in the per-key control, where the user is
 * choosing this key deliberately; what is excluded is sweeping them up in a
 * bulk action aimed at something else entirely.
 */
const SELF_SEVERING_PREFIX = "studio_api_";

function isResettable(def: SettingDef): boolean {
  return def.value !== undefined && def.value !== def.default && def.source !== "env";
}

/**
 * Reset-all's stricter predicate. Everything `isResettable` allows, minus the
 * keys that would cut the connection carrying the request -- see
 * SELF_SEVERING_PREFIX. Per-key reset deliberately still uses the looser one:
 * there the user has picked that single key and can see what it is.
 */
function isBulkResettable(def: SettingDef): boolean {
  return isResettable(def) && !def.key.startsWith(SELF_SEVERING_PREFIX);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      status: "idle",
      hasHydrated: false,
      saving: false,

      defs: SETTINGS_REGISTRY,
      overrides: {},
      drafts: {},
      errors: {},
      pendingRestart: [],

      query: "",
      activeGroup: null,

      load: async () => {
        set({ status: "loading" });
        try {
          const defs = await getRepos().settings.load();
          set((s) => ({ defs, overrides: reconcileOverrides(s.overrides, defs), status: "ready" }));
        } catch {
          // An uncaught rejection would otherwise leave status stuck on
          // "loading" with no way to reach a retry. `defs` is deliberately
          // left as whatever it was -- the error branch renders instead of
          // the rows, so a stale list sitting unused in state is harmless.
          set({ status: "error" });
        }
      },

      setDraft: (key, value) =>
        set((s) => {
          const errors = { ...s.errors };
          delete errors[key];
          return { drafts: { ...s.drafts, [key]: value }, errors };
        }),

      /**
       * Fix round, milestone 5b: dropping the local override is the whole
       * reset only where the override is the whole saved state -- demo.
       * Live, `reconcileOverrides` has already emptied `overrides` for every
       * key the daemon stated a value for, so this deleted nothing, the row
       * snapped back to the daemon's CURRENT value (not the default), the
       * daemon was never told, and the button stayed on screen because the
       * value was still non-default. Same false affordance as
       * resetAllToDefaults' was.
       *
       * So when the daemon owns the key, this stages the default as a draft
       * instead. That is not a lesser fix: every other control on this page
       * stages, the SaveBar is the one thing that writes, and the row's
       * reset button sits inline with its control with no confirmation of
       * its own. Making it the only inline control that writes immediately
       * would be the odd one out -- and it would need its own async error
       * surface for a PATCH that can be refused per key, which the SaveBar
       * already has. (DangerZone's reset-all does write immediately: it is
       * a danger-zone action behind a confirm dialog, not an inline one.)
       */
      resetKey: (key) =>
        set((s) => {
          const overrides = { ...s.overrides };
          const drafts = { ...s.drafts };
          const errors = { ...s.errors };
          delete overrides[key];
          delete drafts[key];
          delete errors[key];

          const def = s.defs.find((d) => d.key === key);
          if (def && isResettable(def)) drafts[key] = def.default;

          return { overrides, drafts, errors };
        }),

      revertAll: () => set({ drafts: {}, errors: {} }),

      /**
       * Critical, milestone 5b fix round. This used to be
       * `set({ overrides: {}, drafts: {}, errors: {} })` and DangerZone
       * toasted "Every value is back to its default" unconditionally after
       * it. Live, that is not a partial fix or a visible no-op -- it is
       * nothing at all: `HttpSettingsRepo.load()` states a `value` on every
       * row, `reconcileOverrides` therefore deletes every override for a
       * daemon-known key on every load, and clearing an already-empty map
       * changes no byte anywhere. The user was told, after a confirm dialog,
       * that (for instance) `listen_to_everyone` -- "speaker verification is
       * disabled, anyone can issue commands" -- was back to default while it
       * stayed exactly as it was on her machine.
       *
       * Live now builds the patch from the defs themselves and reports what
       * the daemon said, including a partial refusal. Demo still clears
       * local state, because there the overrides genuinely ARE the saved
       * values and there is no daemon to tell.
       */
      resetAllToDefaults: async () => {
        // `=== "demo"`, not `!== "live"`: an unbound registry must fall
        // through to the live path and fail closed on getRepos(), not
        // silently "succeed" by clearing local state. Same reasoning as
        // system-store's three branches.
        if (getRepoMode() === "demo") {
          set({ overrides: {}, drafts: {}, errors: {} });
          return { ok: true, title: "Settings reset", detail: "Every value is back to its default." };
        }

        // A failed or unfinished load leaves `defs` seeded to the static
        // registry, whose rows carry no `value` at all -- the patch would
        // come out empty and this would report "nothing to reset" about a
        // machine it has never successfully asked.
        if (get().status !== "ready") {
          return {
            ok: false,
            title: "She hasn't loaded her settings",
            detail: "Nothing was changed.",
          };
        }

        const defs = get().defs;
        const resettable = defs.filter(isBulkResettable);
        // Counted, not patched: an env-owned row cannot be reset from here
        // by anyone, so a truthful "every value is back to its default"
        // cannot be said while one is non-default.
        const envLocked = defs.filter(
          (d) => d.source === "env" && d.value !== undefined && d.value !== d.default,
        ).length;

        if (resettable.length === 0) {
          return envLocked === 0
            ? { ok: true, title: "Nothing to reset", detail: "Every value is already its default." }
            : {
                ok: false,
                title: "Nothing here can be reset",
                detail: `${envLocked} non-default ${envLocked === 1 ? "setting is" : "settings are"} owned by an environment variable — change those where she is launched.`,
              };
        }

        const patch = Object.fromEntries(resettable.map((d) => [d.key, d.default]));

        set({ saving: true });
        try {
          const outcome = await getRepos().settings.save(patch);
          const applied = new Set(outcome.applied);

          set((s) => {
            const overrides = { ...s.overrides };
            const drafts = { ...s.drafts };
            const errors = { ...s.errors };
            for (const key of applied) {
              delete overrides[key];
              delete drafts[key];
              delete errors[key];
            }
            for (const failure of outcome.failed) errors[failure.key] = failure.reason;
            return {
              // The daemon has just said these keys took their defaults, so
              // the def list must say so too -- otherwise the row keeps
              // rendering the old value and offering its reset button, and
              // the next reset-all re-sends a patch that has already landed.
              defs: s.defs.map((d) => (applied.has(d.key) ? { ...d, value: d.default } : d)),
              overrides,
              drafts,
              errors,
              pendingRestart: [...new Set([...s.pendingRestart, ...outcome.needsRestart])],
            };
          });

          if (outcome.failed.length > 0) {
            return {
              ok: false,
              title: `${outcome.applied.length} reset, ${outcome.failed.length} refused`,
              detail: outcome.failed[0].reason,
            };
          }
          if (outcome.applied.length === 0) {
            // A non-empty patch that comes back with nothing applied and
            // nothing refused means the daemon accounted for none of it. This
            // daemon always puts every key in one bucket or the other, so it is
            // unreachable today -- but reporting "back to default" on a save
            // that demonstrably did nothing is the precise shape of the bug
            // this action exists to fix, and it should not be one contract
            // change away from returning.
            return {
              ok: false,
              title: "Nothing was reset",
              detail: "She acknowledged the request without applying any of it.",
            };
          }
          return {
            ok: true,
            title: "Settings reset",
            detail:
              envLocked === 0
                ? `${outcome.applied.length} back to default.`
                : `${outcome.applied.length} back to default; ${envLocked} left as the environment sets them.`,
          };
        } catch (err) {
          // PATCH /v1/settings is gated on `system_control`
          // (routes/settings.py:66) while GET /v1/settings needs only
          // `observe` (:31) -- `chat_send` gates neither, so a device paired
          // only for conversation can read settings and gets a 403 here, which
          // is not "she is unreachable".
          const denied = err instanceof ApiError && err.status === 403;
          return {
            ok: false,
            title: denied ? "This device may not do that" : "Could not reset her settings",
            detail: denied
              ? "Changing settings needs a grant this device doesn't have."
              : err instanceof Error
                ? err.message
                : undefined,
          };
        } finally {
          set({ saving: false });
        }
      },

      save: async () => {
        const dirty = selectDirtyKeys(get());
        if (dirty.length === 0) return { applied: [], failed: [], needsRestart: [] };
        const patch = Object.fromEntries(dirty.map((key) => [key, get().drafts[key]]));

        set({ saving: true });
        // finally, not a trailing set() after the await: nothing between
        // saving:true and here can throw in the demo (the delay cannot
        // reject and the repository's own filtering is pure), but when this
        // becomes a real PATCH /settings, a rejection would otherwise leave
        // `saving` stuck true and Save permanently disabled.
        try {
          const outcome = await getRepos().settings.save(patch);

          set((s) => {
            const overrides = { ...s.overrides };
            const drafts = { ...s.drafts };
            for (const key of outcome.applied) {
              overrides[key] = drafts[key];
              delete drafts[key];
            }
            return {
              overrides,
              drafts,
              errors: Object.fromEntries(outcome.failed.map((f) => [f.key, f.reason])),
              pendingRestart: [...new Set([...s.pendingRestart, ...outcome.needsRestart])],
            };
          });

          return outcome;
        } finally {
          set({ saving: false });
        }
      },

      dismissRestart: () => set({ pendingRestart: [] }),
      setQuery: (query) => set({ query }),
      setActiveGroup: (activeGroup) => set({ activeGroup }),
    }),
    {
      name: "tenka-studio-settings",
      storage: namespacedStorage<{ overrides: Record<string, SettingValue> }>(),
      skipHydration: true,
      // Only the overrides. Persisting all 40 values would write the defaults
      // too, and a later registry change would then be shadowed by the blob.
      partialize: (state) => ({ overrides: state.overrides }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        try {
          const o = state.overrides as unknown;
          const ok = typeof o === "object" && o !== null && !Array.isArray(o);
          // Drop keys the registry no longer knows: a removed setting must not
          // linger as an invisible override.
          state.overrides = ok
            ? Object.fromEntries(
                Object.entries(o as Record<string, SettingValue>).filter(([k]) => findSetting(k)),
              )
            : {};
        } catch {
          state.overrides = {};
        }
        state.hasHydrated = true;
      },
    },
  ),
);

// ─── Selectors ────────────────────────────────────────────────────────────

/**
 * Override wins (a save this session promoted it there) over the loaded
 * def's own `value` (what the daemon most recently stated outright, or
 * nothing at all in demo mode) over the def's static `default`. Falls back
 * to `findSetting()`'s registry default only if `state.defs` somehow has no
 * entry for `key` at all -- defensive, not a path any repository is
 * expected to hit once load() has run once.
 */
export function savedValue(state: SettingsState, key: string): SettingValue {
  if (key in state.overrides) return state.overrides[key];
  const def = state.defs.find((d) => d.key === key);
  if (def?.value !== undefined) return def.value;
  return def?.default ?? findSetting(key)?.default ?? "";
}

/** Draft wins over override wins over the loaded value wins over default. */
export function effectiveValue(state: SettingsState, key: string): SettingValue {
  if (key in state.drafts) return state.drafts[key];
  return savedValue(state, key);
}

export function selectDirtyKeys(state: SettingsState): string[] {
  return Object.keys(state.drafts).filter((key) => state.drafts[key] !== savedValue(state, key));
}

export function selectVisibleDefs(state: SettingsState): SettingDef[] {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.defs;
  return state.defs.filter((def) =>
    `${def.key} ${def.label} ${def.description}`.toLowerCase().includes(q),
  );
}

/**
 * Groups in `state.defs`'s own order, de-duplicated. Replaces the static
 * `SETTING_GROUPS` export as the nav's source once the def list itself is
 * dynamic (milestone 5b, Task 5): a daemon-only key merged into a group the
 * registry never named would otherwise render nowhere at all, because
 * nothing would ever list that group to iterate over.
 */
export function selectGroups(state: SettingsState): string[] {
  return [...new Set(state.defs.map((d) => d.group))];
}
