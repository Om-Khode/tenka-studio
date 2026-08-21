"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AwaitingEventsCard } from "./AwaitingEventsCard";
import { usePersonalityStore } from "@/store/personality-store";
import { useLoadFailure } from "@/hooks/useCapabilityRefusal";

const LABEL = "trait drift";

/** Index-cycled, not keyed by trait name -- `traits` is the daemon's own
 * `Record<string, number>`, so nothing here may hardcode which keys exist.
 * Same rule, and the same palette order, as PersonalityPanel's TraitBar. */
const TRAIT_COLORS = ["bg-amber", "bg-blue", "bg-steel", "bg-gold", "bg-bone-dim", "bg-moss"];

const humanize = (key: string) => key.replace(/[_-]+/g, " ").trim();

/**
 * The live counterpart to components/dashboard/TraitDriftStrip.tsx, which
 * hardcodes six trait names and six numbers. Those numbers came from no data
 * source at all, demo or otherwise -- which made the card look live-safe to
 * reuse, and made it a confident lie about a real assistant: a user who has
 * switched her to `minimal` still read "warmth 60".
 *
 * `PersonalityRepo.load()` (`GET /v1/personality`) already returns
 * `traits` fully resolved, and personality-store.ts already holds it -- this
 * strip just renders what the daemon says, keys included, and loads it the
 * same idle -> load() way PersonalityPanel does. Six-across only when there
 * happen to be six: the daemon owns which traits exist.
 */
export function LiveTraitDriftStrip() {
  const status = usePersonalityStore((s) => s.status);
  const payload = usePersonalityStore((s) => s.payload);
  const load = usePersonalityStore((s) => s.load);
  // GET /v1/personality is an `observe` read; the PATCH beside it is the one
  // that needs system control.
  const { message } = useLoadFailure("observe", "she could not reach her personality");

  useEffect(() => {
    if (status === "idle") void load();
  }, [status, load]);

  if (status === "error") {
    return <AwaitingEventsCard label={LABEL} note={message} />;
  }

  if (status !== "ready" || !payload) {
    return (
      <Card className="grid grid-cols-3 gap-4 p-4 sm:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </Card>
    );
  }

  const traits = Object.entries(payload.traits);
  if (traits.length === 0) {
    return <AwaitingEventsCard label={LABEL} note="she reports no traits" />;
  }

  return (
    <Card className="grid grid-cols-3 gap-4 p-4 sm:grid-cols-6">
      {traits.map(([trait, value], i) => (
        <div key={trait} className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase text-bone-subtle">{humanize(trait)}</span>
          <span className="text-lg text-bone">{Math.round(value)}</span>
          <div
            role="meter"
            aria-label={trait}
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1 rounded-full bg-border"
          >
            <div
              className={`h-full rounded-full ${TRAIT_COLORS[i % TRAIT_COLORS.length]}`}
              style={{ width: `${value}%` }}
            />
          </div>
        </div>
      ))}
    </Card>
  );
}
