"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { usePersonalityStore } from "@/store/personality-store";
import { useToastStore } from "@/store/toast-store";

/**
 * milestone 5b, Task 5: this panel used to read/write "personality" as an
 * ordinary `select`-kind row on the settings store (setDraft + the global
 * Save button). That mechanism cannot occur live -- `runtime_config` has no
 * enum cast to populate a select's `options` with -- so it now talks to its
 * own PersonalityRepo (GET/PATCH /v1/personality, POST
 * /v1/personality/reset) through personality-store.ts. A picked base now
 * applies immediately, matching the daemon's own PATCH, rather than sitting
 * as a draft batched behind the other ~39 settings' Save button.
 *
 * No local PROFILES table any more, demo or otherwise: traits and
 * sampleLine come back fully resolved from load()/setBase()/reset() on
 * every call, so there is no client-side lookup that can miss and no
 * "unrecognised base" case left to guard -- whatever the repository returns
 * IS the current display state, by construction.
 */

/** Index-cycled, not keyed by trait name -- `traits` is the daemon's own
 * `Record<string, number>`, so nothing here may hardcode which keys exist. */
const TRAIT_COLORS = ["bg-amber", "bg-blue", "bg-steel", "bg-gold", "bg-bone-dim", "bg-moss"];

function humanize(key: string): string {
  return key.replace(/[_-]+/g, " ").trim();
}

/**
 * One trait, animated from wherever it was to wherever the new base puts it.
 *
 * The spring drives the bar's width and the printed number together off a
 * single motion value, so they can never disagree mid-flight. `aria-valuenow`
 * is deliberately NOT animated: assistive tech should read the value she will
 * hold, not an intermediate frame, and the tests assert against it. Honouring
 * prefers-reduced-motion snaps instead, since several bars and counters
 * moving at once is exactly the kind of thing that setting exists to stop.
 */
function TraitBar({ trait, value, color }: { trait: string; value: number; color: string }) {
  const reduceMotion = useReducedMotion();
  const raw = useMotionValue(value);
  const spring = useSpring(raw, { stiffness: 160, damping: 22, mass: 0.6 });
  const source = reduceMotion ? raw : spring;
  const width = useTransform(source, (v) => `${v}%`);
  const shown = useTransform(source, (v) => Math.round(v));

  useEffect(() => {
    raw.set(value);
  }, [raw, value]);

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase text-bone-subtle">{humanize(trait)}</span>
      <motion.span className="text-lg text-bone">{shown}</motion.span>
      <div
        role="meter"
        data-testid={`trait-${trait}`}
        aria-label={trait}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 rounded-full bg-border"
      >
        <motion.div className={`h-full rounded-full ${color}`} style={{ width }} />
      </div>
    </div>
  );
}

export function PersonalityPanel() {
  const status = usePersonalityStore((s) => s.status);
  const payload = usePersonalityStore((s) => s.payload);
  const saving = usePersonalityStore((s) => s.saving);
  const load = usePersonalityStore((s) => s.load);
  const setBase = usePersonalityStore((s) => s.setBase);

  useEffect(() => {
    if (status === "idle") void load();
  }, [status, load]);

  if (status === "error") {
    // Same `observe` read as LiveTraitDriftStrip -- both render GET
    // /v1/personality, so both must explain a refusal the same way.
    return (
      <Card className="p-4">
        <LoadFailure
          capability="observe"
          unreachable="She could not reach her personality."
          onRetry={() => void load()}
        />
      </Card>
    );
  }

  if (status !== "ready" || !payload) {
    return (
      <Card className="flex flex-col gap-4 p-4">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-bone-subtle">
          personality
        </h2>
        <Select
          label="personality base"
          value={payload.base}
          options={payload.available.map((base) => ({ value: base, label: humanize(base) }))}
          disabled={saving}
          onValueChange={(next) => {
            void setBase(next).catch((err: unknown) => {
              useToastStore.getState().push({
                ok: false,
                title: "Could not switch personality",
                detail: err instanceof Error ? err.message : undefined,
              });
            });
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
        {Object.entries(payload.traits).map(([trait, value], i) => (
          <TraitBar key={trait} trait={trait} value={value} color={TRAIT_COLORS[i % TRAIT_COLORS.length]} />
        ))}
      </div>

      {/* Only when there is a line to quote. The daemon resolves this from a
          personality's `sample_line` metadata and falls back to "" when that
          personality declares none (studio_runtime.py), so an empty string is
          a normal answer -- and rendering it produced a pair of quote marks
          around nothing, which reads as a failed load rather than as a
          personality that simply ships no sample. */}
      {payload.sampleLine.trim() && (
        <p data-testid="personality-sample" className="border-l-2 border-border-strong pl-3 text-sm italic text-bone-dim">
          “{payload.sampleLine}”
        </p>
      )}
    </Card>
  );
}
