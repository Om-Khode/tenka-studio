"use client";

import * as React from "react";
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Radix owns role="checkbox", aria-checked, Space, and the disabled
 * semantics -- the same split as Switch (components/ui/Switch.tsx): Radix
 * owns the behaviour, this file owns the paint. Renders as a real,
 * keyboard-focusable control (a button with role="checkbox"), never a div.
 */
export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof RadixCheckbox.Root>) {
  return (
    <RadixCheckbox.Root
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border bg-transparent transition-colors",
        "data-[state=checked]:border-moss data-[state=checked]:bg-moss",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator>
        <Check size={11} className="text-bg" strokeWidth={3} />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
