"use client";

import { useEffect } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useFileStore, rootOf, humanize } from "@/store/file-store";

/**
 * A segmented control, not a folder column. The PRD rules out a full
 * explorer and the roots stay few enough that a column would spend ~90px
 * forever to render them -- width the 800-row list needs more.
 *
 * The root list itself comes from the store's `roots` (FilesRepo.roots(),
 * milestone 5b Task 6) rather than a hardcoded three-item constant: "never
 * hardcode roots on the client" is that task's own obligation, and this was
 * the one place still doing exactly that.
 */
export function RootTabs() {
  const currentDirId = useFileStore((s) => s.currentDirId);
  const setRoot = useFileStore((s) => s.setRoot);
  const roots = useFileStore((s) => s.roots);
  const loadRoots = useFileStore((s) => s.loadRoots);

  useEffect(() => {
    if (roots.length === 0) void loadRoots();
    // Fires once per mount; a root list that changes underneath a live
    // session is not a case this control needs to react to mid-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (roots.length === 0) return null;

  return (
    <SegmentedControl<string>
      label="File roots"
      value={rootOf(currentDirId)}
      onChange={setRoot}
      items={roots.map((root) => ({ value: root, label: humanize(root) }))}
    />
  );
}
