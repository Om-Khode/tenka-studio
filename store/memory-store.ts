import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getRepos, namespacedStorage } from "@/services/repo-registry";
import { ApiError } from "@/services/http";
import { useToastStore } from "./toast-store";
import type { ActionResult, LoadStatus } from "@/types/action";
import type {
  Entity, Fact, Relationship, Preference, Procedure,
  MemoryScope, EntitySort, MemoryOverlay, FactGroup,
} from "@/types/memory";

/** Matches the assistant's get_facts_for_entity(limit=20). */
export const FACTS_PAGE_SIZE = 20;

const EMPTY_OVERLAY: MemoryOverlay = {
  forgottenEntities: [],
  forgottenPreferences: [],
  forgottenProcedures: [],
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export interface NeighborLink {
  relationship: Relationship;
  entity: Entity;
}

export interface MemoryState {
  status: LoadStatus;
  hasHydrated: boolean;

  entities: Entity[];
  facts: Fact[];
  relationships: Relationship[];
  preferences: Preference[];
  procedures: Procedure[];
  overlay: MemoryOverlay;

  scope: MemoryScope;
  query: string;
  typeFilter: string | null;
  sort: EntitySort;
  selectedId: number | null;

  load: () => Promise<void>;
  setScope: (scope: MemoryScope) => void;
  setQuery: (query: string) => void;
  setTypeFilter: (type: string | null) => void;
  setSort: (sort: EntitySort) => void;
  select: (id: number | null) => void;

  forgetEntity: (id: number) => void;
  forgetPreference: (key: string) => void;
  forgetProcedure: (id: number) => void;
  forgetAll: () => Promise<ActionResult>;
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      status: "idle",
      hasHydrated: false,

      entities: [],
      facts: [],
      relationships: [],
      preferences: [],
      procedures: [],
      overlay: EMPTY_OVERLAY,

      scope: "knowledge",
      query: "",
      typeFilter: null,
      sort: "facts",
      selectedId: null,

      /**
       * The repository owns the latency now (DemoMemoryRepo keeps the same
       * scripted delay memory-scripts.ts used to run inline) -- components
       * still render their skeleton and error branches against it, and
       * HttpMemoryRepo drops straight in without this store noticing.
       */
      load: async () => {
        set({ status: "loading" });
        try {
          const snapshot = await getRepos().memory.load();
          set({ ...snapshot, status: "ready" });
        } catch {
          // An uncaught rejection would otherwise leave status stuck on
          // "loading" forever instead of reaching the error branch
          // EntityList already renders for it.
          set({ status: "error" });
        }
      },

      setScope: (scope) => set({ scope, selectedId: null, query: "" }),
      setQuery: (query) => set({ query, selectedId: null }),
      setTypeFilter: (typeFilter) => set({ typeFilter }),
      setSort: (sort) => set({ sort }),
      select: (selectedId) => set({ selectedId }),

      /**
       * Milestone-4 blocker 5: before this task, forgetting only ever wrote
       * the local overlay -- memory-store.ts never called the repository at
       * all, in either mode, so a live "forget" never told the daemon
       * anything. It genuinely still knew, forever. The three item-level
       * forgets below stay void-returning (their existing callers --
       * KnowledgeDetail.tsx, PreferenceDetail.tsx, ProcedureDetail.tsx --
       * call them synchronously and push their own success toast right
       * after, and are not this task's files to change), so this applies
       * the overlay OPTIMISTICALLY, synchronously, exactly as before, and
       * only reverts it if the repository call that follows is refused.
       * DemoMemoryRepo.forget() is a no-op that always resolves (see its own
       * doc comment), so the revert path never runs in demo -- the overlay
       * is genuinely the only thing that makes forgetting stick there.
       * HttpMemoryRepo.forget() is a real DELETE: if the daemon refuses it,
       * the revert below is what keeps the row from lying about being gone
       * on the next reload.
       */
      forgetEntity: (id) => {
        set((s) => ({
          overlay: { ...s.overlay, forgottenEntities: [...s.overlay.forgottenEntities, id] },
          selectedId: s.selectedId === id ? null : s.selectedId,
        }));
        getRepos()
          .memory.forget("knowledge", String(id))
          .catch((err: unknown) => {
            set((s) => ({
              overlay: {
                ...s.overlay,
                forgottenEntities: s.overlay.forgottenEntities.filter((x) => x !== id),
              },
            }));
            useToastStore.getState().push({
              ok: false,
              title: "Could not forget that",
              detail: err instanceof Error ? err.message : "She still knows it.",
            });
          });
      },

      forgetPreference: (key) => {
        set((s) => ({
          overlay: { ...s.overlay, forgottenPreferences: [...s.overlay.forgottenPreferences, key] },
          // selectedId here is an INDEX into the visible preferences list, not
          // a key -- there is no id to compare against, so the index must
          // always clear. Left stale, it resolves to whichever preference
          // slides into that slot once the list shrinks by one.
          selectedId: null,
        }));
        getRepos()
          .memory.forget("preferences", key)
          .catch((err: unknown) => {
            set((s) => ({
              overlay: {
                ...s.overlay,
                forgottenPreferences: s.overlay.forgottenPreferences.filter((x) => x !== key),
              },
            }));
            useToastStore.getState().push({
              ok: false,
              title: "Could not forget that",
              detail: err instanceof Error ? err.message : "She still knows it.",
            });
          });
      },

      forgetProcedure: (id) => {
        set((s) => ({
          overlay: { ...s.overlay, forgottenProcedures: [...s.overlay.forgottenProcedures, id] },
          // Procedures select by id, so only clear when the forgotten one was
          // actually selected -- mirrors forgetEntity.
          selectedId: s.selectedId === id ? null : s.selectedId,
        }));
        getRepos()
          .memory.forget("procedures", String(id))
          .catch((err: unknown) => {
            set((s) => ({
              overlay: {
                ...s.overlay,
                forgottenProcedures: s.overlay.forgottenProcedures.filter((x) => x !== id),
              },
            }));
            useToastStore.getState().push({
              ok: false,
              title: "Could not forget that",
              detail: err instanceof Error ? err.message : "She still knows it.",
            });
          });
      },

      /**
       * Milestone-4 blocker 2: a failed load() leaves entities/preferences/
       * procedures empty -- not "she knows nothing," but "Studio couldn't
       * ask." Without this guard, forgetAll() would write an empty overlay
       * over whatever real one was already persisted from a previous
       * session and report success, hiding a real dataset behind a lie of
       * "forgot everything" the very first time a load failed.
       *
       * Same optimistic-then-revert shape as the three item-level forgets
       * above, and for the same reason: Sidebar's memory badge and
       * EntityList both call this synchronously today, with no await, and
       * are not this task's files to change. The guard and the optimistic
       * `set()` both happen before the one `await`, so they still run
       * synchronously on call; only the eventual outcome -- what
       * DangerZone.tsx (this task's file) awaits to pick the toast, 403
       * included -- resolves later. `system_control` (not `chat_send`) gates
       * this route, so a caller must be able to tell "this device may not
       * do that" apart from any other failure.
       */
      forgetAll: async () => {
        const s = get();
        if (s.status !== "ready") {
          return {
            ok: false,
            title: "Not ready yet",
            detail: "Her memory hasn't finished loading.",
          };
        }
        const snapshot = s.overlay;
        set({
          overlay: {
            forgottenEntities: s.entities.map((e) => e.id),
            forgottenPreferences: s.preferences.map((p) => p.key),
            forgottenProcedures: s.procedures.map((p) => p.id),
          },
          selectedId: null,
        });
        try {
          await getRepos().memory.forgetAll();
          return { ok: true, title: "Forgot everything", detail: "She starts from nothing." };
        } catch (err) {
          set({ overlay: snapshot });
          const denied = err instanceof ApiError && err.status === 403;
          return {
            ok: false,
            title: denied ? "This device may not do that" : "Could not forget everything",
            detail: denied
              ? "Forgetting everything needs a grant this device doesn't have."
              : err instanceof Error
                ? err.message
                : undefined,
          };
        }
      },
    }),
    {
      name: "tenka-studio-memory",
      storage: namespacedStorage<Pick<MemoryState, "overlay">>(),
      skipHydration: true,
      /**
       * Only the diff. Persisting the dataset would write the whole seed on
       * every forget and would shadow a seed change after a code update.
       */
      partialize: (state) => ({ overlay: state.overlay }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // A hand-edited or version-skewed payload must never take the route
        // down; falling back to "forgot nothing" is always safe.
        try {
          const o = state.overlay as unknown;
          const ok =
            isPlainObject(o) &&
            Array.isArray(o.forgottenEntities) &&
            Array.isArray(o.forgottenPreferences) &&
            Array.isArray(o.forgottenProcedures);
          if (!ok) state.overlay = EMPTY_OVERLAY;
        } catch {
          state.overlay = EMPTY_OVERLAY;
        }
        state.hasHydrated = true;
      },
    },
  ),
);

// ─── Selectors ────────────────────────────────────────────────────────────

function liveEntities(state: MemoryState): Entity[] {
  const gone = new Set(state.overlay.forgottenEntities);
  return state.entities.filter((e) => !gone.has(e.id));
}

/**
 * Takes only the slice it reads, so a component that subscribes narrowly to
 * `facts` (Task 12's selector convention) can call it without holding the
 * whole store. `selectVisibleEntities` below still passes the full state,
 * which satisfies the same `Pick`.
 */
export function factCountFor(state: Pick<MemoryState, "facts">, entityId: number): number {
  return state.facts.filter((f) => f.subjectId === entityId && f.invalidAt === null).length;
}

export function selectEntityTypes(state: MemoryState): string[] {
  return [...new Set(liveEntities(state).map((e) => e.type))].sort();
}

export function selectVisibleEntities(state: MemoryState): Entity[] {
  const q = state.query.trim().toLowerCase();
  const filtered = liveEntities(state).filter((e) => {
    if (state.typeFilter && e.type !== state.typeFilter) return false;
    if (!q) return true;
    return e.displayName.toLowerCase().includes(q) || e.canonicalName.toLowerCase().includes(q);
  });

  return [...filtered].sort((a, b) => {
    if (state.sort === "name") return a.displayName.localeCompare(b.displayName);
    if (state.sort === "recent") return b.updatedAt.localeCompare(a.updatedAt);
    const diff = factCountFor(state, b.id) - factCountFor(state, a.id);
    return diff !== 0 ? diff : a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Groups a subject's facts by predicate. The current value is the one with no
 * invalidAt; everything else it replaced hangs off it, newest first. A
 * predicate whose every fact is superseded still shows -- the newest one
 * leads, which is honest about what she last believed.
 *
 * MUST NOT be used as a `useShallow` selector, unlike selectVisible* above.
 * Every `FactGroup` it returns is a freshly-built object, so a shallow
 * element-wise compare never matches the previous result: React would see
 * `getSnapshot` return a different value on two calls within one render and
 * loop. Callers subscribe to the raw `facts`/`overlay` slices -- which ARE
 * stable references -- and call this in the render body instead, which is why
 * the parameter is a `Pick` rather than the whole state.
 */
export function selectFactGroupsFor(
  state: Pick<MemoryState, "facts" | "overlay">,
  entityId: number,
): FactGroup[] {
  if (state.overlay.forgottenEntities.includes(entityId)) return [];
  const mine = state.facts.filter((f) => f.subjectId === entityId);
  const byPredicate = new Map<string, Fact[]>();
  for (const fact of mine) {
    const list = byPredicate.get(fact.predicate) ?? [];
    list.push(fact);
    byPredicate.set(fact.predicate, list);
  }

  const groups: FactGroup[] = [];
  for (const facts of byPredicate.values()) {
    const sorted = [...facts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const current = sorted.find((f) => f.invalidAt === null) ?? sorted[0];
    groups.push({
      current,
      superseded: sorted
        .filter((f) => f !== current)
        .sort((a, b) => (b.invalidAt ?? "").localeCompare(a.invalidAt ?? "")),
    });
  }
  return groups.sort((a, b) => a.current.predicate.localeCompare(b.current.predicate));
}

/**
 * Direct neighbours only, with dangling references dropped. Real graphs point
 * at rows that are gone; a missing neighbour is a skipped node, not a crash.
 *
 * Same `useShallow` prohibition as selectFactGroupsFor above, for the same
 * reason: every `NeighborLink` is a new object.
 */
export function selectNeighborsFor(
  state: Pick<MemoryState, "entities" | "relationships" | "overlay">,
  entityId: number,
): NeighborLink[] {
  const gone = new Set(state.overlay.forgottenEntities);
  if (gone.has(entityId)) return [];
  const byId = new Map(state.entities.filter((e) => !gone.has(e.id)).map((e) => [e.id, e]));

  const links: NeighborLink[] = [];
  for (const relationship of state.relationships) {
    if (relationship.fromId !== entityId && relationship.toId !== entityId) continue;
    const otherId = relationship.fromId === entityId ? relationship.toId : relationship.fromId;
    const entity = byId.get(otherId);
    if (!entity) continue;
    links.push({ relationship, entity });
  }
  return links;
}

export function selectVisiblePreferences(state: MemoryState): Preference[] {
  const gone = new Set(state.overlay.forgottenPreferences);
  const q = state.query.trim().toLowerCase();
  return state.preferences
    .filter((p) => !gone.has(p.key))
    .filter((p) => !q || p.key.toLowerCase().includes(q) || p.value.toLowerCase().includes(q));
}

export function selectVisibleProcedures(state: MemoryState): Procedure[] {
  const gone = new Set(state.overlay.forgottenProcedures);
  const q = state.query.trim().toLowerCase();
  return state.procedures
    .filter((p) => !gone.has(p.id))
    .filter((p) => !q || p.name.toLowerCase().includes(q));
}
