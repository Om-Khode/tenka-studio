"use client";

import { CommandGrid } from "@/components/commands/CommandGrid";
import { useDemoStore } from "@/store/demo-engine";
import { getRepoMode } from "@/services/repo-registry";

export default function CommandsPage() {
  const volumePct = useDemoStore((s) => s.systemStats.volumePct);
  // This page is re-exported verbatim onto /app/commands (Milestone 5b Task
  // 9) -- demo-engine's simulated volume has no live counterpart (nothing
  // wires an interval for it outside app/demo/layout.tsx's useCommandRun()/
  // useDemoClock()), so under live mode it would sit frozen at its initial
  // value forever. Hiding it is the same "known limitation, not fixed"
  // treatment the plan gives RAM-as-percentage and backup progress,
  // rather than showing a fabricated number under live chrome.
  const isDemo = getRepoMode() === "demo";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-bone">Commands</h1>
          <p className="mt-1 text-sm text-bone-dim">
            Tell her what to do. She routes it herself — no model picks the stack.
          </p>
        </div>
        {isDemo && (
          <span className="shrink-0 font-mono text-xs text-bone-ghost">
            volume · {volumePct}%
          </span>
        )}
      </div>

      <CommandGrid />
    </div>
  );
}
