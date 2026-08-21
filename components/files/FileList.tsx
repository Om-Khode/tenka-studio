"use client";

import { useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileRow } from "./FileRow";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { Skeleton } from "@/components/ui/skeleton";
import { useFileStore, selectVisibleEntries } from "@/store/file-store";
import { formatBytes, formatDate } from "@/lib/format";
import type { FileNode } from "@/types/file";

export const ROW_HEIGHT_PX = 44;

export interface FileListProps {
  onRename: (node: FileNode) => void;
  onDelete: (node: FileNode) => void;
  onDownload: (node: FileNode) => void;
}

export function FileList({ onRename, onDelete, onDownload }: FileListProps) {
  // Narrow reads, `useShallow` only on the one selector that allocates
  // (milestone 5b, Task 12). `selectVisibleEntries` filters and sorts into a
  // fresh array on every call, so a reference check would re-render this
  // virtualised list on every unrelated store write -- a content preview
  // loading, a toast firing. The scalar reads below need no wrapper.
  const rows = useFileStore(useShallow(selectVisibleEntries));
  const status = useFileStore((s) => s.status);
  const query = useFileStore((s) => s.query);
  const selectedId = useFileStore((s) => s.selectedId);
  // Milestone 5b, Task "10b": this directory's listing now comes through
  // FilesRepo (demo or live) instead of a synchronous seedTree() call, so
  // there is a real loading and error state to render -- the same shape
  // components/memory/EntityList.tsx already has for memory-store.ts. Gated
  // on this directory having no cache entry yet, not on the store's global
  // `status` alone: each directory's raw listing is cached independently
  // (rawByDir), so a background re-fetch of the CURRENT directory -- or of
  // one the user has already navigated away from -- must not flash a
  // skeleton over rows already sitting in entriesByDir.
  const cached = useFileStore((s) => s.entriesByDir[s.currentDirId] !== undefined);
  const load = useFileStore((s) => s.load);
  const openDir = useFileStore((s) => s.openDir);
  const select = useFileStore((s) => s.select);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 8,
  });

  if (!cached && status !== "error") {
    return (
      <div aria-label="Loading this folder" className="flex flex-col gap-1 p-2">
        {Array.from({ length: 6 }, (_, i) => (
          // h-11 = 44px = ROW_HEIGHT_PX. Tailwind's scanner needs a literal
          // class string, not an interpolated one, so this can't reference
          // the constant directly.
          <Skeleton key={i} className="h-11 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!cached && status === "error") {
    // `files`, because that is what GET /v1/files requires. A device paired
    // without it reads a boundary and no retry button here, not a claim that
    // she is unreachable -- she is answering fine, she is saying no.
    return (
      <LoadFailure
        capability="files"
        unreachable="She could not reach this folder."
        onRetry={() => void load()}
        className="flex-1"
      />
    );
  }

  if (rows.length === 0) {
    const searching = query.trim().length > 0;
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-sm text-bone-ghost">
          {searching ? "No match in this folder." : "Nothing here."}
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const node = rows[item.index];
          return (
            <div
              key={node.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: item.size,
                transform: `translateY(${item.start}px)`,
              }}
            >
              <FileRow
                node={node}
                selected={selectedId === node.id}
                sizeLabel={formatBytes(node.sizeBytes)}
                dateLabel={formatDate(node.modifiedAt)}
                onActivate={() => (node.kind === "dir" ? openDir(node.id) : select(node.id))}
                onRename={() => onRename(node)}
                onDelete={() => onDelete(node)}
                onDownload={() => onDownload(node)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
