"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { File, FileCode, FileImage, Folder, MoreVertical } from "lucide-react";
import type { FileNode } from "@/types/file";
import { cn } from "@/lib/utils";

function iconFor(node: FileNode) {
  if (node.kind === "dir") return Folder;
  if (node.contentKind === "code") return FileCode;
  if (node.contentKind === "image") return FileImage;
  return File;
}

export interface FileRowProps {
  node: FileNode;
  selected: boolean;
  sizeLabel: string;
  dateLabel: string;
  onActivate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDownload: () => void;
}

const menuItemClass =
  "block w-full cursor-default select-none rounded-sm px-2 py-1.5 text-left font-mono text-xs text-bone outline-none data-[highlighted]:bg-card data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40";

export function FileRow({
  node,
  selected,
  sizeLabel,
  dateLabel,
  onActivate,
  onRename,
  onDelete,
  onDownload,
}: FileRowProps) {
  const Icon = iconFor(node);
  // Bytes already in hand, or bytes that can still be fetched. A live
  // listing carries no bodies at all -- `content` arrives only once
  // FilesRepo.read() has run (milestone 5b, Task "10c") -- so gating on
  // `content` alone disabled Download on every row under live chrome.
  // Binaries stay disabled in both trees: the demo has no mock content for
  // them and the daemon's content route has no bytes for them either, and
  // saving an empty file is worse than refusing to save one.
  const downloadable =
    node.kind === "file" &&
    (Boolean(node.content) || (node.contentKind != null && node.contentKind !== "binary"));

  return (
    <div
      data-testid="file-row"
      data-selected={String(selected)}
      className={cn(
        "flex h-11 items-center gap-3 rounded-md px-3 transition-colors",
        selected ? "bg-card" : "hover:bg-card-hover",
      )}
    >
      <button
        type="button"
        onClick={onActivate}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Icon size={15} className="shrink-0 text-bone-subtle" aria-hidden />
        <span className="truncate text-sm text-bone">{node.name}</span>
      </button>

      <span className="hidden w-20 shrink-0 text-right font-mono text-xs text-bone-ghost sm:block">
        {sizeLabel}
      </span>
      <span className="hidden w-28 shrink-0 text-right font-mono text-xs text-bone-ghost md:block">
        {dateLabel}
      </span>

      {/*
        Radix owns dismissal (Escape, outside pointerdown, focus loss),
        focus restore to the trigger, and arrow-key navigation. It also
        portals Content to the document body, which escapes this row's
        virtualizer-induced stacking context (the row wrapper's
        `transform: translateY(...)` in FileList.tsx creates one) so the
        panel can no longer be painted over by rows below it.
      */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${node.name}`}
            className="shrink-0 rounded-sm p-1 text-bone-ghost transition-colors hover:text-bone"
          >
            <MoreVertical size={14} aria-hidden />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-20 w-36 rounded-md border border-border-strong bg-bg p-1 shadow-xl"
          >
            <DropdownMenu.Item className={menuItemClass} onSelect={() => onRename()}>
              rename
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={menuItemClass}
              disabled={!downloadable}
              onSelect={() => onDownload()}
            >
              download
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={cn(menuItemClass, "text-fail")}
              onSelect={() => onDelete()}
            >
              delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
