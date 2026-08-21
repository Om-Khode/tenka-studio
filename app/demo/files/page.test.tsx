import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import FilesPage from "./page";
import { useFileStore, deriveEntriesByDir } from "@/store/file-store";
import { seedTree, ROOTS } from "@/store/file-scripts";
import { useToastStore } from "@/store/toast-store";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import { SHELL, MAIN } from "@/components/shell/shell-classes";
import type { FileNode } from "@/types/file";

/** Mirrors store/file-store.test.ts's `ready()` -- a completed load(), without driving it. */
function ready() {
  const rawByDir = seedTree();
  const overlay = { renames: {}, deleted: [], created: [] };
  useFileStore.setState({
    ...useFileStore.getInitialState(),
    roots: [...ROOTS],
    rawByDir,
    overlay,
    entriesByDir: deriveEntriesByDir(rawByDir, overlay),
    status: "ready",
  });
}

let rectSpy: ReturnType<typeof vi.spyOn>;
// @tanstack/react-virtual measures the scroll element via offsetWidth/
// offsetHeight (virtual-core's `getRect`), not getBoundingClientRect --
// jsdom zeroes both, so the rect stub alone renders zero rows. See
// components/files/FileList.test.tsx, which hit this first.
//
// IMPORTANT: this stub hands every scroll container a fixed 400px box
// regardless of the real DOM layout. That means these tests cannot catch a
// bug where the *real* ancestor chain (app/demo/layout.tsx's flex/overflow
// stack) fails to bound FileList's height -- which is exactly what shipped
// in Milestone 3 (Task 18): `h-full` on this page's root resolved against a
// growing, unbounded parent, so every one of an 802-row folder mounted into
// the DOM instead of a virtualized handful. That regression made every test
// in this file and in FileList.test.tsx pass anyway. The
// "bounded-height root class" test below guards the structural fix
// (see app/demo/files/page.tsx); anything deeper needs real-browser
// verification (Playwright), not jsdom.
let offsetHeightSpy: ReturnType<typeof vi.spyOn>;
let offsetWidthSpy: ReturnType<typeof vi.spyOn>;

describe("Files page", () => {
  beforeEach(() => {
    ready();
    useToastStore.setState(useToastStore.getInitialState());
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 600, height: 400, top: 0, left: 0, bottom: 400, right: 600, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    offsetHeightSpy = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(400);
    offsetWidthSpy = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(600);
  });

  afterEach(() => {
    rectSpy.mockRestore();
    offsetHeightSpy.mockRestore();
    offsetWidthSpy.mockRestore();
  });

  // Radix's DropdownMenuTrigger opens on pointerdown, not a synthetic
  // `click`, so opening the menu needs user-event's full pointer sequence
  // (see components/files/FileList.test.tsx for the same note). Once open,
  // clicking an already-rendered menu item still works with plain
  // fireEvent.click, so only the open step changed here.
  async function openMenu(name: string) {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: new RegExp(`actions for ${name}`, "i") }));
  }

  it("renders the roots, the breadcrumb, and the list together", () => {
    render(<FilesPage />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByTestId("crumb")).toBeInTheDocument();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
  });

  // Real-layout guard: jsdom's stubbed geometry above cannot detect a page
  // root whose height resolves to "auto" against a growing ancestor (the
  // Task 18 regression). What it CAN assert, honestly, is that the root is
  // still bounded, so the FileList's own overflow-y-auto container is what
  // scrolls rather than the whole page. It cannot prove virtualization end to
  // end -- that needs a real browser (see task-18-fix-report.md).
  //
  // The bound used to be `h-[calc(100vh-8.5rem)]`, and this test pinned that
  // literal because `h-full` WAS the regression: <main> was `flex-1` with no
  // `min-h-0`, so a percentage height measured against an indefinite one and
  // resolved to auto. The mobile pass fixed that at the source, which inverts
  // the assertion -- `h-full` is now the correct form and the arithmetic is
  // the regression. Both halves are checked, because `h-full` is only bounded
  // for as long as the layout keeps its side of the bargain.
  it("bounds the page root to the viewport instead of letting it grow with content", () => {
    const { container } = render(<FilesPage />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/\bh-full\b/);
    expect(root.className).toMatch(/overflow-hidden/);
    expect(root.className).not.toMatch(/h-\[calc\(/);
    // The other half: <main> must give `h-full` something definite to measure
    // against, or the line above is satisfied by a page that still grows.
    expect(MAIN).toMatch(/\bmin-h-0\b/);
    expect(SHELL).toMatch(/\bh-dvh\b/);
  });

  it("selecting a file fills the preview", () => {
    render(<FilesPage />);
    fireEvent.click(screen.getByText("notes.md"));
    expect(screen.getByText(/ship the commands page/i)).toBeInTheDocument();
  });

  it("renames a file end to end", async () => {
    render(<FilesPage />);
    await openMenu("notes.md");
    fireEvent.click(screen.getByRole("menuitem", { name: /rename/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "plan.md" } });
    fireEvent.click(screen.getByRole("button", { name: /^rename$/i }));

    expect(screen.getByText("plan.md")).toBeInTheDocument();
    // The toast is awaited now: rename() asks the repository first and hands
    // back the result, so the demo's row still moves synchronously but the
    // toast lands a microtask later (milestone 5b, Task "10c").
    await waitFor(() =>
      expect(useToastStore.getState().toasts.at(-1)?.title).toMatch(/plan\.md/),
    );
  });

  it("asks before deleting and leaves the file alone when cancelled", async () => {
    render(<FilesPage />);
    await openMenu("notes.md");
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("deletes on confirm and offers undo", async () => {
    render(<FilesPage />);
    await openMenu("notes.md");
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(screen.queryByText("notes.md")).not.toBeInTheDocument();
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.undo).toBeDefined());
  });

  it("undo puts the deleted file back exactly", async () => {
    render(<FilesPage />);
    await openMenu("notes.md");
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.undo).toBeDefined());
    useToastStore.getState().toasts.at(-1)!.undo!();

    expect(useFileStore.getState().overlay.deleted).toEqual([]);
  });

  it("downloads a file with content and toasts the save", async () => {
    render(<FilesPage />);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await openMenu("notes.md");
    fireEvent.click(screen.getByRole("menuitem", { name: /download/i }));
    expect(useToastStore.getState().toasts.at(-1)?.title).toMatch(/saved notes\.md/i);
  });

  it("descends into a folder and climbs back via the breadcrumb", () => {
    render(<FilesPage />);
    fireEvent.click(screen.getByText("captures"));
    expect(screen.getAllByTestId("crumb")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Desktop" }));
    expect(screen.getAllByTestId("crumb")).toHaveLength(1);
  });

  it("switching root swaps the listing", () => {
    render(<FilesPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Documents" }));
    expect(screen.getByText("tenka.css")).toBeInTheDocument();
    expect(screen.queryByText("notes.md")).not.toBeInTheDocument();
  });

  it("reset restores a deleted file", async () => {
    render(<FilesPage />);
    await openMenu("notes.md");
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset demo files/i }));
    expect(screen.getByText("notes.md")).toBeInTheDocument();
  });

  /**
   * Milestone 5b, Task "10c". `rename` and `remove` used to write the local
   * overlay and nothing else, in both modes. Under live chrome that meant a
   * delete popped a confirm promising the file would be gone, toasted
   * "Deleted notes.md", removed the row -- and left the file untouched on
   * disk, with the overlay persisted so the real file stayed filtered out of
   * every later listing. The row is the thing to assert on here: a store
   * unit test cannot see what the user was shown.
   */
  describe("under live chrome", () => {
    const LISTED: FileNode = {
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
        files: { ...demoRepoBundle.files, list: async () => [LISTED], ...files },
      });
      const rawByDir = { desktop: [LISTED] };
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

    it("leaves the file in the listing when the daemon refuses the delete", async () => {
      bindLive({ remove: async () => { throw new Error("refused"); } });
      render(<FilesPage />);
      await openMenu("notes.md");
      fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

      await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.ok).toBe(false));
      // Still on screen, because it is still on the disk.
      expect(screen.getByText("notes.md")).toBeInTheDocument();
      expect(useFileStore.getState().overlay.deleted).toEqual([]);
    });

    it("tells the daemon to delete, and offers no undo it could not honour", async () => {
      const remove = vi.fn(async () => {});
      bindLive({ remove, list: async () => [] });
      render(<FilesPage />);
      await openMenu("notes.md");
      fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

      await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.ok).toBe(true));
      expect(remove).toHaveBeenCalledWith("desktop/notes.md");
      expect(useToastStore.getState().toasts.at(-1)?.undo).toBeUndefined();
      await waitFor(() => expect(screen.queryByText("notes.md")).not.toBeInTheDocument());
    });

    it("promises no undo in the confirm dialog either", async () => {
      bindLive({});
      render(<FilesPage />);
      await openMenu("notes.md");
      fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
      expect(screen.getByText(/there is no undo/i)).toBeInTheDocument();
      expect(screen.queryByText(/one undo from the toast/i)).not.toBeInTheDocument();
    });

    it("renames through the daemon and re-reads the directory rather than overlaying a name", async () => {
      const rename = vi.fn(async () => ({ ...LISTED, id: "desktop/plan.md", name: "plan.md" }));
      bindLive({ rename, list: async () => [{ ...LISTED, id: "desktop/plan.md", name: "plan.md" }] });
      render(<FilesPage />);
      await openMenu("notes.md");
      fireEvent.click(screen.getByRole("menuitem", { name: /rename/i }));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "plan.md" } });
      fireEvent.click(screen.getByRole("button", { name: /^rename$/i }));

      await waitFor(() => expect(screen.getByText("plan.md")).toBeInTheDocument());
      expect(rename).toHaveBeenCalledWith("desktop/notes.md", "plan.md");
      expect(useFileStore.getState().overlay.renames).toEqual({});
    });

    it("hides the reset-demo-files button, which has no meaning here", () => {
      bindLive({});
      render(<FilesPage />);
      expect(screen.queryByRole("button", { name: /reset demo files/i })).not.toBeInTheDocument();
    });

    it("fetches the bytes before downloading, instead of refusing every live file", async () => {
      const read = vi.fn(async (node: FileNode) => ({ ...node, content: "real bytes" }));
      bindLive({ read });
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      render(<FilesPage />);
      await openMenu("notes.md");
      fireEvent.click(screen.getByRole("menuitem", { name: /download/i }));

      await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.ok).toBe(true));
      expect(read).toHaveBeenCalled();
      expect(click).toHaveBeenCalled();
    });
  });
});
