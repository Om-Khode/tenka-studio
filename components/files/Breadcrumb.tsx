"use client";

import { ChevronRight } from "lucide-react";
import { useFileStore, crumbsFor } from "@/store/file-store";

/** Depth lives here rather than in a tree column — see the spec's scale table. */
export function Breadcrumb() {
  const currentDirId = useFileStore((s) => s.currentDirId);
  const goTo = useFileStore((s) => s.goTo);
  const crumbs = crumbsFor(currentDirId);

  return (
    // flex-wrap: a path a few folders deep is wider than a phone, and a
    // breadcrumb that overflows takes the whole page's horizontal scroll
    // with it.
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 font-mono text-xs">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.id} data-testid="crumb" className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-bone-ghost" aria-hidden />}
            {isLast ? (
              <span aria-current="page" className="text-bone">
                {crumb.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => goTo(crumb.id)}
                className="text-bone-ghost transition-colors hover:text-bone"
              >
                {crumb.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
