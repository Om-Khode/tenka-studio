"use client";

import { formatDate as fmt } from "@/lib/format";
import type { FactGroup } from "@/types/memory";

export function FactRow({ group }: { group: FactGroup }) {
  const { current, superseded } = group;
  const confidencePct = Math.round(current.confidence * 100);

  return (
    <li className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-bone-subtle">{current.predicate}</span>
        <span className="text-bone-ghost">→</span>
        <span className="flex-1 text-sm text-bone">{current.object}</span>
        <span
          role="meter"
          aria-label={`confidence ${confidencePct}%`}
          aria-valuenow={confidencePct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-12 shrink-0 rounded-full bg-border"
        >
          <span
            className="block h-full rounded-full bg-moss"
            style={{ width: `${confidencePct}%` }}
          />
        </span>
      </div>

      {/*
        eventAt is when it happened; createdAt is when she learned it. Showing
        the first only when it exists keeps the common row to one line.
      */}
      {current.eventAt && (
        <span className="font-mono text-[10px] text-bone-ghost">
          happened {fmt(current.eventAt)}
        </span>
      )}

      {/*
        Superseded, not deleted. The value she used to hold stays visible with
        the date it stopped being true -- that history is the point of the
        temporal columns.
      */}
      {superseded.map((old) => (
        <span key={old.id} className="flex items-baseline gap-2 font-mono text-[10px]">
          <span className="line-through text-bone-ghost">{old.object}</span>
          <span className="text-bone-ghost">
            {old.invalidAt ? `until ${fmt(old.invalidAt)}` : "replaced"}
          </span>
        </span>
      ))}
    </li>
  );
}
