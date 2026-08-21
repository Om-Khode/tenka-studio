"use client";

import { Switch } from "@/components/ui/Switch";
import type { SettingDef, SettingValue } from "@/types/settings";

export interface ControlProps {
  def: SettingDef;
  value: SettingValue;
  onChange: (value: SettingValue) => void;
  disabled: boolean;
}

export function ToggleControl({ def, value, onChange, disabled }: ControlProps) {
  return (
    <Switch
      id={def.key}
      checked={Boolean(value)}
      disabled={disabled}
      onCheckedChange={(next) => onChange(next)}
      aria-label={def.label}
    />
  );
}
