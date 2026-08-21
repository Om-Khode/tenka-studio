"use client";

import { LiveCommandGrid } from "@/components/commands/live/LiveCommandGrid";

/**
 * Not a re-export of app/demo/commands/page.tsx (milestone 5b, Task "10b"):
 * that page's CommandGrid drives store/demo-engine.ts unconditionally, and
 * the daemon's live catalogue is four commands, not six (see
 * LiveCommandGrid's own doc) -- there is also no live volume readout to
 * hide here, unlike the demo page, because this page never had a
 * demo-engine-backed one to begin with.
 */
export default function LiveCommandsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-display text-xl font-bold text-bone">Commands</h1>
        <p className="mt-1 text-sm text-bone-dim">
          Tell her what to do. She routes it herself — no model picks the stack.
        </p>
      </div>

      <LiveCommandGrid />
    </div>
  );
}
