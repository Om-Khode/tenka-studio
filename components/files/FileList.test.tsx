import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FileList } from "./FileList";
import { useFileStore, deriveEntriesByDir } from "@/store/file-store";
import { seedTree, ROOTS } from "@/store/file-scripts";

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

// jsdom gives every element a zero-sized box, so the virtualizer would compute
// an empty visible range and render nothing at all. Give it a real viewport.
const VIEWPORT_HEIGHT = 400;
let rectSpy: ReturnType<typeof vi.spyOn>;
// @tanstack/react-virtual 3.17 measures the scroll element via
// offsetWidth/offsetHeight (see virtual-core's `getRect`), not
// getBoundingClientRect -- jsdom's HTMLElement.prototype getters for both
// always return 0, so the rect stub above is not enough on its own and the
// virtualizer computes an empty range without this too.
//
// IMPORTANT: because this stub *hands* FileList's scroll container a fixed
// 400px box, these tests only prove the virtualizer's own math is correct --
// they cannot detect a real-layout bug where the ancestor chain fails to
// bound that container's height and the virtualizer sees an unbounded
// viewport instead. That is exactly what shipped in Milestone 3 (Task 18):
// app/demo/files/page.tsx's root used `h-full` against a growing parent, so
// all 802 rows of a real Downloads folder mounted in the browser even though
// this file's "virtualizes: an 800-entry folder..." test passed. See
// app/demo/files/page.test.tsx's "bounds the page root to the viewport..."
// test for the structural guard, and task-18-fix-report.md for the
// real-browser measurements this class of bug requires.
let offsetHeightSpy: ReturnType<typeof vi.spyOn>;
let offsetWidthSpy: ReturnType<typeof vi.spyOn>;

function noop() {}

function renderList() {
  return render(
    <FileList onRename={noop} onDelete={noop} onDownload={noop} />,
  );
}

describe("FileList", () => {
  beforeEach(() => {
    ready();
    rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        width: 600,
        height: VIEWPORT_HEIGHT,
        top: 0,
        left: 0,
        bottom: VIEWPORT_HEIGHT,
        right: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    offsetHeightSpy = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(VIEWPORT_HEIGHT);
    offsetWidthSpy = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(600);
  });

  afterEach(() => {
    rectSpy.mockRestore();
    offsetHeightSpy.mockRestore();
    offsetWidthSpy.mockRestore();
  });

  // `formatBytes` moved to lib/format.ts in the Task 12 sweep -- it is shared
  // with BackupPanel now, not a file-list detail. Its unit tests moved with
  // it, to lib/format.test.ts.

  it("renders the current directory's rows", () => {
    renderList();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(screen.getByText("captures")).toBeInTheDocument();
  });

  it("virtualizes: an 800-entry folder renders a small fraction of its rows", () => {
    useFileStore.getState().setRoot("downloads");
    renderList();
    const rendered = screen.getAllByTestId("file-row").length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(60);
    expect(useFileStore.getState().entriesByDir.downloads.length).toBeGreaterThan(800);
  });

  it("selecting a file puts it in the store", () => {
    renderList();
    fireEvent.click(screen.getByText("notes.md"));
    expect(useFileStore.getState().selectedId).toBe("desktop/notes.md");
  });

  it("clicking a directory descends instead of selecting", () => {
    renderList();
    fireEvent.click(screen.getByText("captures"));
    expect(useFileStore.getState().currentDirId).toBe("desktop/captures");
    expect(useFileStore.getState().selectedId).toBeNull();
  });

  it("marks the selected row", () => {
    useFileStore.getState().select("desktop/notes.md");
    renderList();
    const row = screen.getAllByTestId("file-row").find((r) => r.textContent?.includes("notes.md"));
    expect(row).toHaveAttribute("data-selected", "true");
  });

  // Radix's DropdownMenuTrigger opens on pointerdown (mouse) rather than a
  // synthetic `click`, so these drive it with user-event -- which dispatches
  // the full pointer/mouse sequence -- instead of `fireEvent.click`.
  it("offers rename, download and delete on a file", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<FileList onRename={onRename} onDelete={noop} onDownload={noop} />);
    await user.click(screen.getByRole("button", { name: /actions for notes\.md/i }));
    await user.click(screen.getByRole("menuitem", { name: /rename/i }));
    expect(onRename).toHaveBeenCalledWith(
      expect.objectContaining({ id: "desktop/notes.md" }),
    );
  });

  it("closes the menu on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderList();
    const trigger = screen.getByRole("button", { name: /actions for notes\.md/i });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the menu when a pointer-down lands outside it", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /actions for notes\.md/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Radix's DropdownMenu is modal while open: it marks the rest of the
    // page inert (`pointer-events: none`), which is correct real-browser
    // behaviour but means user-event's own `.click()` refuses to "reach"
    // document.body (it checks computed pointer-events and bails). A raw
    // `fireEvent.pointerDown` still exercises the dismissable layer's
    // outside-pointerdown listener, which is the behaviour under test.
    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  // The hand-rolled implementation had a third dismissal path -- an `onBlur`
  // that closed the menu when focus left its subtree, for keyboard users who
  // tab away without a pointer. Radix's replacement is stricter, not weaker:
  // DropdownMenu.Content traps focus in a roving-tabindex loop while open,
  // so focus (and Tab) cannot leave the menu subtree at all until it is
  // dismissed via Escape or an outside click -- both covered above. There is
  // no "focus escaped without closing" state left to reproduce, so that test
  // is replaced by asserting the trap itself, plus the arrow-key navigation
  // Radix adds on top.
  it("traps focus inside the open menu -- Tab keeps focus within it instead of escaping", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /actions for notes\.md/i }));
    const menu = screen.getByRole("menu");

    await user.tab();

    // Assert containment, not a specific item: Radix's roving-tabindex order
    // under jsdom isn't something this test should pin to. The property that
    // matters -- and the one the old hand-rolled onBlur existed to guard --
    // is that focus cannot land outside the menu while it's open.
    expect(menu).toBeInTheDocument();
    expect(menu).toContainElement(document.activeElement as HTMLElement);
  });

  it("navigates items with the arrow keys", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /actions for notes\.md/i }));

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /rename/i })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /download/i })).toHaveFocus();
  });

  it("disables download for a binary with no mock content", async () => {
    const user = userEvent.setup();
    useFileStore.getState().setRoot("documents");
    renderList();
    await user.click(screen.getByRole("button", { name: /actions for resume\.pdf/i }));
    // Radix's Item is a div with role="menuitem", not a form control, so
    // jest-dom's toBeDisabled() (which only recognises the native `disabled`
    // attribute on form tags) never matches it. aria-disabled is what
    // assistive tech actually reads, so assert on that directly.
    const item = screen.getByRole("menuitem", { name: /download/i });
    expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("shows an empty state when the folder has nothing in it", () => {
    useFileStore.setState({
      entriesByDir: { ...useFileStore.getState().entriesByDir, desktop: [] },
    });
    renderList();
    expect(screen.getByText(/nothing here/i)).toBeInTheDocument();
  });

  it("shows a distinct empty state when a search matches nothing", () => {
    useFileStore.getState().setQuery("zzzzz-no-match");
    renderList();
    expect(screen.getByText(/no match/i)).toBeInTheDocument();
  });
});
