"use client";

import { SettingRow } from "./SettingRow";
import type { SettingDef } from "@/types/settings";

export function SettingGroup({ name, defs }: { name: string; defs: SettingDef[] }) {
  if (defs.length === 0) return null;
  return (
    <section aria-label={name} className="flex flex-col">
      <h2 className="sticky top-0 z-10 bg-bg py-2 font-mono text-[10px] uppercase tracking-widest text-bone-subtle">
        {name}
      </h2>
      {defs.map((def) => (
        <SettingRow key={def.key} def={def} />
      ))}
    </section>
  );
}
