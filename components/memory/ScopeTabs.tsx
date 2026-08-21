"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useMemoryStore } from "@/store/memory-store";
import type { MemoryScope } from "@/types/memory";

const SCOPES: { value: MemoryScope; label: string }[] = [
  { value: "knowledge", label: "knowledge" },
  { value: "preferences", label: "preferences" },
  { value: "procedures", label: "procedures" },
];

export function ScopeTabs() {
  const scope = useMemoryStore((s) => s.scope);
  const setScope = useMemoryStore((s) => s.setScope);

  return (
    <SegmentedControl<MemoryScope>
      label="Memory scopes"
      items={SCOPES}
      value={scope}
      onChange={setScope}
    />
  );
}
