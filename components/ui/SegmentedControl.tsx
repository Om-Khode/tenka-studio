"use client";

import { cn } from "@/lib/utils";

export interface SegmentedControlProps<T extends string> {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the tablist. */
  label: string;
  className?: string;
}

/**
 * Extracted from files/RootTabs so Memory's scope switcher and Files' root
 * switcher cannot drift apart. Horizontal scroll rather than wrapping: below
 * md the strip must not divide the width three ways.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("flex gap-1 overflow-x-auto rounded-md border border-border p-1", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors",
              active ? "bg-card text-bone" : "text-bone-ghost hover:text-bone-dim",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
