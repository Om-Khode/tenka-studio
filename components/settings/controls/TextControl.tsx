"use client";

import type { ControlProps } from "./ToggleControl";

const FIELD =
  "w-40 rounded-md border border-border bg-transparent px-2 py-1.5 font-mono text-xs " +
  "text-bone focus:border-border-strong focus:outline-none disabled:cursor-not-allowed disabled:opacity-40";

export function TextControl({ def, value, onChange, disabled }: ControlProps) {
  return (
    <input
      type="text"
      id={def.key}
      aria-label={def.label}
      value={String(value)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={FIELD}
    />
  );
}
