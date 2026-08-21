import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useFileStore,
  selectVisibleEntries,
  crumbsFor,
  validateName,
  rootOf,
  humanize,
  deriveEntriesByDir,
} from "./file-store";
import { seedTree, ROOTS } from "./file-scripts";
import { configureRepos, getRepoMode } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import type { FileNode, FileOverlay } from "@/types/file";

/**
 * Mirrors store/memory-store.test.ts's `seedMemory()` + `status: "ready"`
 * pattern: sets the store to exactly the state a completed `load()` of every
 * seed directory would have produced, without driving the real (if
 * near-instant, in demo) async round trip in every test that just needs the
 * data present.
 */
function ready(overlay: FileOverlay = { renames: {}, deleted: [], created: [] }) {
  const rawByDir = seedTree();
  useFileStore.setState({
    ...useFileStore.getInitialState(),
    roots: [...ROOTS],
    rawByDir,
    overlay,
    entriesByDir: deriveEntriesByDir(rawByDir, overlay),
    status: "ready",
  });
}

describe("file-store pure helpers", () => {
  it("crumbsFor splits a path id into cumulative crumbs", () => {
    expect(crumbsFor("downloads/invoices")).toEqual([
      { id: "downloads", name: "Downloads" },
      { id: "downloads/invoices", name: "invoices" },
    ]);
  });

  it("crumbsFor on a root is a single crumb", () => {
    expect(crumbsFor("desktop")).toEqual([{ id: "desktop", name: "Desktop" }]);
  });

  it("crumbsFor titlecases a root id it has never seen, rather than needing a hardcoded label", () => {
    expect(crumbsFor("projects")).toEqual([{ id: "projects", name: "Projects" }]);
  });

  it("humanize titlecases the first letter only, and passes an empty string through", () => {
    expect(humanize("downloads")).toBe("Downloads");
    expect(humanize("")).toBe("");
  });

  it("rootOf returns the first path segment", () => {
    expect(rootOf("downloads/invoices")).toBe("downloads");
    expect(rootOf("desktop")).toBe("desktop");
  });

  it("validateName rejects empty and whitespace-only names", () => {
    expect(validateName("", [])).toBeTruthy();
    expect(validateName("   ", [])).toBeTruthy();
  });

  it("validateName rejects path separators", () => {
    expect(validateName("a/b.txt", [])).toBeTruthy();
    expect(validateName("a\\b.txt", [])).toBeTruthy();
  });

  it("validateName rejects a name already taken by a sibling", () => {
    expect(validateName("notes.md", ["notes.md", "router.py"])).toBeTruthy();
  });

  it("validateName allows keeping your own name unchanged", () => {
    expect(validateName("notes.md", ["notes.md"], "notes.md")).toBeNull();
  });

  it("validateName accepts a fresh valid name", () => {
    expect(validateName("plan.md", ["notes.md"])).toBeNull();
  });
});

describe("file-store", () => {
  beforeEach(() => ready());

  it("opens on the desktop root with nothing selected", () => {
    const s = useFileStore.getState();
    expect(s.currentDirId).toBe("desktop");
    expect(s.selectedId).toBeNull();
  });

  it("setRoot moves to that root and clears the selection and query", () => {
    useFileStore.getState().select("desktop/notes.md");
    useFileStore.getState().setQuery("note");
    useFileStore.getState().setRoot("downloads");
    const s = useFileStore.getState();
    expect(s.currentDirId).toBe("downloads");
    expect(s.selectedId).toBeNull();
    expect(s.query).toBe("");
  });

  it("openDir descends and goTo climbs back", () => {
    useFileStore.getState().openDir("desktop/captures");
    expect(useFileStore.getState().currentDirId).toBe("desktop/captures");
    useFileStore.getState().goTo("desktop");
    expect(useFileStore.getState().currentDirId).toBe("desktop");
  });

  it("sorts directories above files regardless of sort key", () => {
    useFileStore.getState().setSort("size");
    const rows = selectVisibleEntries(useFileStore.getState());
    const firstFile = rows.findIndex((n) => n.kind === "file");
    const lastDir = rows.map((n) => n.kind).lastIndexOf("dir");
    expect(lastDir).toBeLessThan(firstFile);
  });

  it("filters the current directory by query, case-insensitively", () => {
    useFileStore.getState().setQuery("NOTES");
    const rows = selectVisibleEntries(useFileStore.getState());
    expect(rows.map((n) => n.name)).toEqual(["notes.md"]);
  });

  it("rename changes the visible name and keeps the row in place", () => {
    useFileStore.getState().rename("desktop/notes.md", "plan.md");
    const rows = selectVisibleEntries(useFileStore.getState());
    expect(rows.some((n) => n.name === "plan.md")).toBe(true);
    expect(rows.some((n) => n.name === "notes.md")).toBe(false);
  });

  it("rename records the change in the overlay, not the tree wholesale", () => {
    useFileStore.getState().rename("desktop/notes.md", "plan.md");
    expect(useFileStore.getState().overlay.renames["desktop/notes.md"]).toBe("plan.md");
  });

  it("remove hides the row and records the deletion", () => {
    useFileStore.getState().remove("desktop/notes.md");
    const rows = selectVisibleEntries(useFileStore.getState());
    expect(rows.some((n) => n.id === "desktop/notes.md")).toBe(false);
    expect(useFileStore.getState().overlay.deleted).toContain("desktop/notes.md");
  });

  it("remove clears the selection if the removed row was selected", () => {
    useFileStore.getState().select("desktop/notes.md");
    useFileStore.getState().remove("desktop/notes.md");
    expect(useFileStore.getState().selectedId).toBeNull();
  });

  it("restore brings a removed row back exactly", () => {
    const before = selectVisibleEntries(useFileStore.getState()).find(
      (n) => n.id === "desktop/notes.md",
    )!;
    useFileStore.getState().remove("desktop/notes.md");
    useFileStore.getState().restore(before);
    const after = selectVisibleEntries(useFileStore.getState()).find(
      (n) => n.id === "desktop/notes.md",
    );
    expect(after).toEqual(before);
    expect(useFileStore.getState().overlay.deleted).not.toContain("desktop/notes.md");
  });

  it("addFile inserts into the named directory and records it as created", () => {
    const node = {
      id: "desktop/screenshot-1.svg",
      name: "screenshot-1.svg",
      kind: "file" as const,
      sizeBytes: 620,
      modifiedAt: 1,
      contentKind: "image" as const,
      content: "data:image/svg+xml;utf8,<svg/>",
    };
    useFileStore.getState().addFile(node);
    expect(useFileStore.getState().entriesByDir.desktop.some((n) => n.id === node.id)).toBe(true);
    expect(useFileStore.getState().overlay.created).toHaveLength(1);
  });

  it("addFile works even in a directory the store has never fetched yet", () => {
    useFileStore.setState(useFileStore.getInitialState()); // no load() at all, unlike ready()
    const node = {
      id: "desktop/screenshot-1.svg",
      name: "screenshot-1.svg",
      kind: "file" as const,
      sizeBytes: 620,
      modifiedAt: 1,
      contentKind: "image" as const,
      content: "data:image/svg+xml;utf8,<svg/>",
    };
    useFileStore.getState().addFile(node);
    expect(useFileStore.getState().entriesByDir.desktop).toEqual([node]);
  });

  it("addFile refuses a second node sharing an id already in the overlay", () => {
    const node = {
      id: "desktop/screenshot-1.svg",
      name: "screenshot-1.svg",
      kind: "file" as const,
      sizeBytes: 620,
      modifiedAt: 1,
      contentKind: "image" as const,
      content: "data:image/svg+xml;utf8,<svg/>",
    };
    useFileStore.getState().addFile(node);
    useFileStore.getState().addFile({ ...node, sizeBytes: 999 });
    expect(useFileStore.getState().overlay.created).toHaveLength(1);
    expect(
      useFileStore.getState().entriesByDir.desktop.filter((n) => n.id === node.id),
    ).toHaveLength(1);
  });

  it("resetDemoFiles clears every mutation and restores the pristine tree", () => {
    useFileStore.getState().rename("desktop/notes.md", "plan.md");
    useFileStore.getState().remove("desktop/router.py");
    useFileStore.getState().resetDemoFiles();
    const rows = selectVisibleEntries(useFileStore.getState());
    expect(rows.some((n) => n.name === "notes.md")).toBe(true);
    expect(rows.some((n) => n.name === "router.py")).toBe(true);
    expect(useFileStore.getState().overlay).toEqual({ renames: {}, deleted: [], created: [] });
  });

  it("a rename survives being replayed over a freshly loaded directory", async () => {
    useFileStore.getState().rename("desktop/notes.md", "plan.md");
    const overlay = useFileStore.getState().overlay;

    // Simulate a reload: fresh store (nothing fetched yet), the persisted
    // overlay restored, then the directory re-fetched -- exactly what
    // onRehydrateStorage + the Files page's mount-time load() do for real.
    useFileStore.setState(useFileStore.getInitialState());
    useFileStore.setState({ overlay });
    await useFileStore.getState().load("desktop");

    const rows = selectVisibleEntries(useFileStore.getState());
    expect(rows.some((n) => n.name === "plan.md")).toBe(true);
  });
});

describe("file-store.load()", () => {
  beforeEach(() => useFileStore.setState(useFileStore.getInitialState()));

  it("passes through loading before reaching ready", async () => {
    const pending = useFileStore.getState().load("desktop");
    expect(useFileStore.getState().status).toBe("loading");
    await pending;
    expect(useFileStore.getState().status).toBe("ready");
    expect(useFileStore.getState().entriesByDir.desktop.length).toBeGreaterThan(0);
  });

  it("reaches the error branch instead of hanging on loading forever when the repository rejects", async () => {
    const failing = { ...demoRepoBundle, files: { ...demoRepoBundle.files, list: async () => { throw new Error("network"); } } };
    configureRepos("demo", failing);
    await useFileStore.getState().load("desktop");
    expect(useFileStore.getState().status).toBe("error");
    configureRepos("demo", demoRepoBundle); // restore for later tests
  });

  it("loadRoots populates roots from the repository, never a hardcoded list", async () => {
    await useFileStore.getState().loadRoots();
    expect(useFileStore.getState().roots).toEqual([...ROOTS]);
  });
});

/**
 * Milestone 5b, Task "10c". `HttpFileRepo.rename` and `HttpFileRepo.remove`
 * existed with no caller: the store wrote its local overlay in both modes,
 * so a live delete removed the row, toasted a success, and left the file on
 * disk -- persisted, so the real file stayed filtered out of every later
 * listing with no way back.
 */
describe("live mutations go to the daemon, not the overlay", () => {
  const NODE: FileNode = {
    id: "desktop/notes.md",
    name: "notes.md",
    kind: "file",
    sizeBytes: 42,
    modifiedAt: 0,
    contentKind: "text",
  };

  function bindLive(files: Partial<typeof demoRepoBundle.files>) {
    configureRepos("live", {
      ...demoRepoBundle,
      files: { ...demoRepoBundle.files, list: async () => [NODE], ...files },
    });
    const rawByDir = { desktop: [NODE] };
    const overlay = { renames: {}, deleted: [], created: [] };
    useFileStore.setState({
      ...useFileStore.getInitialState(),
      roots: ["desktop"],
      rawByDir,
      overlay,
      entriesByDir: deriveEntriesByDir(rawByDir, overlay),
      status: "ready",
    });
  }

  afterEach(() => configureRepos("demo", demoRepoBundle));

  it("remove asks the repository and re-reads the directory", async () => {
    const remove = vi.fn(async () => {});
    bindLive({ remove, list: async () => [] });

    const result = await useFileStore.getState().remove(NODE.id);

    expect(remove).toHaveBeenCalledWith(NODE.id);
    expect(result.ok).toBe(true);
    expect(useFileStore.getState().entriesByDir.desktop).toEqual([]);
    expect(useFileStore.getState().overlay.deleted).toEqual([]);
  });

  it("a refused remove keeps the row, because the file is still there", async () => {
    bindLive({
      remove: async () => {
        throw new Error("refused");
      },
    });

    const result = await useFileStore.getState().remove(NODE.id);

    expect(result.ok).toBe(false);
    expect(useFileStore.getState().entriesByDir.desktop).toHaveLength(1);
    expect(useFileStore.getState().overlay.deleted).toEqual([]);
  });

  it("a live remove offers no undo -- there is nothing to put back", async () => {
    bindLive({ remove: async () => {}, list: async () => [] });
    const result = await useFileStore.getState().remove(NODE.id);
    expect(result.undo).toBeUndefined();
  });

  it("rename asks the repository and re-reads, writing no overlay", async () => {
    const renamed = { ...NODE, id: "desktop/plan.md", name: "plan.md" };
    const rename = vi.fn(async () => renamed);
    bindLive({ rename, list: async () => [renamed] });

    const result = await useFileStore.getState().rename(NODE.id, "plan.md");

    expect(rename).toHaveBeenCalledWith(NODE.id, "plan.md");
    expect(result.ok).toBe(true);
    expect(useFileStore.getState().overlay.renames).toEqual({});
    expect(useFileStore.getState().entriesByDir.desktop[0].name).toBe("plan.md");
  });

  it("a refused rename reports the failure and leaves the name alone", async () => {
    bindLive({
      rename: async () => {
        throw new Error("refused");
      },
    });

    const result = await useFileStore.getState().rename(NODE.id, "plan.md");

    expect(result.ok).toBe(false);
    expect(useFileStore.getState().entriesByDir.desktop[0].name).toBe("notes.md");
    expect(useFileStore.getState().overlay.renames).toEqual({});
  });

  it("an overlay left behind by an earlier build is not applied to a live listing", async () => {
    bindLive({});
    // Exactly the poisoned state the old code persisted under
    // `tenka-studio-files:live`: a file deleted only locally, and a rename
    // the filesystem never heard about.
    useFileStore.setState({
      overlay: { renames: { [NODE.id]: "ghost.md" }, deleted: [NODE.id], created: [] },
    });

    await useFileStore.getState().load("desktop");

    const rows = useFileStore.getState().entriesByDir.desktop;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("notes.md");
  });
});

describe("file-store persistence guard", () => {
  // Mirrors store/chat-store-persist.test.ts: real jsdom localStorage under
  // the store's actual persist key, exercised through persist.rehydrate() so
  // onRehydrateStorage's guard and try/catch backstop are what runs, not a
  // hand-rolled stand-in for them.
  const STORAGE_KEY = "tenka-studio-files";

  beforeEach(() => {
    localStorage.clear();
    useFileStore.setState(useFileStore.getInitialState());
  });

  it("falls back to the pristine seed when the persisted overlay's renames is null", async () => {
    // typeof null === "object", so a bare typeof check would have let this
    // through and crashed treeWithOverlay on overlay.renames[node.id].
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: { overlay: { renames: null, deleted: [], created: [] } },
        version: 0,
      }),
    );

    await useFileStore.persist.rehydrate();
    await useFileStore.getState().load("desktop");

    const s = useFileStore.getState();
    expect(s.hasHydrated).toBe(true);
    expect(s.overlay).toEqual({ renames: {}, deleted: [], created: [] });
    expect(selectVisibleEntries(s).some((n) => n.name === "notes.md")).toBe(true);
  });

  it("does not let a malformed created entry take down selectVisibleEntries", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          overlay: {
            renames: {},
            deleted: [],
            created: [
              { id: "desktop/bad.txt", kind: "file", sizeBytes: 1, modifiedAt: 1, name: 42 },
            ],
          },
        },
        version: 0,
      }),
    );

    await useFileStore.persist.rehydrate();
    await useFileStore.getState().load("desktop");

    const s = useFileStore.getState();
    expect(s.hasHydrated).toBe(true);
    expect(() => selectVisibleEntries(s)).not.toThrow();
  });

  /**
   * Milestone 5b, Task 12. In practice rehydrate wins this race -- localStorage
   * beats a network round trip -- which is why nothing noticed. But nothing
   * enforces the ordering: a page whose mount load() resolves first was left
   * showing the pre-rename listing until the user navigated somewhere else and
   * a later load() re-derived. Re-deriving here costs one pass over the
   * directories already in hand, and is a no-op on the common path.
   */
  it("PROOF-OF-FAILURE: applies a restored overlay to a directory that was already loaded", async () => {
    // load() FIRST, rehydrate second -- the losing order.
    await useFileStore.getState().load("desktop");
    expect(
      selectVisibleEntries(useFileStore.getState()).some((n) => n.name === "notes.md"),
    ).toBe(true);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          overlay: { renames: { "desktop/notes.md": "renamed.md" }, deleted: [], created: [] },
        },
        version: 0,
      }),
    );
    await useFileStore.persist.rehydrate();

    const s = useFileStore.getState();
    const names = selectVisibleEntries(s).map((n) => n.name);
    expect(names).toContain("renamed.md");
    expect(names).not.toContain("notes.md");
  });

  it("falls back to the pristine seed when the whole persisted payload is garbage", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { overlay: "nope" }, version: 0 }));

    await useFileStore.persist.rehydrate();

    const s = useFileStore.getState();
    expect(s.hasHydrated).toBe(true);
    expect(s.overlay).toEqual({ renames: {}, deleted: [], created: [] });
  });

  describe("mode-namespaced persistence", () => {
    afterEach(() => {
      // Every other test in this file relies on the module-load default of
      // "demo" -- restore it so this block cannot bleed into a later test.
      configureRepos("demo", demoRepoBundle);
    });

    it("writes under a distinct key in live mode, leaving the demo key's last write untouched", async () => {
      expect(getRepoMode()).toBe("demo"); // sanity: starts from the default
      await useFileStore.getState().rename("desktop/notes.md", "plan.md");
      await new Promise((resolve) => setTimeout(resolve, 0)); // flush persist's write

      configureRepos("live", demoRepoBundle);
      // addFile, not rename: since Task "10c" a live rename goes to the
      // daemon and writes no overlay at all, so it would no longer produce a
      // write to snapshot. addFile is the one overlay writer that still runs
      // in both modes, and any set() triggers persist -- which is all this
      // test needs, because the point under test is the KEY.
      useFileStore.getState().addFile({
        id: "desktop/shot.svg",
        name: "shot.svg",
        kind: "file",
        sizeBytes: 1,
        modifiedAt: 1,
        contentKind: "image",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Resetting the store on a mode switch is Task 9's job, not this
      // seam's -- so the in-memory overlay still carries the demo rename,
      // and that's exactly what the live write should snapshot. The demo key
      // keeps its pre-switch write, and the post-switch write lands under a
      // distinct live key instead of clobbering it.
      const demoWritten = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      const liveWritten = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:live`) ?? "{}");
      expect(demoWritten.state.overlay.renames).toEqual({ "desktop/notes.md": "plan.md" });
      expect(demoWritten.state.overlay.created).toEqual([]);
      expect(liveWritten.state.overlay.renames).toEqual({ "desktop/notes.md": "plan.md" });
      expect(liveWritten.state.overlay.created).toHaveLength(1);
    });
  });
});
