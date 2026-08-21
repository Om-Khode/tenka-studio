"use client";

import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { useSettingsStore, selectDirtyKeys } from "@/store/settings-store";
import { useToastStore } from "@/store/toast-store";
import { ApiError } from "@/services/http";

export function SaveBar() {
  // Narrow reads only: `selectDirtyKeys` allocates a fresh array on every
  // call, so it needs `useShallow` to compare element-wise instead of
  // re-rendering on every unrelated store write. `saving`, `revertAll`, and
  // `save` are read individually rather than via a whole-store
  // `useSettingsStore()` -- this bar sits above a page rendering ~40 rows,
  // and subscribing to the whole store would re-render it on every
  // keystroke in any of them.
  const dirty = useSettingsStore(useShallow(selectDirtyKeys));
  const saving = useSettingsStore((s) => s.saving);
  const revertAll = useSettingsStore((s) => s.revertAll);
  const save = useSettingsStore((s) => s.save);

  if (dirty.length === 0) return null;

  return (
    <div className="sticky bottom-0 z-20 flex items-center justify-between gap-4 border-t border-border bg-bg py-3">
      <span className="font-mono text-[11px] text-bone-subtle">
        {dirty.length} unsaved {dirty.length === 1 ? "change" : "changes"}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={saving} onClick={revertAll}>
          revert
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          onClick={async () => {
            /*
              Milestone-4 blocker 3: save() has no catch of its own (only a
              `finally` that resets `saving` -- see settings-store.ts) and
              can genuinely reject once it is a real PATCH, not a scripted
              demo delay. Without this try/catch, that rejection was an
              unhandled promise rejection with nothing on screen -- the same
              gap PersonalityPanel's setBase() call already guards against.
            */
            try {
              const outcome = await save();
              /*
                Per key, not a boolean. A partial result is the normal case once
                a real backend validates: some keys land, one is refused, and the
                refused one stays dirty with its reason on the row.
              */
              if (outcome.failed.length === 0) {
                useToastStore.getState().push({
                  ok: true,
                  title: `Saved ${outcome.applied.length}`,
                  detail: outcome.needsRestart.length
                    ? `${outcome.needsRestart.length} need a restart.`
                    : undefined,
                });
              } else {
                useToastStore.getState().push({
                  ok: false,
                  title: `${outcome.applied.length} applied, ${outcome.failed.length} refused`,
                  detail: outcome.failed[0].reason,
                });
              }
            } catch (err) {
              // PATCH /v1/settings is gated on `system_control`
              // (assistant/io/api/routes/settings.py:66) while GET /v1/settings
              // is gated on `observe` (:31) -- reading stays at the lowest
              // grant, only writing is gated up. `chat_send` gates neither. A
              // device paired for conversation alone therefore gets a 403 here,
              // and this
              // was the one destructive path that reported it as "Could not
              // save" with the daemon's raw string. Memory's forget-all and
              // enrolment's forget both name it; this now matches them.
              const denied = err instanceof ApiError && err.status === 403;
              useToastStore.getState().push({
                ok: false,
                title: denied ? "This device may not do that" : "Could not save",
                detail: denied
                  ? "Changing settings needs a grant this device doesn't have."
                  : err instanceof Error
                    ? err.message
                    : undefined,
              });
            }
          }}
        >
          {saving ? "saving…" : "save"}
        </Button>
      </div>
    </div>
  );
}
