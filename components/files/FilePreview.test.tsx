import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FilePreview } from "./FilePreview";
import { useFileStore, deriveEntriesByDir } from "@/store/file-store";
import { seedTree, ROOTS } from "@/store/file-scripts";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import type { FilesRepo } from "@/services/repos/types";
import type { FileNode } from "@/types/file";

vi.mock("@/components/ui/CodeBlock", () => ({
  CodeBlock: ({ language, code }: { language: string; code: string }) => (
    <div data-testid="code-block" data-language={language}>
      {code}
    </div>
  ),
}));

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

describe("FilePreview", () => {
  beforeEach(ready);

  it("prompts when nothing is selected", () => {
    render(<FilePreview />);
    expect(screen.getByText(/pick a file/i)).toBeInTheDocument();
  });

  it("renders text content inline", () => {
    useFileStore.getState().select("desktop/notes.md");
    render(<FilePreview />);
    expect(screen.getByText(/ship the commands page/i)).toBeInTheDocument();
  });

  it("routes code through CodeBlock with its language", () => {
    useFileStore.getState().select("desktop/router.py");
    render(<FilePreview />);
    expect(screen.getByTestId("code-block")).toHaveAttribute("data-language", "python");
  });

  it("renders an image from its data URI", () => {
    useFileStore.getState().select("desktop/wallpaper.svg");
    render(<FilePreview />);
    expect(screen.getByRole("img", { name: /wallpaper\.svg/i })).toBeInTheDocument();
  });

  it("shows a type and size card for a binary instead of pretending to render it", () => {
    useFileStore.getState().setRoot("documents");
    useFileStore.getState().select("documents/resume.pdf");
    render(<FilePreview />);
    expect(screen.getByTestId("binary-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("code-block")).not.toBeInTheDocument();
  });

  it("keeps showing the selected file when the search query excludes it from the visible list", () => {
    useFileStore.getState().select("desktop/notes.md");
    useFileStore.getState().setQuery("zzz-does-not-match-anything");
    render(<FilePreview />);
    expect(screen.getByText(/ship the commands page/i)).toBeInTheDocument();
    expect(screen.queryByText(/pick a file/i)).not.toBeInTheDocument();
  });

  it("closes and hands its width back", () => {
    useFileStore.getState().select("desktop/notes.md");
    render(<FilePreview />);
    fireEvent.click(screen.getByRole("button", { name: /close preview/i }));
    expect(useFileStore.getState().previewOpen).toBe(false);
  });

  it("renders nothing at all while closed", () => {
    useFileStore.getState().select("desktop/notes.md");
    useFileStore.setState({ previewOpen: false });
    const { container } = render(<FilePreview />);
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * Milestone 5b, Task "10c". The daemon's listing (`GET /v1/files`) carries
 * metadata only -- name, kind, size, modifiedAt, contentKind -- and the body
 * lives behind a second call, `FilesRepo.read()`. Nothing called it, so
 * selecting a file under live chrome rendered a confidently blank pane.
 *
 * Every node below is shaped like a real listing entry (no inlined
 * `content`), which is exactly what the demo seed is NOT -- the seed inlines
 * a body on every node, so the suite above can never exercise this path.
 */
describe("FilePreview against a listing that carries no body", () => {
  const LOG: FileNode = {
    id: "desktop/big.log",
    name: "big.log",
    kind: "file",
    sizeBytes: 999_999,
    modifiedAt: 0,
    contentKind: "text",
  };
  const BLOB: FileNode = {
    id: "desktop/archive.zip",
    name: "archive.zip",
    kind: "file",
    sizeBytes: 4096,
    modifiedAt: 0,
    contentKind: "binary",
  };

  /**
   * Spreads the demo repo before overriding, per commit 219d612: a method
   * added to FilesRepo later must not make this fixture incomplete. `read`
   * is the only one the preview ever calls.
   */
  function bindLive(read: FilesRepo["read"], nodes: FileNode[] = [LOG]) {
    configureRepos("live", {
      ...demoRepoBundle,
      files: { ...demoRepoBundle.files, read },
    });
    const rawByDir = { desktop: nodes };
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

  afterEach(() => {
    // Every other test in this file relies on the module-load default.
    configureRepos("demo", demoRepoBundle);
  });

  it("reads the body through FilesRepo instead of rendering an empty pane", async () => {
    const read = vi.fn(async (node: FileNode) => ({
      ...node,
      content: "line one\nline two",
      truncated: false,
    }));
    bindLive(read);
    useFileStore.getState().select(LOG.id);

    render(<FilePreview />);

    expect(await screen.findByText(/line one/)).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ id: LOG.id }));
  });

  it("says the body was cut short rather than passing a slice off as the whole file", async () => {
    bindLive(async (node) => ({ ...node, content: "only the first slice", truncated: true }));
    useFileStore.getState().select(LOG.id);

    render(<FilePreview />);

    expect(await screen.findByTestId("truncated-notice")).toHaveTextContent(/truncated/i);
    expect(screen.getByText(/only the first slice/)).toBeInTheDocument();
  });

  it("says nothing about truncation when the daemon returned the whole file", async () => {
    bindLive(async (node) => ({ ...node, content: "all of it", truncated: false }));
    useFileStore.getState().select(LOG.id);

    render(<FilePreview />);

    expect(await screen.findByText(/all of it/)).toBeInTheDocument();
    expect(screen.queryByTestId("truncated-notice")).not.toBeInTheDocument();
  });

  it("shows a skeleton while the body is in flight, not an empty file", () => {
    bindLive(() => new Promise(() => {}));
    useFileStore.getState().select(LOG.id);

    render(<FilePreview />);

    expect(screen.getByLabelText(/loading this file/i)).toBeInTheDocument();
  });

  it("offers a retry when the read fails, and the retry actually re-reads", async () => {
    const read = vi
      .fn<FilesRepo["read"]>()
      .mockRejectedValueOnce(new Error("daemon said no"))
      .mockImplementation(async (node) => ({ ...node, content: "second time lucky" }));
    bindLive(read);
    useFileStore.getState().select(LOG.id);

    render(<FilePreview />);

    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByText(/second time lucky/)).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not read the same node twice", async () => {
    const read = vi.fn(async (node: FileNode) => ({ ...node, content: "read once" }));
    bindLive(read);
    useFileStore.getState().select(LOG.id);

    const { unmount } = render(<FilePreview />);
    await screen.findByText(/read once/);
    unmount();

    render(<FilePreview />);
    expect(await screen.findByText(/read once/)).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("never reads a binary -- there is nothing renderable to fetch", async () => {
    const read = vi.fn<FilesRepo["read"]>();
    bindLive(read, [BLOB]);
    useFileStore.getState().select(BLOB.id);

    render(<FilePreview />);

    expect(await screen.findByTestId("binary-placeholder")).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });
});
