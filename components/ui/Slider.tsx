"use client";

import * as React from "react";
import * as RadixSlider from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface SliderProps extends React.ComponentProps<typeof RadixSlider.Root> {
  thumbLabel?: string;
}

/** Radix owns arrow-key stepping, Home/End, and the ARIA value attributes. */
export function Slider({
  className,
  thumbLabel = "value",
  ...props
}: SliderProps) {
  return (
    <RadixSlider.Root
      className={cn(
        "relative flex h-5 w-32 touch-none select-none items-center",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    >
      <RadixSlider.Track className="relative h-1 w-full grow rounded-full bg-border">
        <RadixSlider.Range className="absolute h-full rounded-full bg-amber" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        className="block h-3.5 w-3.5 rounded-full border border-border-strong bg-bone focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        aria-label={thumbLabel}
      />
    </RadixSlider.Root>
  );
}
