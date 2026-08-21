"use client";

import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/**
 * Radix owns the parts that are easy to ship subtly broken: focus trap, focus
 * restore on close, Escape, aria-modal, scroll lock, and an inert background.
 * We own only the styling.
 */
export const Dialog = RadixDialog.Root;
export const DialogTitle = RadixDialog.Title;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixDialog.Content>) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm" />
      <RadixDialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2",
          "rounded-lg border border-border-strong bg-bg p-6 shadow-2xl",
          className,
        )}
        {...props}
      >
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof RadixDialog.Description>) {
  return (
    <RadixDialog.Description
      className={cn("mt-2 text-sm text-bone-dim", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-6 flex justify-end gap-2", className)} {...props} />;
}
