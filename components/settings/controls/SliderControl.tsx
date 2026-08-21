"use client";

import { Slider } from "@/components/ui/Slider";
import { NumberControl } from "./NumberControl";
import type { ControlProps } from "./ToggleControl";

/**
 * Round a value to the precision implied by the step size.
 * Fixes floating-point noise: roundToStep(1.2000000000000002, 0.05) === 1.2
 */
export function roundToStep(value: number, step: number): number {
  const decimals = String(step).split(".")[1]?.length ?? 0;
  return Number(value.toFixed(decimals));
}

/**
 * A slider with no visible number is a guess. The printed value is fixed to
 * the precision the step implies, so 0.05 steps do not print 1.2000000000002.
 */
export function SliderControl({ def, value, onChange, disabled }: ControlProps) {
  const step = def.step ?? 1;
  const decimals = String(step).split(".")[1]?.length ?? 0;
  const current = Number(value);

  // A slider IS its scale: the thumb's position is the whole reading. With no
  // bounds we used to draw against a fabricated 0..1, so a real value of 5 sat
  // pinned at the right edge and read as "at maximum" -- a confident claim
  // about a range nobody stated. This is reachable rather than theoretical:
  // SettingsRepo.load()'s own contract says the daemon may report keys the
  // registry has never seen, and bounds come from the registry only.
  // A number field states the value and claims no range, so it degrades to
  // that instead of guessing.
  if (def.min === undefined || def.max === undefined) {
    return <NumberControl def={def} value={value} onChange={onChange} disabled={disabled} />;
  }

  return (
    <div className="flex items-center gap-3">
      <Slider
        value={[current]}
        min={def.min}
        max={def.max}
        step={step}
        disabled={disabled}
        thumbLabel={def.label}
        onValueChange={([next]) => onChange(roundToStep(next, step))}
      />
      <span className="w-10 shrink-0 text-right font-mono text-xs text-bone">
        {current.toFixed(decimals)}
      </span>
    </div>
  );
}
