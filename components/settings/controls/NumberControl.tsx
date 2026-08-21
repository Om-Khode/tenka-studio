"use client";

import type { ControlProps } from "./ToggleControl";

const FIELD =
  "w-24 rounded-md border border-border bg-transparent px-2 py-1.5 text-right font-mono text-xs " +
  "text-bone focus:border-border-strong focus:outline-none disabled:cursor-not-allowed disabled:opacity-40";

export function NumberControl({ def, value, onChange, disabled }: ControlProps) {
  return (
    <input
      type="number"
      id={def.key}
      aria-label={def.label}
      value={String(value)}
      min={def.min}
      max={def.max}
      step={def.step}
      disabled={disabled}
      onChange={(e) => {
        const next = Number(e.target.value);
        // An empty or half-typed field parses to NaN; reporting it would write
        // NaN into the store and render an empty control forever.
        if (e.target.value === "" || Number.isNaN(next)) return;
        onChange(next);
      }}
      className={FIELD}
    />
  );
}
