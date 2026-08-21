"use client";

import * as React from "react";
import * as RadixSwitch from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

/**
 * Radix owns role="switch", aria-checked, Space/Enter, and the disabled
 * semantics. We own the paint.
 */
export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border border-border transition-colors",
        "data-[state=checked]:bg-moss data-[state=unchecked]:bg-card",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block h-3.5 w-3.5 translate-x-1 rounded-full bg-bone transition-transform data-[state=checked]:translate-x-4" />
    </RadixSwitch.Root>
  );
}
