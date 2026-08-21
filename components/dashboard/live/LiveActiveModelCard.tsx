"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AwaitingEventsCard } from "./AwaitingEventsCard";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { useLoadFailure } from "@/hooks/useCapabilityRefusal";
import { formatAgo } from "@/lib/format";

const LABEL = "active model";

/**
 * The live counterpart to components/dashboard/ActiveModelCard.tsx, which
 * prints the string "gemini-flash-lite" and a three-row fallback ladder as
 * literals. Those literals were never read off demo-engine.ts or a
 * `*-scripts.ts` module, which is exactly why the card looked safe to reuse
 * under live chrome -- and exactly the wrong test. A user running Groq or
 * Ollama reads "gemini-flash-lite · primary · free tier" as a fact about
 * their own machine; a hardcoded constant presented as a live reading does
 * the same harm as demo data.
 *
 * `TelemetryPayload.activeModel` (`GET /v1/telemetry`) is the real source,
 * and it was already being fetched on this very page and thrown away.
 *
 * No fallback ladder here. The daemon reports the model it is on, not the
 * chain it would fall through -- openapi.json's TelemetryPayload carries
 * cpu/ram/battery/activeModel/uptime and nothing else -- so a routing ladder
 * would have to be invented, which is the thing this card exists to stop
 * doing. An empty `activeModel` (a daemon that has not routed anything yet)
 * takes the AwaitingEventsCard treatment rather than printing an empty line.
 */
export function LiveActiveModelCard() {
  const { status, data, stale, at } = useLiveTelemetry();
  // GET /v1/telemetry needs `observe`. This card has no retry control to
  // suppress -- the poll retries itself -- so it takes the sentence only, and
  // AwaitingEventsCard's `note` slot is where it goes.
  const { message } = useLoadFailure("observe", "she could not reach her telemetry");

  // Same shape as LiveSystemMetersCard's own branches: useLiveTelemetry keeps
  // the last good reading on a transient poll failure, so "error" only ever
  // coincides with `data` still null, on the very first fetch.
  if (status === "error" && data === null) {
    return <AwaitingEventsCard label={LABEL} note={message} />;
  }

  if (data === null) {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-40" />
      </Card>
    );
  }

  if (data.activeModel === "") {
    return <AwaitingEventsCard label={LABEL} note="she has not reported a model yet" />;
  }

  // Dimmed alongside LiveSystemMetersCard when the feed goes quiet, and for
  // the same reason: both read the one telemetry slice, so leaving this card
  // bright beside a dimmed sibling would read as a rendering glitch rather
  // than as "neither of these is current".
  return (
    <Card className={`flex flex-col gap-3 p-4 ${stale ? "opacity-50" : ""}`}>
      <span className="font-mono text-[11px] uppercase text-bone-subtle">{LABEL}</span>
      <p className="font-display text-lg font-bold text-bone">{data.activeModel}</p>
      <p className="font-mono text-xs text-bone-ghost">
        {stale && at !== null ? `last seen ${formatAgo(Date.now() - at)} ago` : "as she last routed"}
      </p>
    </Card>
  );
}
