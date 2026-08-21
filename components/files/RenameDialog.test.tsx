import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RenameDialog } from "./RenameDialog";
import type { FileNode } from "@/types/file";

const node: FileNode = {
  id: "desktop/notes.md",
  name: "notes.md",
  kind: "file",
  sizeBytes: 12,
  modifiedAt: 0,
  contentKind: "text",
  content: "x",
};

// A node that has already been renamed once: the id is the original path
// (ids never change), the name is the post-rename name. Reopening the rename
// dialog on a node like this is exactly the case where currentId !== currentName.
const renamedNode: FileNode = {
  id: "desktop/notes.md",
  name: "plan.md",
  kind: "file",
  sizeBytes: 12,
  modifiedAt: 0,
  contentKind: "text",
  content: "x",
};

function setup(siblingNames = ["notes.md", "router.py"], targetNode: FileNode = node) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <RenameDialog
      node={targetNode}
      siblingNames={siblingNames}
      open
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, onOpenChange, input: screen.getByRole("textbox") };
}

describe("RenameDialog", () => {
  it("opens pre-filled with the current name", () => {
    const { input } = setup();
    expect(input).toHaveValue("notes.md");
  });

  it("submits the trimmed new name and closes", () => {
    const { onSubmit, onOpenChange, input } = setup();
    fireEvent.change(input, { target: { value: "  plan.md  " } });
    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    expect(onSubmit).toHaveBeenCalledWith("plan.md");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("blocks an empty name inline and does not submit", () => {
    const { onSubmit, input } = setup();
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /rename/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/give it a name/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks a path separator, because this renames rather than moves", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "sub/plan.md" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/no slashes/i);
  });

  it("blocks a name a sibling already has", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "router.py" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/already has that name/i);
  });

  it("allows submitting the unchanged name without complaining about itself", () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    expect(onSubmit).toHaveBeenCalledWith("notes.md");
  });

  it("allows re-submitting a name a file was already renamed to, even though its id is the old name", () => {
    // desktop/notes.md was already renamed to plan.md; siblingNames reflects
    // the overlaid listing, so it now contains "plan.md" too. Reopening the
    // dialog on this node and submitting unchanged must not read as a clash
    // against itself just because currentId's basename ("notes.md") no longer
    // matches the current name ("plan.md").
    const { onSubmit } = setup(["plan.md", "router.py"], renamedNode);
    expect(screen.getByRole("button", { name: /rename/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    expect(onSubmit).toHaveBeenCalledWith("plan.md");
  });

  it("submits on Enter", () => {
    const { onSubmit, input } = setup();
    fireEvent.change(input, { target: { value: "plan.md" } });
    fireEvent.submit(input.closest("form")!);
    expect(onSubmit).toHaveBeenCalledWith("plan.md");
  });

  it("does not submit on Enter while invalid", () => {
    const { onSubmit, input } = setup();
    fireEvent.change(input, { target: { value: "router.py" } });
    fireEvent.submit(input.closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("re-seeds the field when reopened on a different node", () => {
    const other: FileNode = {
      id: "desktop/router.py",
      name: "router.py",
      kind: "file",
      sizeBytes: 200,
      modifiedAt: 0,
      contentKind: "code",
      content: "x",
      language: "python",
    };

    const onOpenChange = vi.fn();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <RenameDialog
        node={node}
        siblingNames={["notes.md", "router.py"]}
        open
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("notes.md");

    rerender(
      <RenameDialog
        node={other}
        siblingNames={["notes.md", "router.py"]}
        open
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("router.py");
  });
});
