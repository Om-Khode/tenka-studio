"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
  className?: string;
}

/** Radix owns typeahead, roving focus, and the listbox ARIA wiring. */
export function Select({
  value,
  onValueChange,
  options,
  label,
  disabled,
  className,
}: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        aria-label={label}
        className={cn(
          "inline-flex min-w-32 items-center justify-between gap-2 rounded-md border border-border",
          "bg-transparent px-3 py-1.5 font-mono text-xs text-bone",
          "hover:border-border-strong focus:outline-none focus-visible:border-border-strong",
          "disabled:cursor-not-allowed disabled:opacity-40",
          className,
        )}
      >
        <RadixSelect.Value />
        <RadixSelect.Icon>
          <ChevronDown size={12} className="text-bone-ghost" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 overflow-hidden rounded-md border border-border-strong bg-bg shadow-2xl"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 font-mono text-xs text-bone-dim outline-none data-[highlighted]:bg-card data-[highlighted]:text-bone"
              >
                <RadixSelect.ItemIndicator>
                  <Check size={12} className="text-amber" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
