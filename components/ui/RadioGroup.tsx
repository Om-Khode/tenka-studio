"use client";

import * as React from "react";
import * as RadixRadioGroup from "@radix-ui/react-radio-group";
import { cn } from "@/lib/utils";

/**
 * Radix owns role="radiogroup"/"radio", aria-checked, and -- unlike a native
 * `<input type="radio">` group, which relies on the browser's own arrow-key
 * wiring -- the roving-focus and arrow-key navigation between items too,
 * implemented in JS rather than left to native form-control behaviour. Same
 * paint-only split as Switch and Checkbox.
 */
export const RadioGroup = RadixRadioGroup.Root;

export function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadixRadioGroup.Item>) {
  return (
    <RadixRadioGroup.Item
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-transparent transition-colors",
        "data-[state=checked]:border-moss",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <RadixRadioGroup.Indicator className="h-2 w-2 rounded-full bg-moss" />
    </RadixRadioGroup.Item>
  );
}
