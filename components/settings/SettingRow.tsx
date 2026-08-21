"use client";

import { useEffect, type ReactElement } from "react";
import { RotateCcw } from "lucide-react";
import { ToggleControl, type ControlProps } from "./controls/ToggleControl";
import { SliderControl } from "./controls/SliderControl";
import { SelectControl } from "./controls/SelectControl";
import { NumberControl } from "./controls/NumberControl";
import { TextControl } from "./controls/TextControl";
import { useSettingsStore, effectiveValue } from "@/store/settings-store";
import type { SettingDef } from "@/types/settings";

const CONTROLS: Record<string, (props: ControlProps) => ReactElement> = {
  toggle: ToggleControl,
  slider: SliderControl,
  select: SelectControl,
  number: NumberControl,
  text: TextControl,
};

export function SettingRow({ def }: { def: SettingDef }) {
  // Selected individually, not as an object literal: the page renders ~40 of
  // these rows, and a single-object selector would return a fresh reference
  // on every store update (search keystroke, another row's save, ...) and
  // re-render all of them regardless. Zustand v5 actions have stable
  // identity, so selecting setDraft/resetKey this way is safe too.
  const value = useSettingsStore((s) => effectiveValue(s, def.key));
  const error = useSettingsStore((s) => s.errors[def.key]);
  const setDraft = useSettingsStore((s) => s.setDraft);
  const resetKey = useSettingsStore((s) => s.resetKey);
  const locked = def.source === "env";
  const changed = value !== def.default;

  const Control = CONTROLS[def.kind];

  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
      {/* Stacks below `sm`. The control keeps `shrink-0`, so in a row the
          description is what gets crushed -- at 390px a slider and a label
          cannot both have the width they need, and the answer is to give them
          one line each rather than to pick a loser. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-bone">{def.label}</span>
            {def.needsRestart && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-gold">
                ⚠ needs restart
              </span>
            )}
            {locked && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-bone-ghost">
                env-locked
              </span>
            )}
          </div>
          <p className="text-xs text-bone-dim">{def.description}</p>
          {locked && (
            <p className="font-mono text-[10px] text-bone-ghost">
              Set by an environment variable — change it where she is launched.
            </p>
          )}
          {error && <p className="font-mono text-[10px] text-fail">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/*
            An unknown kind is expected once spec 5 talks to a real backend
            that may ship a control this build predates. One unknown row must
            not blank the page.
          */}
          {Control ? (
            <Control
              def={def}
              value={value}
              disabled={locked}
              onChange={(next) => setDraft(def.key, next)}
            />
          ) : (
            <UnknownControl def={def} value={value} />
          )}

          {changed && !locked && (
            <button
              type="button"
              aria-label={`reset ${def.label}`}
              title="reset to default"
              onClick={() => resetKey(def.key)}
              className="text-bone-ghost transition-colors hover:text-bone"
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UnknownControl({ def, value }: { def: SettingDef; value: unknown }) {
  // Warn once per mount, not on every render: this component previously
  // warned in the render body, which fired on every unrelated store update
  // before the row's store reads were scoped to a selector.
  useEffect(() => {
    console.warn(`SettingRow: no control for kind "${def.kind}" (${def.key})`);
  }, [def.key, def.kind]);

  return (
    <div className="flex flex-col items-end">
      <span className="font-mono text-xs text-bone-dim">{String(value)}</span>
      <span className="font-mono text-[10px] text-bone-ghost">
        this build has no control for “{def.kind}”
      </span>
    </div>
  );
}
