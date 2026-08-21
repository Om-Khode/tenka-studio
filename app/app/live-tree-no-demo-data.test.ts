import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Milestone 5b, Task "10b" -- "the test that matters": no component reads
 * `*-scripts.ts` or `store/demo-engine.ts` while the mode is live.
 *
 * This is a source-text sweep, not a full import-graph traversal, and that
 * choice is deliberate: `services/repo-registry.ts` (imported by nearly
 * every store in the app) itself imports `services/repos/demo` at module
 * scope, for the test/SSR self-configuring default documented on
 * `isSafeToDefaultToDemo()`. A blind transitive-import walk from any live
 * entry point would reach `chat-scripts.ts`/`file-scripts.ts`/
 * `memory-scripts.ts` through THAT path and flag almost every file in the
 * app as a false positive -- the question that actually matters is never
 * "does this file's dependency graph mention a scripts module anywhere",
 * it's "does a live-tree component call into one at runtime". A runtime
 * assertion covers that question more directly than any static walk could;
 * see store/chat-store.test.ts's "the live seam" suite (regenerateLast
 * proven NOT to overwrite a real reply with a scripted variant while live)
 * and components/commands/live/LiveCommandGrid.test.tsx / app/app/page.test.tsx
 * / components/dashboard/live/LiveSystemMetersCard.test.tsx (rendered with
 * a mocked HTTP repo bundle as the ONLY data source, proving the rendered
 * output already comes from there). This file adds the piece a runtime
 * render can't: proof that the *source* of every live-only file this task
 * added or rewired contains no reference to a scripts module or
 * demo-engine at all -- not gated behind a mode check, not present to
 * begin with. Together they cover both what the code does and what it
 * cannot possibly do.
 *
 * Scope: the four domains this task actually rewired (files, chat,
 * commands, dashboard telemetry). store/chat-store.ts is deliberately
 * excluded from the "contains no reference at all" check below -- it is a
 * SHARED store that legitimately imports chat-scripts.ts for its demo
 * branch (Task 2's own explicit design, "chat ... stays store-internal in
 * demo mode"); its live-mode correctness is what the runtime suite above
 * proves instead.
 */

/**
 * WHAT THIS FILE DOES NOT PROVE -- read before trusting it.
 *
 * It is a source-text sweep for one specific thing: a live-tree UI file that
 * names a demo MODULE. That is half of "no pane states as fact something no
 * daemon produced", and it is the easier half.
 *
 *   - It cannot see hardcoded LITERALS, which is the other half and has been
 *     the more common failure. `gemini-flash-lite` was a plain string in
 *     ActiveModelCard; "taught by voice" was a plain string in ProcedureDetail;
 *     "Three folders she can reach" was a plain string under a component that
 *     exists precisely because roots are per-daemon. None of those import
 *     anything, so nothing here would ever have flagged them. Their guards are
 *     the components' own colocated tests.
 *   - The frontier stops at app/, components/ and hooks/. Everything in
 *     `store/` and `services/` is invisible to it -- including
 *     `services/repos/demo/*` itself, and including the repository-edge merges
 *     where a client-side constant can override what the daemon declared
 *     (services/repos/http/commands.ts's `kind`, before this pass). That
 *     boundary is deliberate (see the note on the derived walk below), not an
 *     oversight, but it does mean a whole layer is unswept by this file.
 *   - It reads mode-awareness off the source text, so an ALLOWED entry's claim
 *     that its demo data is gated is checked shallowly: that the file compares
 *     against a mode at all, and that it does so fail-closed. It cannot tell
 *     whether the gate wraps the right expression.
 *   - `store/chat-store.ts` is excluded outright, by design: it is shared and
 *     legitimately imports chat-scripts.ts for its demo branch.
 *
 * Treat a green run here as "no live-tree component reaches for a demo module",
 * and nothing wider than that.
 */

const ROOT = join(import.meta.dirname, "..", "..");

/**
 * Matches the three ways a module actually gets pulled in, not just static
 * `from`. A `const { seedTree } = await import("@/store/file-scripts")` inside
 * a handler is the same bug wearing different syntax, and the `from`-only form
 * of this list could not see it.
 */
const SPECIFIER = String.raw`(?:from|import\s*\(|require\s*\()\s*["']`;

const FORBIDDEN = [
  new RegExp(`${SPECIFIER}[^"']*store/demo-engine["']`),
  /\buseDemoStore\b/,
  new RegExp(`${SPECIFIER}[^"']*-scripts["']`),
  // The demo repository bundle, reached directly rather than through
  // configureRepos()/getRepos(). A component that constructs or imports one has
  // bypassed the seam that decides which tree it is in.
  new RegExp(`${SPECIFIER}[^"']*services/repos/demo`),
];

/**
 * Every file this task wrote or rewired specifically so a live page would
 * stop reading demo data: the three live-only page files, the live-only
 * dashboard/commands components and the telemetry hook backing them, and
 * the files subsystem this task moved off a synchronous `seedTree()` call.
 */
const LIVE_ONLY_FILES = [
  "app/app/page.tsx",
  "app/app/chat/page.tsx",
  "app/app/commands/page.tsx",
  "components/dashboard/live/LiveSystemMetersCard.tsx",
  "components/dashboard/live/LiveActiveModelCard.tsx",
  "components/dashboard/live/LiveTraitDriftStrip.tsx",
  "components/dashboard/live/AwaitingEventsCard.tsx",
  "components/dashboard/live/LiveStatBar.tsx",
  "components/commands/live/LiveCommandGrid.tsx",
  "hooks/useLiveTelemetry.ts",
  "store/file-store.ts",
  "components/files/RootTabs.tsx",
  "components/files/FileList.tsx",
];

describe("the live tree contains no reference to demo data (source sweep)", () => {
  it("found every file on the list, so this sweep is not silently vacuous", () => {
    for (const relative of LIVE_ONLY_FILES) {
      expect(() => readFileSync(join(ROOT, relative), "utf8")).not.toThrow();
    }
  });

  for (const relative of LIVE_ONLY_FILES) {
    it(`${relative} contains no reference to demo-engine or a *-scripts module`, () => {
      const source = readFileSync(join(ROOT, relative), "utf8");
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});

/**
 * Milestone 5b, Task "10c" -- the hole the list above could not see.
 *
 * LIVE_ONLY_FILES is hand-written, so it only ever covers files somebody
 * remembered to add. `components/memory/ProvenanceBlock.tsx` is SHARED by
 * both trees -- /app/memory re-exports the demo memory page -- and it read
 * `TURN_EXCERPTS` from store/memory-scripts.ts unconditionally, captioning a
 * real daemon's memory rows with demo sentences. It degraded without
 * crashing, which is precisely why nothing noticed.
 *
 * So the reachable set is DERIVED rather than listed: start at every file
 * under app/app/ and follow local imports. Anything the walk lands on is,
 * by definition, a file that renders in the live tree, whether or not it
 * also renders in /demo -- and no future component can join that set
 * without this sweep seeing it.
 *
 * The walk stops at the UI layer (app/, components/, hooks/) and never
 * descends into store/ or services/. That is the same false-positive the
 * header above describes: services/repo-registry.ts imports the demo bundle
 * at module scope for its SSR/test default, and every store imports the
 * registry, so a walk that crossed into them would reach every *-scripts
 * module in the app and flag the entire tree. The question this suite asks
 * is narrower and answerable: does a component that renders under live
 * chrome reach for demo data itself?
 */

const UI_ROOTS = ["app", "components", "hooks"];
const SOURCE_EXTS = [".tsx", ".ts", "/index.tsx", "/index.ts"];

/**
 * Files allowed to reference demo data despite rendering in the live tree,
 * each with the reason it is not a lie. An entry is a human claim, so it is
 * not taken on trust: MODE_AWARE below is checked against the source, and
 * every entry names the runtime test that proves the live branch renders
 * none of it. Both halves must hold, which is what stops this from becoming
 * a mute button -- the version of ProvenanceBlock this task fixed would
 * fail the MODE_AWARE check even if somebody had listed it here.
 */
const ALLOWED: Record<string, string> = {
  "components/shell/Topbar.tsx":
    "subscribes to demo-engine's abort action but renders nothing from it; the " +
    "button is disabled outright unless the `mode` prop is 'demo'. Proven by " +
    "components/shell/Topbar.test.tsx.",
  "components/memory/ProvenanceBlock.tsx":
    "TURN_EXCERPTS has no wire equivalent, so the excerpt is demo-only and the " +
    "live branch omits the line entirely. Proven by the 'in live mode' suite in " +
    "components/memory/ProvenanceBlock.test.tsx.",
};

/**
 * An allowlisted file must at minimum be able to tell which tree it is in.
 *
 * `mode:\s*RepoMode` used to satisfy this, which was too weak to mean anything:
 * a bare type annotation on a prop passed the check without the file ever
 * branching on the value. It now takes an actual comparison.
 */
const MODE_AWARE = /getRepoMode\s*\(|\bmode\s*[!=]==/;

/**
 * And it must decide by proving it is in DEMO, not by failing to prove it is in
 * live. `getRepoMode()` returns `RepoMode | null`, and null -- an unbound
 * registry, which `getRepos()` itself treats as fatal -- makes `=== "live"` and
 * `!== "live"` fail OPEN, rendering demo data under a tree that never said
 * which one it was. ProvenanceBlock.tsx read exactly that way until this pass;
 * every sibling guard had already been flipped.
 */
const FAIL_CLOSED = /[!=]==\s*"demo"/;

function isTestFile(path: string): boolean {
  return /\.test\.tsx?$/.test(path);
}

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectTsx(full, out);
    else if (/\.tsx?$/.test(entry) && !isTestFile(entry)) out.push(full);
  }
  return out;
}

/** `@/x` and relative specifiers only -- a bare package name is not ours. */
function resolveLocal(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (base === null) return null;

  for (const ext of SOURCE_EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function isUiFile(path: string): boolean {
  const rel = relative(ROOT, path).split("\\").join("/");
  return UI_ROOTS.some((root) => rel.startsWith(`${root}/`));
}

/** Every UI file reachable from app/app/, by import, transitively. */
function liveReachableUiFiles(): string[] {
  const queue = collectTsx(join(ROOT, "app", "app"));
  const seen = new Set(queue);

  while (queue.length > 0) {
    const file = queue.pop() as string;
    const source = readFileSync(file, "utf8");
    // Same three forms FORBIDDEN matches: a dynamically-imported component is
    // as reachable as a statically-imported one.
    for (const match of source.matchAll(new RegExp(`${SPECIFIER}([^"']+)["']`, "g"))) {
      const target = resolveLocal(file, match[1]);
      if (target === null || seen.has(target) || !isUiFile(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }

  return [...seen].map((f) => relative(ROOT, f).split("\\").join("/")).sort();
}

describe("shared components that render in the live tree reach for no demo data", () => {
  const reachable = liveReachableUiFiles();

  it("the walk actually reaches shared components, not just app/app's own files", () => {
    // Three hops from a re-exported page (app/app/memory -> app/demo/memory
    // -> MemoryDetail -> KnowledgeDetail -> ProvenanceBlock). If this ever
    // stops holding, the walk has broken and every assertion below is
    // vacuously passing.
    expect(reachable).toContain("components/memory/ProvenanceBlock.tsx");
    expect(reachable).toContain("components/shell/Topbar.tsx");
    expect(reachable.length).toBeGreaterThan(20);
  });

  for (const [path, reason] of Object.entries(ALLOWED)) {
    it(`${path} is still on the allowlist for a reason that still applies`, () => {
      expect(reachable, `${path} no longer renders in the live tree`).toContain(path);
      const source = readFileSync(join(ROOT, path), "utf8");
      const matches = FORBIDDEN.some((pattern) => pattern.test(source));
      expect(
        matches,
        `${path} no longer references demo data -- drop it from ALLOWED (${reason})`,
      ).toBe(true);
      expect(
        MODE_AWARE.test(source),
        `${path} references demo data but cannot tell which tree it renders in`,
      ).toBe(true);
      expect(
        FAIL_CLOSED.test(source),
        `${path} gates its demo data on "not live" rather than on "is demo" -- ` +
          "an unbound registry (getRepoMode() === null) takes the demo branch",
      ).toBe(true);
    });
  }

  it("no other live-reachable UI file imports demo-engine or a *-scripts module", () => {
    const offenders = reachable.filter((path) => {
      if (path in ALLOWED) return false;
      const source = readFileSync(join(ROOT, path), "utf8");
      return FORBIDDEN.some((pattern) => pattern.test(source));
    });
    expect(offenders).toEqual([]);
  });
});
