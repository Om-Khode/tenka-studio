"use client";

import { useMemoryStore, selectVisiblePreferences } from "@/store/memory-store";
import { KnowledgeDetail } from "./KnowledgeDetail";
import { PreferenceDetail } from "./PreferenceDetail";
import { ProcedureDetail } from "./ProcedureDetail";

/**
 * The shell is shared across scopes; only the body differs. Tasks 11's
 * preference and procedure bodies land in this switch.
 */
export function MemoryDetail() {
  // Narrow reads (Task 12). The preference lookup is resolved down to a key
  // inside the selector rather than pulling the whole visible list out: the
  // list allocates and would need `useShallow`, while the key this shell
  // actually forwards is a string, so an unrelated store write cannot
  // re-render the detail pane at all.
  const scope = useMemoryStore((s) => s.scope);
  const selectedId = useMemoryStore((s) => s.selectedId);
  const preferenceKey = useMemoryStore((s) =>
    s.scope === "preferences" && s.selectedId !== null
      ? (selectVisiblePreferences(s)[s.selectedId]?.key ?? null)
      : null,
  );

  if (selectedId === null) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-sm text-bone-ghost">Pick something on the left.</p>
      </div>
    );
  }

  // Remount on selection change: KnowledgeDetail owns per-entity UI state
  // (show-all-facts) that must not survive a switch to a different entity.
  if (scope === "knowledge") return <KnowledgeDetail key={selectedId} entityId={selectedId} />;
  if (scope === "procedures") return <ProcedureDetail procedureId={selectedId} />;

  // Preferences key on a string; selectedId carries the index into the
  // visible list rather than widening the store's id type for one scope.
  if (preferenceKey === null) return null;
  return <PreferenceDetail preferenceKey={preferenceKey} />;
}
