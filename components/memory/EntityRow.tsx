"use client";

import { User, AppWindow, MapPin, Hash, Cpu, Circle } from "lucide-react";
import type { Entity } from "@/types/memory";
import { cn } from "@/lib/utils";

/** Unknown types are expected: spec 5 may return a type this build predates. */
const GLYPHS: Record<string, typeof User> = {
  person: User,
  app: AppWindow,
  place: MapPin,
  topic: Hash,
  device: Cpu,
};

export interface EntityRowProps {
  entity: Entity;
  selected: boolean;
  factCount: number;
  onSelect: () => void;
}

export function EntityRow({ entity, selected, factCount, onSelect }: EntityRowProps) {
  const Glyph = GLYPHS[entity.type] ?? Circle;

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex h-[52px] w-full items-center gap-3 rounded-md px-3 text-left transition-colors",
        selected ? "bg-card text-bone" : "text-bone-dim hover:bg-card hover:text-bone",
      )}
    >
      <Glyph size={16} className="shrink-0 text-bone-subtle" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm">{entity.displayName}</span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-bone-ghost">
          {entity.type}
        </span>
      </span>
      <span className="ml-auto font-mono text-[11px] text-bone-ghost">{factCount}</span>
    </button>
  );
}
