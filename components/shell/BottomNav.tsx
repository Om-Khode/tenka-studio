"use client";

import Link from "next/link";
import { NAV_ITEMS, useNavBadgeValues } from "./nav-items";
import { cn } from "@/lib/utils";

/**
 * The nav below `lg`, where components/shell/Sidebar.tsx's 15rem rail does not
 * fit. Same NAV_ITEMS, same `basePath` contract, same badges -- see
 * components/shell/nav-items.ts.
 *
 * A bottom bar rather than a hamburger drawer: six destinations, none more
 * important than another, each one thumb tap away with no state to open first.
 * A drawer would have been less new code, but the public demo's whole job is
 * to show a stranger what Studio is, and a drawer hides the answer behind a
 * gesture.
 *
 * Rendered as the last child of the layout's flex column, NOT `position:
 * fixed`. A fixed bar has to be cleared by bottom padding on whatever scrolls
 * beneath it, and that padding has to be kept in step with the bar's height
 * forever; in the flow it takes its own space out of the shell and the scroll
 * container above shrinks to match, with nothing to keep in step.
 *
 * `PairedDeviceCard` has no counterpart here on purpose. It is supporting
 * detail, not a destination, and there is no room for it at this width.
 */
export function BottomNav({ activePath, basePath }: { activePath: string; basePath: string }) {
  const badges = useNavBadgeValues();

  return (
    <nav
      aria-label="Primary"
      /* pb-[env(...)] clears the iPhone home indicator, which overlays the
         bottom of the viewport and would otherwise sit on top of the labels.
         It resolves to 0px everywhere else. */
      className="flex shrink-0 items-stretch border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {NAV_ITEMS.map(({ label, path, icon: Icon, badge }) => {
        const href = `${basePath}${path}`;
        const isActive = activePath === href;
        const badgeValue = badge ? badges[badge] : undefined;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            /* min-h-12 rather than padding alone: the label's line box is the
               only thing setting the height otherwise, and it lands well under
               the 44px a thumb needs.

               min-w-0 alongside flex-1: a flex item's automatic minimum width
               is its content's own width unless this is set, so without it
               six items refuse to shrink below their labels' full text width
               and the row overflows the bar instead of the label ever
               truncating -- see the label span's own `truncate` below, which
               has nothing to engage against otherwise. */
            className={cn(
              "flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors",
              isActive ? "text-amber" : "text-bone-dim",
            )}
          >
            <span className="relative">
              <Icon size={18} />
              {badgeValue && (
                <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-card px-1 text-center font-mono text-[9px] leading-4 text-bone-subtle">
                  {badgeValue}
                </span>
              )}
            </span>
            <span className="max-w-full truncate text-[10px] leading-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
