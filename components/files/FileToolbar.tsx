"use client";

import { PanelRight, RotateCcw, Search } from "lucide-react";
import { useFileStore } from "@/store/file-store";
import { getRepoMode } from "@/services/repo-registry";
import type { SortKey } from "@/types/file";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "name" },
  { value: "size", label: "size" },
  { value: "modified", label: "modified" },
];

export function FileToolbar() {
  const query = useFileStore((s) => s.query);
  const setQuery = useFileStore((s) => s.setQuery);
  const sort = useFileStore((s) => s.sort);
  const setSort = useFileStore((s) => s.setSort);
  const resetDemoFiles = useFileStore((s) => s.resetDemoFiles);
  const togglePreview = useFileStore((s) => s.togglePreview);
  const live = getRepoMode() === "live";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative flex min-w-40 flex-1 items-center">
        <Search size={14} className="absolute left-3 text-bone-ghost" aria-hidden />
        <span className="sr-only">Search this folder</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search this folder..."
          className="w-full rounded-md border border-border bg-transparent py-1.5 pl-9 pr-3 text-sm text-bone placeholder:text-bone-ghost focus:border-border-strong focus:outline-none"
        />
      </label>

      <label className="flex items-center gap-2 font-mono text-xs text-bone-ghost">
        sort
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-bone focus:border-border-strong focus:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={togglePreview}
        aria-label="Toggle preview pane"
        className="rounded-md border border-border p-2 text-bone-ghost transition-colors hover:border-border-strong hover:text-bone"
      >
        <PanelRight size={14} aria-hidden />
      </button>

      {/* Demo-only, and not merely because the label says so: it resets the
          local overlay, which live listings are no longer rendered through
          at all (see file-store's effectiveOverlay). Under live chrome this
          was a button offering to restore a pristine demo tree that the
          machine does not have, and after Task "10c" it would also do
          nothing. */}
      {!live && (
        <button
          type="button"
          onClick={resetDemoFiles}
          aria-label="Reset demo files"
          title="Restore the pristine demo tree"
          className="rounded-md border border-border p-2 text-bone-ghost transition-colors hover:border-border-strong hover:text-bone"
        >
          <RotateCcw size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
