"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFileStore } from "@/store/file-store";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FilePreview() {
  // Deliberately not selectVisibleEntries: that selector filters by the
  // search query and sorts the whole directory, so (a) a query that excludes
  // the selected file would blank the preview even though the selection is
  // still live, and (b) it would re-run a full sort of an 802-entry directory
  // on every keystroke just to look up one row. entriesByDir[currentDirId] is
  // the unfiltered, unsorted listing -- a lookup, not a query.
  const previewOpen = useFileStore((s) => s.previewOpen);
  const selectedId = useFileStore((s) => s.selectedId);
  const entries = useFileStore((s) => s.entriesByDir[s.currentDirId]);
  const togglePreview = useFileStore((s) => s.togglePreview);
  // Both keyed by the selection inside the selector rather than pulling the
  // whole map out: a body arriving for some other file must not re-render
  // this pane.
  const fetched = useFileStore((s) => (s.selectedId ? s.contentById[s.selectedId] : undefined));
  const contentStatus = useFileStore((s) =>
    s.selectedId ? s.contentStatusById[s.selectedId] : undefined,
  );
  const readContent = useFileStore((s) => s.readContent);

  const node = (entries ?? []).find((n) => n.id === selectedId) ?? null;
  // Metadata (name, size) always comes from the listing -- that is the copy
  // the overlay's renames have been applied to. Only the body-shaped fields
  // are read off the fetched node.
  const body = fetched ?? node;
  const contentKind = body?.contentKind ?? null;

  /**
   * Whether this node's body still has to be fetched. Three things say no: a
   * directory has none; a binary is never rendered (see the placeholder
   * below), so the round trip would buy nothing to show; and a listing that
   * already inlined `content` has by definition already delivered it -- the
   * demo repository's seed does exactly that, which is why /demo never pays
   * for a second call, while the daemon's listing carries metadata only.
   */
  const needsBody =
    node !== null && node.kind === "file" && contentKind !== "binary" && node.content === undefined;

  useEffect(() => {
    if (previewOpen && node && needsBody) void readContent(node);
    // `node` is re-derived on every store change; its id is what actually
    // identifies the fetch, and readContent() refuses a duplicate anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen, node?.id, needsBody]);

  if (!previewOpen) return null;

  const loading = needsBody && contentStatus !== "ready" && contentStatus !== "error";
  const failed = needsBody && contentStatus === "error";
  const showBody = node !== null && !loading && !failed;

  return (
    <aside
      className={cn(
        "min-h-0 flex-1 flex-col rounded-md border border-border lg:flex lg:max-w-md",
        // Nothing chosen yet: on desktop this is a standing column and the
        // "pick a file" line below tells you what it is for. Below `lg` it is
        // a whole screen of empty pane stacked under the listing, saying to
        // pick a file while occupying the space the files are in.
        node === null ? "hidden" : "flex",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="truncate font-mono text-xs text-bone-dim">
          {node ? node.name : "preview"}
        </span>
        <button
          type="button"
          aria-label="Close preview"
          onClick={() => togglePreview()}
          className="text-bone-ghost transition-colors hover:text-bone"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!node && (
          <p className="pt-8 text-center text-sm text-bone-ghost">
            Pick a file and she&apos;ll show you what is in it.
          </p>
        )}

        {/* Same skeleton/error pair FileList grows for a directory listing --
            one pane's worth of lines instead of one folder's worth of rows. */}
        {loading && (
          <div aria-label="Loading this file" className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-3 w-full rounded-sm" />
            ))}
          </div>
        )}

        {failed && (
          <div className="flex flex-col items-center gap-3 px-6 pt-8 text-center">
            <p className="text-sm text-bone-dim">She could not read this file.</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (node) void readContent(node);
              }}
            >
              try again
            </Button>
          </div>
        )}

        {/* The daemon caps how much of a body it returns. A partial file
            rendered as if it were whole is a wrong answer with no tell on it,
            so this says so above the content rather than in a tooltip. */}
        {showBody && body?.truncated && (
          <p
            data-testid="truncated-notice"
            className="mb-3 rounded-md border border-amber/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-amber"
          >
            truncated — this is the start of the file, not all of it
          </p>
        )}

        {showBody && contentKind === "text" && (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-bone-dim">
            {body?.content}
          </pre>
        )}

        {showBody && contentKind === "code" && (
          <CodeBlock language={body?.language ?? "text"} code={body?.content ?? ""} />
        )}

        {showBody && contentKind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element -- data URI has no remote origin for next/image to optimize, and Image demands width/height
          <img
            src={body?.content}
            alt={node.name}
            className="max-h-80 w-full rounded-md border border-border object-contain"
          />
        )}

        {showBody && contentKind === "binary" && (
          <div
            data-testid="binary-placeholder"
            className="rounded-md border border-border p-6 text-center"
          >
            <p className="font-mono text-xs uppercase tracking-wide text-bone-ghost">
              {node.name.split(".").pop()}
            </p>
            <p className="mt-2 text-sm text-bone-dim">{formatBytes(node.sizeBytes)}</p>
            <p className="mt-3 text-xs text-bone-ghost">
              She won&apos;t pretend to render this one.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
