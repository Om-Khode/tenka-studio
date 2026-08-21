"use client";

import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "./dialog";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Tints the confirm button and is exposed for tests as data-destructive. */
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="font-display text-lg font-bold text-bone">{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            data-destructive={String(destructive)}
            className={cn(destructive && "bg-fail text-bone hover:bg-fail/85")}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
