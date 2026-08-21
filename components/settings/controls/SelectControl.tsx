"use client";

import { Select } from "@/components/ui/Select";
import type { ControlProps } from "./ToggleControl";

export function SelectControl({ def, value, onChange, disabled }: ControlProps) {
  return (
    <Select
      label={def.label}
      value={String(value)}
      options={def.options ?? []}
      disabled={disabled}
      onValueChange={onChange}
    />
  );
}
