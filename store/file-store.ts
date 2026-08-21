import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getRepoMode, getRepos, namespacedStorage } from "@/services/repo-registry";
import type { FileNode, FileOverlay, SortKey } from "@/types/file";
import type { ActionResult, LoadStatus } from "@/types/action";

const EMPTY_OVERLAY: FileOverlay = { renames: {}, deleted: [], created: [] };

/**
 * The overlay a listing is actually rendered through. In live mode: none.
 *
 * The overlay is a demo device -- a local diff of renames, deletions and
 * invented files, replayed over a seed that never changes underneath it. Laid
 * over a REAL directory it stops being a diff and becomes a lie with no
 * expiry: a renamed row shows a name the filesystem does not have, a deleted
 * row filters a file that is still on disk out of every future listing, and
 * because the overlay is persisted, both survive a reload with no way back to
 * the truth. rename() and remove() no longer write it in live mode, and this
 * is what makes an overlay persisted by an earlier build inert as well.
 *
 * `=== "demo"`, not `!== "live"` (Task 12): getRepoMode() is
 * `RepoMode | null`, and null means configureRepos() has not run. The overlay
 * is a demo device, so the demo mode is the one that has to be proven, not
 * assumed by default.
 */
function effectiveOverlay(overlay: FileOverlay): FileOverlay {
  return getRepoMode() === "demo" ? overlay : EMPTY_OVERLAY;
}

/** `typeof null === "object"`, so a bare typeof check lets a null field through. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function rootOf(dirId: string): string {
  return dirId.split("/")[0];
}

/**
 * Presentation only, and generic on purpose: `FilesRepo.roots()` (milestone
 * 5b, Task 6) forbids hardcoding roots on the client, so this cannot lean on
 * a fixed id -> label table the way the original three-root demo did. Title-
 * casing the id's own text produces the identical "Desktop" / "Downloads" /
 * "Documents" the old table did for those three ids, and degrades honestly
 * (still readable, just unstyled) for whatever id a live daemon's roots
 * endpoint actually reports.
 */
export function humanize(id: string): string {
  if (!id) return id;
  return id[0].toUpperCase() + id.slice(1);
}

export function crumbsFor(dirId: string): { id: string; name: string }[] {
  const parts = dirId.split("/");
  return parts.map((part, i) => ({
    id: parts.slice(0, i + 1).join("/"),
    name: i === 0 ? humanize(part) : part,
  }));
}

/**
 * Returns an error message, or null when the name is acceptable.
 * `currentName` lets a rename dialog accept the name the file already has.
 * This must be the node's current *name*, not its id: ids are the path a file
 * was created at and never change, so after a first rename the id's basename
 * and the current name diverge -- comparing against the id would then read a
 * no-op resubmit of the file's own (already-renamed) name as a clash.
 */
export function validateName(
  name: string,
  siblingNames: string[],
  currentName?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give it a name.";
  if (/[/\\]/.test(trimmed)) return "No slashes — this renames, it does not move.";
  const clashes = siblingNames.includes(trimmed);
  const isOwnName = currentName !== undefined && currentName === trimmed;
  if (clashes && !isOwnName) return "Something here already has that name.";
  return null;
}

interface FileState {
  status: LoadStatus;
  /** Every root FilesRepo.roots() has reported this session. Never hardcoded. */
  roots: string[];
  /**
   * The repository's own answer for each directory this session has fetched,
   * before the overlay is applied. Not persisted -- it is a cache of
   * whatever the bound repository (demo or live) last returned, and
   * replaying a persisted copy across a reload would go stale the moment
   * the daemon's real filesystem changed underneath it.
   */
  rawByDir: Record<string, FileNode[]>;
  entriesByDir: Record<string, FileNode[]>;
  /**
   * One file's body, exactly as `FilesRepo.read()` returned it, keyed by the
   * node id it was read for. Separate from `rawByDir` because a *listing*
   * never carries a body: the daemon answers `GET /v1/files/content` per
   * file, so the preview costs one round trip per file opened. Keeping the
   * result here rather than in the preview's own component state is what
   * makes re-selecting a file the user already opened free -- and what
   * survives the preview unmounting when it is toggled shut.
   *
   * Not persisted, for the same reason `rawByDir` is not: a body cached
   * across a reload goes stale the moment the real file changes underneath
   * it, and a stale body shown as current is the failure this whole seam
   * exists to avoid.
   */
  contentById: Record<string, FileNode>;
  /** Per id, not one global flag: two files can be in different states at once. */
  contentStatusById: Record<string, LoadStatus>;
  overlay: FileOverlay;
  currentDirId: string;
  selectedId: string | null;
  query: string;
  sort: SortKey;
  previewOpen: boolean;
  hasHydrated: boolean;

  loadRoots: () => Promise<void>;
  load: (dirId?: string) => Promise<void>;
  readContent: (node: FileNode) => Promise<void>;
  setRoot: (root: string) => void;
  openDir: (dirId: string) => void;
  goTo: (dirId: string) => void;
  select: (id: string | null) => void;
  setQuery: (query: string) => void;
  setSort: (sort: SortKey) => void;
  togglePreview: () => void;

  /**
   * Both resolve to the toast the caller should show, rather than mutating
   * and letting the page assume it worked. In live mode the daemon is asked
   * first and the answer decides what the user is told: a refused delete
   * reports a failure and leaves the row exactly where it is, because the
   * file is still there. The demo path keeps its overlay and its undo --
   * only demo can honestly offer one, since only demo can put the file back.
   */
  rename: (id: string, name: string) => Promise<ActionResult>;
  remove: (id: string) => Promise<ActionResult>;
  restore: (node: FileNode) => void;
  addFile: (node: FileNode) => void;
  resetDemoFiles: () => void;
}

function parentOf(id: string): string {
  return id.split("/").slice(0, -1).join("/");
}

/** The node behind an id in the directory currently on screen, if it is there. */
function nodeFor(state: FileState, id: string): FileNode | null {
  return (state.entriesByDir[state.currentDirId] ?? []).find((n) => n.id === id) ?? null;
}

/** What to call a file in a toast: the name on screen, or the id as a last
 *  resort -- a toast that says "Deleted undefined" helps nobody. */
function nameOf(state: FileState, id: string): string {
  return nodeFor(state, id)?.name ?? id;
}

/**
 * A rename target is only ever applied when it is actually a usable string.
 * `overlay.renames` is typed `Record<string, string>`, but the guard in
 * onRehydrateStorage only checks that the container is a plain object, not
 * that every value inside it is a string -- a persisted `{ renames: { x: 42 } }`
 * would otherwise hand a numeric `name` to every downstream consumer, which
 * throws later (e.g. `n.name.localeCompare`) rather than here.
 */
function renameFor(overlay: FileOverlay, id: string, fallback: string): string {
  const target = overlay.renames[id];
  return typeof target === "string" && target ? target : fallback;
}

/** A malformed persisted "created" entry (missing/non-string id or name)
 * must not corrupt the listing for every other row in its directory. */
function isUsableCreatedNode(node: FileNode): boolean {
  return typeof node?.id === "string" && node.id.length > 0 && typeof node?.name === "string" && node.name.length > 0;
}

/**
 * Applies the persisted overlay to one directory's raw, repository-sourced
 * listing. Replaces the old treeWithOverlay(), which rebuilt every directory
 * at once from a synchronous `seedTree()` -- a demo-only data generator that
 * a live directory has no equivalent of. This works one directory at a time
 * against whatever `rawByDir[dirId]` currently holds (empty until `load()`
 * has fetched it), so it is the same function whether that raw list came
 * from the demo repository or the daemon.
 */
function overlayApplied(raw: FileNode[], overlay: FileOverlay, dirId: string): FileNode[] {
  const deleted = new Set(overlay.deleted);
  const base = raw
    .filter((node) => !deleted.has(node.id))
    .map((node) => ({ ...node, name: renameFor(overlay, node.id, node.name) }));

  const created = overlay.created
    .filter(isUsableCreatedNode)
    .filter((node) => parentOf(node.id) === dirId && !deleted.has(node.id))
    .map((node) => ({ ...node, name: renameFor(overlay, node.id, node.name) }));

  return [...base, ...created];
}

/**
 * Every directory this session has either fetched from the repository, or
 * that owns a locally-created (not-yet-fetched) node -- so a screenshot
 * written into "desktop" still shows there even if the user has never
 * opened Files this session and `rawByDir.desktop` is still empty. Exported
 * for tests, which construct a "fully loaded" fixture the same way
 * memory-store.test.ts's `seedMemory()` does, without driving `load()`'s
 * real (if near-instant, in demo) async round trip for every directory a
 * suite happens to touch.
 */
export function deriveEntriesByDir(
  rawByDir: Record<string, FileNode[]>,
  overlay: FileOverlay,
): Record<string, FileNode[]> {
  const dirs = new Set(Object.keys(rawByDir));
  for (const node of overlay.created) {
    if (isUsableCreatedNode(node)) dirs.add(parentOf(node.id));
  }

  const result: Record<string, FileNode[]> = {};
  for (const dirId of dirs) {
    result[dirId] = overlayApplied(rawByDir[dirId] ?? [], overlay, dirId);
  }
  return result;
}

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      status: "idle",
      roots: [],
      rawByDir: {},
      entriesByDir: {},
      contentById: {},
      contentStatusById: {},
      overlay: EMPTY_OVERLAY,
      currentDirId: "desktop",
      selectedId: null,
      query: "",
      sort: "name",
      previewOpen: true,
      hasHydrated: false,

      loadRoots: async () => {
        try {
          const roots = await getRepos().files.roots();
          set({ roots });
        } catch {
          // Best-effort: RootTabs has nothing to show either way, and the
          // directory listing's own status is what carries the retry
          // affordance -- duplicating that here for a tab strip is not
          // worth a second error surface.
        }
      },

      /**
       * The repository owns the latency now, the same shift memory-store.ts
       * and settings-store.ts already made (milestone 5b, Task 2): components
       * render their skeleton and error branches against this, and
       * HttpFileRepo drops straight in without this store noticing.
       */
      load: async (dirId) => {
        const target = dirId ?? get().currentDirId;
        set({ status: "loading" });
        try {
          const raw = await getRepos().files.list(target);
          set((s) => ({
            status: "ready",
            rawByDir: { ...s.rawByDir, [target]: raw },
            entriesByDir: deriveEntriesByDir(
              { ...s.rawByDir, [target]: raw },
              effectiveOverlay(s.overlay),
            ),
          }));
        } catch {
          set({ status: "error" });
        }
      },

      /**
       * Fetches one node's body through `FilesRepo.read()`, which returns the
       * node it was given merged with content/language/truncated -- so the
       * listing's own name/size/modifiedAt survive rather than being
       * refetched or fabricated (see services/repos/types.ts).
       *
       * Idempotent by design: the preview's effect re-runs on any store
       * change, not only on a new selection, so this has to be the thing
       * that refuses the second round trip rather than trusting every
       * caller to check first.
       */
      readContent: async (node) => {
        const { contentById, contentStatusById } = get();
        if (contentById[node.id] || contentStatusById[node.id] === "loading") return;

        set((s) => ({
          contentStatusById: { ...s.contentStatusById, [node.id]: "loading" },
        }));
        try {
          const full = await getRepos().files.read(node);
          set((s) => ({
            contentById: { ...s.contentById, [node.id]: full },
            contentStatusById: { ...s.contentStatusById, [node.id]: "ready" },
          }));
        } catch {
          // No cached body is written, so a retry from the preview's error
          // branch re-enters this method and actually re-fetches.
          set((s) => ({
            contentStatusById: { ...s.contentStatusById, [node.id]: "error" },
          }));
        }
      },

      setRoot: (root) => {
        set({ currentDirId: root, selectedId: null, query: "" });
        void get().load(root);
      },
      openDir: (dirId) => {
        set({ currentDirId: dirId, selectedId: null, query: "" });
        void get().load(dirId);
      },
      goTo: (dirId) => {
        set({ currentDirId: dirId, selectedId: null, query: "" });
        void get().load(dirId);
      },
      select: (id) => set({ selectedId: id, previewOpen: id ? true : get().previewOpen }),
      setQuery: (query) => set({ query }),
      setSort: (sort) => set({ sort }),
      togglePreview: () => set({ previewOpen: !get().previewOpen }),

      rename: async (id, name) => {
        // `!== "demo"` (Task 12): only a proven demo registry writes the
        // overlay. An unbound one takes this path, where getRepos() throws
        // inside the try below and the user is told the rename did not
        // happen -- which is true -- instead of being shown a new name that
        // exists nowhere.
        if (getRepoMode() !== "demo") {
          const dir = get().currentDirId;
          try {
            await getRepos().files.rename(id, name);
          } catch {
            return {
              ok: false,
              title: `Couldn't rename ${nameOf(get(), id)}`,
              detail: "The daemon refused it — the file still has its old name.",
            };
          }
          // Re-read rather than patch: rename moves the node to a new id, and
          // the daemon's listing is the only thing that knows what the
          // directory looks like afterwards.
          await get().load(dir);
          return { ok: true, title: `Renamed to ${name}` };
        }

        const overlay = { ...get().overlay, renames: { ...get().overlay.renames, [id]: name } };
        set((s) => ({ overlay, entriesByDir: deriveEntriesByDir(s.rawByDir, overlay) }));
        return { ok: true, title: `Renamed to ${name}` };
      },

      remove: async (id) => {
        const label = nameOf(get(), id);

        // `!== "demo"`: see rename() above. Hiding a row on an unbound
        // registry would be the same lie a refused delete tells.
        if (getRepoMode() !== "demo") {
          const dir = get().currentDirId;
          try {
            await getRepos().files.remove(id);
          } catch {
            // A 404 here cannot tell "already gone" from "the delete failed"
            // (see HttpFileRepo's own note), so this says what is certainly
            // true -- she could not confirm it -- and leaves the row alone.
            // A row that disappears on a failed delete is the exact lie this
            // whole path exists to stop telling.
            return {
              ok: false,
              title: `Couldn't delete ${label}`,
              detail: "She could not confirm it was removed.",
            };
          }
          set((s) => ({ selectedId: s.selectedId === id ? null : s.selectedId }));
          await get().load(dir);
          // No undo: the file is off the real filesystem and Studio has
          // nothing to put back.
          return { ok: true, title: `Deleted ${label}` };
        }

        const node = nodeFor(get(), id);
        const overlay = { ...get().overlay, deleted: [...get().overlay.deleted, id] };
        set((s) => ({
          overlay,
          entriesByDir: deriveEntriesByDir(s.rawByDir, overlay),
          selectedId: s.selectedId === id ? null : s.selectedId,
        }));
        return {
          ok: true,
          title: `Deleted ${label}`,
          // Confirm satisfies the PRD; undo exists because even a meant
          // deletion deserves a way back -- and in demo there genuinely is one.
          undo: node ? () => get().restore(node) : undefined,
        };
      },

      restore: (node) => {
        const overlay = {
          ...get().overlay,
          deleted: get().overlay.deleted.filter((d) => d !== node.id),
        };
        set((s) => ({ overlay, entriesByDir: deriveEntriesByDir(s.rawByDir, overlay) }));
      },

      addFile: (node) => {
        // A duplicate id would otherwise render as two rows sharing one React
        // key (FileList keys on node.id) and make the new capture indistinguishable
        // from the old one. Rejecting is a no-op rather than a silent overwrite --
        // callers that mint their own ids (see useCommandRun's writeScreenshot)
        // should never hit this in practice; it exists as a backstop, not a
        // recovery path, so replacing the existing entry's metadata would be
        // more surprising than doing nothing.
        if (get().overlay.created.some((n) => n.id === node.id)) return;
        const overlay = { ...get().overlay, created: [...get().overlay.created, node] };
        // effectiveOverlay, not `overlay`: a locally invented file must not
        // appear in a real directory listing, only in the demo's.
        set((s) => ({
          overlay,
          entriesByDir: deriveEntriesByDir(s.rawByDir, effectiveOverlay(overlay)),
        }));
      },

      resetDemoFiles: () =>
        set((s) => ({
          overlay: EMPTY_OVERLAY,
          entriesByDir: deriveEntriesByDir(s.rawByDir, EMPTY_OVERLAY),
          selectedId: null,
          query: "",
        })),
    }),
    {
      name: "tenka-studio-files",
      storage: namespacedStorage<{ overlay: FileOverlay }>(),
      skipHydration: true,
      // Only the diff. Persisting entriesByDir would write an 800-entry blob
      // on every mutation; the overlay is a few hundred bytes and survives a
      // seed change without corrupting.
      partialize: (state) => ({ overlay: state.overlay }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // A hand-edited or version-skewed payload must not take the route down.
        // The shape checks catch the common cases (null fields, wrong types);
        // the try/catch is the backstop for everything else -- a corrupt
        // fixture, e.g. a rename target or created node with the wrong field
        // types, is never worth a blank page.
        try {
          if (
            !isPlainObject(state.overlay) ||
            !isPlainObject(state.overlay.renames) ||
            !Array.isArray(state.overlay.deleted) ||
            !Array.isArray(state.overlay.created)
          ) {
            state.overlay = EMPTY_OVERLAY;
          }
        } catch {
          state.overlay = EMPTY_OVERLAY;
        }
        // Re-derive against whatever raw listings are ALREADY cached, rather
        // than waiting for the next load(). `rawByDir` is not persisted, so
        // this is empty on the common path (rehydrate wins the race against a
        // network round trip) and re-deriving is a no-op -- but when a page's
        // mount load() resolves first, the restored overlay would otherwise
        // sit unapplied until the user navigated somewhere else, showing the
        // pre-rename, pre-delete listing on a tree that has both persisted.
        // Cheap either way: one pass over the directories in hand.
        state.entriesByDir = deriveEntriesByDir(state.rawByDir, effectiveOverlay(state.overlay));
        // Mutating `state` here does not notify subscribers -- zustand's
        // persist hands the merged object over rather than routing through
        // set(). hooks/useFileHydration.ts re-asserts hasHydrated through a
        // real set() once rehydrate() resolves, which is the write that
        // redraws anything already mounted; the assignment above is what that
        // redraw then reads.
        state.hasHydrated = true;
      },
    },
  ),
);

/** Directories first, then the active sort, then the query filter. */
export function selectVisibleEntries(state: FileState): FileNode[] {
  const entries = state.entriesByDir[state.currentDirId] ?? [];
  const q = state.query.trim().toLowerCase();
  const filtered = q ? entries.filter((n) => n.name.toLowerCase().includes(q)) : entries;

  return [...filtered].sort((a, b) => {
    // A directory is never below a file, whatever the sort key says.
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    if (state.sort === "size") return b.sizeBytes - a.sizeBytes;
    if (state.sort === "modified") return b.modifiedAt - a.modifiedAt;
    return a.name.localeCompare(b.name);
  });
}
