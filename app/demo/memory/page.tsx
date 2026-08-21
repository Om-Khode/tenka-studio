"use client";

import { ArrowLeft } from "lucide-react";
import { ScopeTabs } from "@/components/memory/ScopeTabs";
import { MemoryToolbar } from "@/components/memory/MemoryToolbar";
import { EntityList } from "@/components/memory/EntityList";
import { MemoryDetail } from "@/components/memory/MemoryDetail";
import { useMemoryStore } from "@/store/memory-store";
import { cn } from "@/lib/utils";

/**
 * Hydration and the idle -> load() kick live in app/demo/layout.tsx, not
 * here -- DangerZone (from /demo/settings) and the Sidebar's entity-count
 * badge (every route) both read store/memory-store.ts before a user might
 * ever visit this page. A direct visit here still works: the layout wraps
 * every /demo/* route, so it has already fired by the time this mounts.
 */
/*
 * `h-full` works here because the layout's <main> is `min-h-0 flex-1` inside
 * an `h-dvh` shell, so it has a definite height to measure against. It used to
 * be `h-[calc(100vh-8.5rem)]` -- the Topbar's height plus the layout's
 * padding, transcribed by hand -- because <main> was `flex-1` with no
 * `min-h-0`: flexbox's default `min-height: auto` let it grow to fit its
 * content, `h-full` resolved against an indefinite height to nothing, the
 * page kept growing, and the WINDOW scrolled instead of the list, which hands
 * @tanstack/react-virtual an unbounded scroll element and no reason to
 * virtualize at all. The workaround was correct and the arithmetic was a
 * liability; see components/shell/shell-classes.ts for the fix.
 */
const PAGE_SHELL = "flex h-full flex-col gap-3 overflow-hidden p-4 lg:p-8";

export default function MemoryPage() {
  /*
   * Below `lg` the list and the detail share the width, so the page shows one
   * at a time: the list until something is picked, the detail after. Driven
   * off the selection the store already holds rather than a second mode flag,
   * so the two can never disagree about which pane is live. Both stay mounted
   * (`hidden lg:flex`) -- unmounting EntityList would throw away the virtual
   * list's scroll offset on every selection.
   */
  const selectedId = useMemoryStore((s) => s.selectedId);
  const select = useMemoryStore((s) => s.select);
  const hasSelection = selectedId !== null;

  return (
    <div className={PAGE_SHELL}>
      <ScopeTabs />
      <MemoryToolbar />
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <div
          className={cn(
            "min-h-0 flex-1 flex-col rounded-lg border border-border lg:flex",
            hasSelection ? "hidden" : "flex",
          )}
        >
          <EntityList />
        </div>
        <div
          className={cn(
            "min-h-0 flex-col rounded-lg border border-border lg:flex lg:w-[26rem]",
            hasSelection ? "flex" : "hidden",
          )}
        >
          {/* The way back, and the only one below `lg`: with the list hidden
              there is nothing else on screen that clears the selection. */}
          <button
            type="button"
            onClick={() => select(null)}
            className="flex items-center gap-2 border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-bone-dim transition-colors hover:text-bone lg:hidden"
          >
            <ArrowLeft size={14} aria-hidden />
            back to the list
          </button>
          <MemoryDetail />
        </div>
      </div>
    </div>
  );
}
