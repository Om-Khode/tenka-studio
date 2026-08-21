"use client";

import { useEffect, useState } from "react";
import { RootTabs } from "@/components/files/RootTabs";
import { Breadcrumb } from "@/components/files/Breadcrumb";
import { FileToolbar } from "@/components/files/FileToolbar";
import { FileList } from "@/components/files/FileList";
import { FilePreview } from "@/components/files/FilePreview";
import { RenameDialog } from "@/components/files/RenameDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useFileStore } from "@/store/file-store";
import { useToastStore } from "@/store/toast-store";
import { getRepoMode } from "@/services/repo-registry";
import { downloadNode } from "@/lib/download";
import { cn } from "@/lib/utils";
import type { FileNode } from "@/types/file";

export default function FilesPage() {
  const entriesByDir = useFileStore((s) => s.entriesByDir);
  const currentDirId = useFileStore((s) => s.currentDirId);
  // Whether there is a second pane to swap to below `lg` -- see the note on
  // the split container below.
  const showsPreview = useFileStore((s) => s.previewOpen && s.selectedId !== null);
  const status = useFileStore((s) => s.status);
  const load = useFileStore((s) => s.load);
  const rename = useFileStore((s) => s.rename);
  const remove = useFileStore((s) => s.remove);
  const readContent = useFileStore((s) => s.readContent);
  const push = useToastStore((s) => s.push);
  const live = getRepoMode() === "live";

  const [renaming, setRenaming] = useState<FileNode | null>(null);
  const [deleting, setDeleting] = useState<FileNode | null>(null);

  // The store starts with nothing fetched (milestone 5b, Task "10b" --
  // entriesByDir used to be seedTree() at module scope, which is exactly the
  // "seed data under live chrome" bug this page exists to not have). Kick
  // off the first directory's load here; openDir/goTo/setRoot handle every
  // navigation after this one. Only fires once per status==="idle" spell,
  // not on every render.
  useEffect(() => {
    if (status === "idle") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const siblingNames = (entriesByDir[currentDirId] ?? []).map((n) => n.name);

  // The store hands back the toast rather than this page assembling one,
  // because only the store knows whether the mutation actually happened
  // (milestone 5b, Task "10c"): in live mode these go to the daemon, and a
  // refused delete must not be announced as a success carrying an undo that
  // could never put a real file back.
  async function confirmDelete(node: FileNode) {
    push(await remove(node.id));
  }

  /**
   * A live listing carries metadata only -- the bytes are a second call
   * (`FilesRepo.read()`). Fetching them on demand is what lets a real file
   * actually save; before this, every live download was refused with demo
   * copy about "a stand-in with no bytes behind it". Binaries are skipped
   * deliberately: the daemon's content route has nothing saveable for them,
   * so the round trip would only delay the same honest refusal.
   */
  async function downloadFile(node: FileNode) {
    if (node.kind === "file" && node.content === undefined && node.contentKind !== "binary") {
      await readContent(node);
    }
    push(downloadNode(useFileStore.getState().contentById[node.id] ?? node));
  }

  // h-full: the layout's <main> now supplies a definite height, so the magic
  // `calc(100vh-8.5rem)` this used to carry is gone. See
  // components/shell/shell-classes.ts and app/demo/memory/page.tsx's note.
  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 overflow-hidden">
      <div>
        <h1 className="font-display text-xl font-bold text-bone">Files</h1>
        {/* Not "Three folders she can reach": this page is re-exported under
            /app (app/app/files/page.tsx), where the roots come from
            FilesRepo.roots() per daemon -- which is the entire reason RootTabs
            exists a few lines below rather than a hardcoded triple. The demo
            seed happens to have three; a real machine's count is not Studio's
            to state. */}
        <p className="mt-1 text-sm text-bone-dim">
          The folders she can reach. Not an explorer — the parts you actually ask for.
        </p>
      </div>

      <RootTabs />

      {/* Below `lg` the listing and the preview share the width, so the page
          shows one at a time -- driven off state the store already keeps
          rather than a second flag. Above `lg` both are visible and
          `previewOpen` alone decides whether the preview pane exists, exactly
          as before.

          `previewOpen && selectedId`, not `previewOpen` on its own: the pane
          starts open with nothing chosen, so keying on it alone opened this
          page on a phone showing "Pick a file and she'll show you what is in
          it" over a listing the user could not see. There is only a second
          pane to swap to once there is something in it. FilePreview's own ✕
          clears `previewOpen`, which is the way back. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <section
          className={cn(
            "min-h-0 flex-[1.5] flex-col gap-3 rounded-md border border-border p-3 lg:flex",
            showsPreview ? "hidden" : "flex",
          )}
        >
          <Breadcrumb />
          <FileToolbar />
          <FileList
            onRename={setRenaming}
            onDelete={setDeleting}
            onDownload={(node) => void downloadFile(node)}
          />
        </section>

        <FilePreview />
      </div>

      <RenameDialog
        node={renaming}
        siblingNames={siblingNames}
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
        onSubmit={(nextName) => {
          if (!renaming) return;
          void rename(renaming.id, nextName).then(push);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.name}?`}
        // Two sentences, because the promise is genuinely different: demo's
        // undo puts a seeded row back, and there is no such thing for a file
        // the daemon has actually deleted off the disk.
        body={
          live
            ? "She deletes it from the disk. There is no undo."
            : "She removes it from the listing. You get one undo from the toast, then it is gone."
        }
        confirmLabel="delete"
        destructive
        onConfirm={() => {
          if (deleting) void confirmDelete(deleting);
        }}
      />
    </div>
  );
}
