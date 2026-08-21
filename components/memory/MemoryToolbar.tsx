"use client";

import { useShallow } from "zustand/react/shallow";
import { useMemoryStore, selectEntityTypes } from "@/store/memory-store";
import type { EntitySort } from "@/types/memory";

const SORTS: { value: EntitySort; label: string }[] = [
  { value: "facts", label: "most facts" },
  { value: "name", label: "name" },
  { value: "recent", label: "recently updated" },
];

const FIELD =
  "rounded-md border border-border bg-transparent px-3 py-1.5 font-mono text-xs text-bone " +
  "placeholder:text-bone-ghost focus:border-border-strong focus:outline-none";

export function MemoryToolbar() {
  // Narrow reads (Task 12); only selectEntityTypes allocates -- it dedupes
  // and sorts into a fresh array -- so only it is wrapped.
  const types = useMemoryStore(useShallow(selectEntityTypes));
  const scope = useMemoryStore((s) => s.scope);
  const query = useMemoryStore((s) => s.query);
  const typeFilter = useMemoryStore((s) => s.typeFilter);
  const sort = useMemoryStore((s) => s.sort);
  const setQuery = useMemoryStore((s) => s.setQuery);
  const setTypeFilter = useMemoryStore((s) => s.setTypeFilter);
  const setSort = useMemoryStore((s) => s.setSort);
  const knowledge = scope === "knowledge";

  const placeholder =
    scope === "knowledge"
      ? "search what she knows…"
      : scope === "preferences"
        ? "search preferences…"
        : "search procedures…";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        aria-label="Search memory"
        onChange={(e) => setQuery(e.target.value)}
        className={`${FIELD} min-w-0 flex-1`}
      />
      {knowledge && (
        <>
          <select
            aria-label="Entity type"
            value={typeFilter ?? ""}
            onChange={(e) => setTypeFilter(e.target.value || null)}
            className={FIELD}
          >
            <option value="">all types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as EntitySort)}
            className={FIELD}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
