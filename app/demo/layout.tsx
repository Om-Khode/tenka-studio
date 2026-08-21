"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { BottomNav } from "@/components/shell/BottomNav";
import { Topbar } from "@/components/shell/Topbar";
import { SHELL, MAIN } from "@/components/shell/shell-classes";
import { Toaster } from "@/components/ui/Toaster";
import { useChatHydration } from "@/hooks/useChatHydration";
import { useCommandRun } from "@/hooks/useCommandRun";
import { useFileHydration } from "@/hooks/useFileHydration";
import { useMemoryHydration } from "@/hooks/useMemoryHydration";
import { useMemoryStore } from "@/store/memory-store";
import { switchMode } from "@/services/persist";
import { demoRepoBundle } from "@/services/repos/demo";

const TITLES: Record<string, string> = {
  "/demo": "DASHBOARD",
  "/demo/chat": "CHAT",
  "/demo/commands": "COMMANDS",
  "/demo/files": "FILES",
  "/demo/memory": "MEMORY",
  "/demo/settings": "SETTINGS",
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  // Zustand stores are module singletons and cannot read React context, so
  // this binds the demo bundle imperatively rather than through a provider.
  // Called on every render (cheap and idempotent, not gated behind a ref or
  // effect) so that navigating /app -> /demo in one SPA session re-asserts
  // demo rather than leaving the registry stuck on whatever /app/layout.tsx
  // last configured -- and so it always runs before the hydration hooks
  // below, which is what memory-store.ts's load() (and settings-store.ts's)
  // depend on getRepos() already resolving. switchMode() (not a bare
  // configureRepos()) also resets every store on an actual transition, so a
  // live -> /demo SPA navigation in one session cannot leave a live dataset
  // sitting in memory under demo chrome. See services/persist.ts.
  switchMode("demo", demoRepoBundle);
  // Hydrates store/chat-store.ts once per SPA session, here rather than on
  // the Chat page, so every /demo/* route (not just /demo/chat) sees real
  // persisted data -- see hooks/useChatHydration.ts for why.
  useChatHydration();
  // In the layout, not the Files page: a screenshot command fired from
  // /demo/commands writes into this store, so it must be hydrated before the
  // user has ever visited /demo/files.
  useFileHydration();
  // Also here, not on the Memory page: components/settings/DangerZone.tsx
  // calls forgetAll() from /demo/settings, and Sidebar's live entity-count
  // badge reads this store on every route. Both need the real dataset even
  // if the user never visits /demo/memory -- see hooks/useMemoryHydration.ts.
  useMemoryHydration();
  const memoryStatus = useMemoryStore((s) => s.status);
  const loadMemory = useMemoryStore((s) => s.load);
  useEffect(() => {
    if (memoryStatus === "idle") void loadMemory();
  }, [memoryStatus, loadMemory]);
  // Advances a user-fired command on every /demo route, not just Commands --
  // see hooks/useCommandRun.ts for why the page cannot own this timer.
  useCommandRun();
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "DASHBOARD";
  const isDashboard = pathname === "/demo";

  // Shell shape is shared with app/app/layout.tsx -- keep the two in step.
  // See components/shell/BottomNav.tsx for why the bar is in the flow, and
  // app/demo/memory/page.tsx for what `min-h-0` on <main> buys the pages.
  return (
    <div className={SHELL}>
      <Sidebar activePath={pathname} basePath="/demo" mode="demo" />
      <div className="flex min-h-0 flex-1 flex-col">
        <Topbar breadcrumb={`STUDIO / ${title}`} isDashboard={isDashboard} mode="demo" />
        <main className={MAIN}>{children}</main>
      </div>
      <BottomNav activePath={pathname} basePath="/demo" />
      <Toaster />
    </div>
  );
}
