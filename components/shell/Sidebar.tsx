"use client";

// Note: this is rendered under app/demo/layout.tsx's "use client" boundary,
// and now also uses a store hook directly, so it declares "use client" itself.
// Don't add server-only logic (data fetching, secrets) to this or PairedDeviceCard.
import Link from "next/link";
import { PairedDeviceCard } from "./PairedDeviceCard";
import { NAV_ITEMS, useNavBadgeValues } from "./nav-items";
import { cn } from "@/lib/utils";
import type { RepoMode } from "@/services/repo-registry";

/**
 * `basePath`/`mode` are props (Milestone 5b Task 9), not a hardcoded
 * `/demo` -- app/demo/layout.tsx passes `basePath="/demo" mode="demo"`,
 * app/app/layout.tsx passes `basePath="/app" mode="live"`, and every nav
 * href below is built from `basePath`, never a literal.
 *
 * Desktop only. Below `lg` the same NAV_ITEMS are rendered by
 * components/shell/BottomNav.tsx as a bottom tab bar -- a 15rem rail into a
 * 390px viewport leaves the page 8rem to live in. Hidden with a class rather
 * than a width query in JS: a rendered-then-measured rail flashes at its full
 * width on first paint, and a media query does not.
 */
export function Sidebar({
  activePath,
  basePath,
  mode,
}: {
  activePath: string;
  basePath: string;
  mode: RepoMode;
}) {
  const badges = useNavBadgeValues();
  return (
    <aside className="hidden h-full w-60 flex-col justify-between border-r border-border bg-bg p-4 lg:flex">
      <div>
        <div className="mb-4 flex items-center gap-2 border-b border-border px-2 pb-4">
          <span className="h-2 w-2 rounded-full bg-amber" />
          <span className="font-display text-sm font-bold text-bone">TENKA</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-bone-ghost">
            studio
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ label, path, icon: Icon, badge }) => {
            const href = `${basePath}${path}`;
            const isActive = activePath === href;
            const badgeValue = badge ? badges[badge] : undefined;
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-card text-bone" : "text-bone-dim hover:bg-card hover:text-bone"
                )}
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {badgeValue && (
                  <span className="font-mono text-[10px] text-bone-ghost">{badgeValue}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      {/*
        No live equivalent exists yet -- there is no repository call for
        device/tunnel status, so showing this under /app would mean
        fabricated latency and uptime numbers under live chrome. Hidden
        rather than invented, the same treatment Task 9 gives the Commands
        page's demo-only volume readout.
      */}
      {mode === "demo" && <PairedDeviceCard />}
    </aside>
  );
}
