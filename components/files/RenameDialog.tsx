"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { validateName } from "@/store/file-store";
import type { FileNode } from "@/types/file";

export interface RenameDialogProps {
  node: FileNode | null;
  siblingNames: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (nextName: string) => void;
}

export function RenameDialog({
  node,
  siblingNames,
  open,
  onOpenChange,
  onSubmit,
}: RenameDialogProps) {
  const [value, setValue] = useState(node?.name ?? "");

  // Re-seed whenever a different row is opened, or the dialog would show the
  // previous file's name.
  useEffect(() => {
    setValue(node?.name ?? "");
  }, [node?.id, node?.name]);

  const error = validateName(value, siblingNames, node?.name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="font-display text-lg font-bold text-bone">
          Rename {node?.name}
        </DialogTitle>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (error) return;
            onSubmit(value.trim());
            onOpenChange(false);
          }}
        >
          <input
            type="text"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            aria-label="New name"
            aria-invalid={error !== null}
            className="mt-4 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-bone focus:border-border-strong focus:outline-none"
          />
          {error && (
            <p role="alert" className="mt-2 text-xs text-fail">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={error !== null}>
              rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
