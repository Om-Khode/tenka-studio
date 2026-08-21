"use client";

import { useSettingsStore } from "@/store/settings-store";

/**
 * Only reachable after a SUCCESSFUL save of a restart-flagged key -- the
 * store never adds a rejected key here, because a rejected key changed
 * nothing.
 */
export function RestartBanner() {
  const pending = useSettingsStore((s) => s.pendingRestart);
  const dismiss = useSettingsStore((s) => s.dismissRestart);

  if (pending.length === 0) return null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-gold/40 bg-gold/5 px-3 py-2">
      <p className="text-xs text-bone-dim">
        Saved, but she has to restart before these take effect:{" "}
        <span className="font-mono text-[11px] text-gold">{pending.join(", ")}</span>
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="font-mono text-[10px] uppercase tracking-wide text-bone-ghost hover:text-bone"
      >
        dismiss
      </button>
    </div>
  );
}
