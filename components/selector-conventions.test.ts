import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Milestone 5b, Task 12 -- the selector convention, enforced by reading the
 * components back.
 *
 * Milestone 4 shipped BOTH conventions: some components subscribed to a whole
 * store and derived in the render body, others took narrow selectors. Having
 * two was the problem, not which one won -- a reviewer could not tell a
 * deliberate whole-store read from an unconverted one, and the whole-store
 * form re-renders a virtualised 800-row list every time an unrelated toast
 * fires.
 *
 * The rule, in three parts, because each part fails differently:
 *
 * 1. No component takes a whole-store subscription (`useFooStore()`). That
 *    subscribes to every field in the store.
 * 2. A selector that ALLOCATES -- filters or sorts into a fresh array -- must
 *    be wrapped in `useShallow`, or the fresh reference makes every store
 *    write a re-render.
 * 3. `useShallow` must NOT wrap a plain field read. It is not free (an extra
 *    comparison and a ref per subscription) and it signals "this allocates" to
 *    the next reader, which would be a lie.
 *
 * A source sweep rather than a runtime assertion, for the same reason
 * app/app/live-tree-no-demo-data.test.ts is one: the property is about how
 * every component is WRITTEN, and a render test can only cover the components
 * somebody remembered to render.
 */

const ROOT = join(import.meta.dirname, "..");
const UI_ROOTS = ["app", "components", "hooks"];

/**
 * Selectors that build a new array on every call. Wrapping these is the whole
 * point of the convention.
 *
 * Deliberately NOT here: `selectFactGroupsFor` and `selectNeighborsFor`. They
 * allocate too, but each element they return is itself a new object, so a
 * shallow element-wise compare never matches and `useShallow` would make
 * `getSnapshot` unstable across two calls in one render -- a React infinite
 * loop, not a missed memo. Their callers subscribe to the raw slices and
 * derive in the render body instead; see their docs in store/memory-store.ts.
 */
const ALLOCATING_SELECTORS = [
  "selectVisibleEntries",
  "selectVisibleEntities",
  "selectVisiblePreferences",
  "selectVisibleProcedures",
  "selectEntityTypes",
  "selectVisibleDefs",
  "selectGroups",
  "selectDirtyKeys",
];

/**
 * Comments are where this codebase explains its conventions, so they quote the
 * very patterns these rules forbid (SaveBar.tsx names `useSettingsStore()` in
 * the comment saying why it does not call it). Stripping them is what keeps a
 * good explanation from reading as a violation.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      found.push(full);
    }
  };
  for (const root of UI_ROOTS) walk(join(ROOT, root));
  return found;
}

const FILES = sourceFiles().map((full) => ({
  path: relative(ROOT, full).replace(/\\/g, "/"),
  source: stripComments(readFileSync(full, "utf8")),
}));

/**
 * Files that name an allocating selector inside a store hook but do NOT
 * subscribe to what it allocates. Each entry is a human claim, so the suite
 * also asserts the file still contains the selector -- a stale exemption
 * fails rather than silently covering something else.
 */
const NOT_SUBSCRIBING_TO_THE_ARRAY: Record<string, { selector: string; why: string }> = {
  "components/memory/MemoryDetail.tsx": {
    selector: "selectVisiblePreferences",
    why:
      "indexes the list inside the selector and subscribes to one string (the " +
      "chosen preference's key). The array never leaves the selector, so there " +
      "is no fresh reference for useShallow to compare -- and wrapping it " +
      "would compare a string element-wise, which is just slower.",
  },
  "components/shell/nav-items.ts": {
    selector: "selectVisibleEntities",
    why:
      "subscribes to the list's `.length` for a nav badge. A number, not an " +
      "array -- the nav redraws when the count changes and not when the " +
      "entities behind it are reordered. Lived in Sidebar.tsx until the " +
      "bottom bar needed the same badge; the reasoning moved with the code.",
  },
};

describe("store selector conventions", () => {
  it("found the UI tree, so this sweep is not silently vacuous", () => {
    expect(FILES.length).toBeGreaterThan(50);
    // The five files this task converted must be in the swept set, or the
    // rules below would pass by never having looked.
    for (const expected of [
      "components/files/FileList.tsx",
      "components/memory/EntityList.tsx",
      "components/memory/KnowledgeDetail.tsx",
      "components/memory/MemoryDetail.tsx",
      "components/memory/MemoryToolbar.tsx",
    ]) {
      expect(FILES.map((f) => f.path)).toContain(expected);
    }
  });

  it("no component takes a whole-store subscription", () => {
    const offenders = FILES.filter((f) => /\buse[A-Z]\w*Store\(\)/.test(f.source)).map(
      (f) => f.path,
    );
    expect(offenders).toEqual([]);
  });

  it("every exemption below still describes a real call site", () => {
    for (const [path, { selector }] of Object.entries(NOT_SUBSCRIBING_TO_THE_ARRAY)) {
      const file = FILES.find((f) => f.path === path);
      expect(file, `${path} is exempted but no longer exists`).toBeDefined();
      expect(file!.source).toContain(selector);
    }
  });

  it("every allocating selector passed to a store hook is wrapped in useShallow", () => {
    const offenders: string[] = [];
    for (const { path, source } of FILES) {
      const exempt = NOT_SUBSCRIBING_TO_THE_ARRAY[path];
      for (const name of ALLOCATING_SELECTORS) {
        if (exempt?.selector === name) continue;
        // Matches the selector reaching a store hook directly, either by
        // reference (`useFooStore(selectBar)`) or inside an inline arrow
        // (`useFooStore((s) => selectBar(s))`). A call in the render body,
        // which is not a subscription, matches neither.
        const direct = new RegExp(`use[A-Z]\\w*Store\\(\\s*${name}\\b`);
        const inline = new RegExp(`use[A-Z]\\w*Store\\(\\s*\\([^)]*\\)\\s*=>[^;]*\\b${name}\\(`);
        if (direct.test(source) || inline.test(source)) offenders.push(`${path}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("useShallow is not spent on a plain field read", () => {
    // `useShallow((s) => s.foo)` -- one field, no allocation, nothing to
    // compare element-wise.
    const offenders = FILES.filter((f) =>
      /useShallow\(\s*\(\s*\w+\s*\)\s*=>\s*\w+\.\w+\s*\)/.test(f.source),
    ).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
