"use client";

import { useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EntityRow } from "./EntityRow";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMemoryStore,
  selectVisibleEntities,
  selectVisiblePreferences,
  selectVisibleProcedures,
  factCountFor,
} from "@/store/memory-store";
import type { MemoryScope } from "@/types/memory";

export const ENTITY_ROW_HEIGHT_PX = 52;

/**
 * Keyed by `MemoryScope`, not `string` (milestone 5b, Task 12). Typed loosely,
 * a fourth scope added to types/memory.ts compiled fine and shipped
 * `aria-label={undefined}` on the listbox -- a screen reader announcing an
 * unlabelled list, discoverable only by using one. Typed this way it is a
 * compile error at the point the scope is added.
 */
const SCOPE_LABELS: Record<MemoryScope, string> = {
  knowledge: "Entities",
  preferences: "Preferences",
  procedures: "Procedures",
};

/** Every scope's list allocates, so all three go through `useShallow`. */
const EMPTY: never[] = [];

export function EntityList() {
  // Narrow reads (Task 12). The three list selectors filter and sort into
  // fresh arrays, so each needs `useShallow` to compare element-wise; scope,
  // query, status, selectedId and the actions do not. The off-scope lists
  // resolve to one shared frozen-empty array rather than a `[]` literal, which
  // would be a new reference on every render and defeat the memoisation.
  const scope = useMemoryStore((s) => s.scope);
  const status = useMemoryStore((s) => s.status);
  const query = useMemoryStore((s) => s.query);
  const selectedId = useMemoryStore((s) => s.selectedId);
  const load = useMemoryStore((s) => s.load);
  const select = useMemoryStore((s) => s.select);
  const entities = useMemoryStore(
    useShallow((s) => (s.scope === "knowledge" ? selectVisibleEntities(s) : EMPTY)),
  );
  const preferences = useMemoryStore(
    useShallow((s) => (s.scope === "preferences" ? selectVisiblePreferences(s) : EMPTY)),
  );
  const procedures = useMemoryStore(
    useShallow((s) => (s.scope === "procedures" ? selectVisibleProcedures(s) : EMPTY)),
  );
  // factCountFor reads `facts`, which no other read above subscribes to.
  const facts = useMemoryStore((s) => s.facts);
  const rowCount = entities.length + preferences.length + procedures.length;
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ENTITY_ROW_HEIGHT_PX,
    overscan: 8,
  });

  if (status === "loading" || status === "idle") {
    return (
      <div aria-label="Loading memory" className="flex flex-col gap-2 p-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (status === "error") {
    // `recall` -- every GET /v1/memory/* route requires it. It is the
    // capability an `observe`-only phone most visibly lacks, and the one this
    // panel used to report as "she could not reach her memory".
    return (
      <LoadFailure
        capability="recall"
        unreachable="She could not reach her memory."
        onRetry={() => void load()}
        className="flex-1"
      />
    );
  }

  if (rowCount === 0) {
    const searching = query.trim().length > 0;
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-sm text-bone-ghost">
          {searching ? "No match in what she knows." : "Nothing here yet."}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      role="listbox"
      aria-label={SCOPE_LABELS[scope]}
      className="flex-1 overflow-y-auto"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={`${scope}-${item.index}`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: item.size,
              transform: `translateY(${item.start}px)`,
            }}
          >
            {scope === "knowledge" && (
              <EntityRow
                entity={entities[item.index]}
                selected={selectedId === entities[item.index].id}
                factCount={factCountFor({ facts }, entities[item.index].id)}
                onSelect={() => select(entities[item.index].id)}
              />
            )}
            {scope === "preferences" && (
              <button
                type="button"
                role="option"
                aria-selected={selectedId === item.index}
                onClick={() => select(item.index)}
                className="flex h-[52px] w-full flex-col justify-center rounded-md px-3 text-left hover:bg-card"
              >
                <span className="truncate text-sm text-bone">{preferences[item.index].value}</span>
                <span className="font-mono text-[10px] text-bone-ghost">
                  {preferences[item.index].key}
                </span>
              </button>
            )}
            {scope === "procedures" && (
              <button
                type="button"
                role="option"
                aria-selected={selectedId === procedures[item.index].id}
                onClick={() => select(procedures[item.index].id)}
                className="flex h-[52px] w-full flex-col justify-center rounded-md px-3 text-left hover:bg-card"
              >
                <span className="truncate text-sm text-bone">{procedures[item.index].name}</span>
                <span className="font-mono text-[10px] text-bone-ghost">
                  {procedures[item.index].steps.length} steps · run {procedures[item.index].runCount}×
                </span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
