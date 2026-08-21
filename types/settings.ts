/** Mirrors the assistant's runtime_config REGISTRY. */
export type SettingKind = "toggle" | "slider" | "select" | "number" | "text";
export type SettingValue = string | number | boolean;

/**
 * The assistant resolves DB -> env var -> hardcoded default. A row an
 * environment variable owns is not user-editable in the real system, so it
 * must not look editable here either.
 */
export type SettingSource = "db" | "env" | "default";

export interface SettingDef {
  key: string;
  group: string;
  label: string;
  description: string;
  /**
   * Stored, not derived from the value's runtime type: the assistant's
   * `cast=float` covers both a bounded slider (tts_speed, 0.5-2.0) and an
   * unbounded number, and only the author knows which.
   */
  kind: SettingKind;
  default: SettingValue;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  needsRestart: boolean;
  source: SettingSource;
  /**
   * The daemon's current resolved value for this key (GET /v1/settings
   * states it outright; DB -> env -> default already resolved server-side).
   * Absent for a def the store has never loaded from anywhere -- the
   * demo/registry's static entries never set this, since demo derives the
   * "current" value from the store's own `overrides` instead (see
   * settings-store.ts's savedValue()). HttpSettingsRepo.load() is the one
   * producer that populates it on every merged row.
   *
   * Decision (milestone 5b, Task 5): a sibling key->value map was the other
   * option; this repo folds it into SettingDef instead, because Task 5 was
   * already forced to build a *dynamic*, per-load SettingDef list (the
   * daemon owns which keys exist, so the static registry array alone can no
   * longer be "the" list) -- adding one field to an object already being
   * freshly constructed is simpler than keeping a second map in lockstep
   * with it by key.
   */
  value?: SettingValue;
}

/**
 * A real PATCH can apply three keys and reject a fourth, so saving is
 * modelled per key from the start. A global boolean passes every shallow
 * test and then needs replacing in spec 5.
 */
export interface SaveOutcome {
  applied: string[];
  failed: { key: string; reason: string }[];
  needsRestart: string[];
}
