"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { useLoadFailure } from "@/hooks/useCapabilityRefusal";
import { formatAgo } from "@/lib/format";

/**
 * The live counterpart to components/dashboard/SystemMetersCard.tsx, which
 * reads store/demo-engine.ts's jittered `systemStats` unconditionally --
 * exactly the "dashboard's meters come from demo-engine ... regardless of
 * mode" bug this task exists to fix. This card never imports demo-engine at
 * all; it reads `GET /v1/telemetry` through useLiveTelemetry() instead.
 *
 * `batteryPercent` is the one nullable field on the wire (a desktop with no
 * battery) -- rendered absent, never "0%", matching the same "render
 * absent, never zero" convention `EnrolledItem.count` already uses
 * elsewhere in this codebase.
 *
 * A reading that has stopped arriving is dimmed and dated rather than dropped
 * or left alone. Before Task 12, a stopped daemon left "cpu 41%" on screen as
 * present-tense fact for as long as the tab stayed open -- the last snapshot,
 * with no timestamp on it, which is a lie the page tells more confidently the
 * longer it goes on. Dropping it instead would throw away the one true thing
 * on the card ("this is what she last reported"); the honest render is the
 * number, qualified.
 */
export function LiveSystemMetersCard() {
  const { status, data, stale, at } = useLiveTelemetry();
  // GET /v1/telemetry needs `observe`, same as its sibling card. There was no
  // retry control here to suppress -- the poll is the retry -- so this takes
  // the sentence and nothing else.
  const { message } = useLoadFailure("observe", "She could not reach her telemetry.");

  // useLiveTelemetry keeps the last good reading on a transient poll
  // failure (see its own doc) -- "error" only ever coincides with `data`
  // still null here, on the very first fetch.
  if (status === "error" && data === null) {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <span className="font-mono text-[11px] uppercase text-bone-subtle">cpu / ram / battery</span>
        <p className="text-sm text-bone-dim">{message}</p>
      </Card>
    );
  }

  if (data === null) {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
      </Card>
    );
  }

  return (
    <Card className={`flex flex-col gap-3 p-4 ${stale ? "opacity-50" : ""}`}>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase text-bone-subtle">cpu</span>
        <span className="font-mono text-sm text-bone">{data.cpuPercent.toFixed(0)}%</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase text-bone-subtle">ram</span>
        <span className="font-mono text-sm text-bone">{data.ramPercent.toFixed(0)}%</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase text-bone-subtle">battery</span>
        <span className="font-mono text-sm text-moss">
          {data.batteryPercent === null ? "—" : `${data.batteryPercent.toFixed(0)}%`}
        </span>
      </div>
      {stale && at !== null && (
        <p className="font-mono text-[10px] text-bone-ghost">
          last seen {formatAgo(Date.now() - at)} ago
        </p>
      )}
    </Card>
  );
}
