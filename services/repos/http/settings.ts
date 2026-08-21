import { apiGet, apiSend } from "@/services/http";
import { findSetting } from "@/store/settings-registry";
import type { SaveOutcome, SettingDef, SettingValue } from "@/types/settings";
import type { SettingsRepo } from "../types";
import type { components } from "@/types/api";

type SettingsPayload = components["schemas"]["SettingsPayload"];
type SettingRowPayload = components["schemas"]["SettingRowPayload"];
type SaveOutcomePayload = components["schemas"]["SaveOutcomePayload"];
type SettingsPatch = components["schemas"]["SettingsPatch"];

/** Generic, not a lookup table -- an unknown key (or an unknown select
 * option) still needs SOME readable label, and this is the only rule that
 * does not require knowing the key in advance. */
function humanize(key: string): string {
  return key.replace(/[_-]+/g, " ").trim();
}

/**
 * Fix round, milestone 5b Task 5: `personality` genuinely IS in the
 * daemon's `runtime_config.REGISTRY` -- `config.py`'s
 * `_runtime_setting("personality", ...)` registers it exactly like every
 * other setting -- so `GET /v1/settings` really does return a `personality`
 * row (kind "text"). But that row is semantically dead: `_save_sync`
 * accepts a PATCH for it and reports 200/saved, yet writes through
 * `settings_facade`, a path `switch_personality()` (the one
 * `HttpPersonalityRepo` actually reads and writes) never consults --
 * saving through this row changes nothing the assistant does. There is no
 * generic signal on the wire that marks a row this way (no
 * deprecated/superseded flag on `SettingRowPayload`), so this is a narrow,
 * named denylist for one known-dead key, not a generic mechanism -- it
 * exists specifically so a control that reports success and does nothing
 * can never render. app/demo/settings/page.tsx also excludes this key
 * defensively at the page level; this is the one place that keeps a live
 * caller who skips the page (a future test, a different page) from being
 * fooled by it too.
 */
const DEAD_ROW_KEYS = new Set(["personality"]);

/**
 * Daemon-first merge (milestone 5b, Task 5): the daemon states existence,
 * value, kind, default, needsRestart and source outright -- GET
 * /v1/settings's own SettingRowPayload carries all of them, so none of them
 * are treated as "the registry's job" here. What the registry alone has a
 * field for -- `label`, slider/number bounds, and an option's display text
 * -- comes from it ONLY when the key matches; an unmatched key (one the
 * registry has never seen) still renders, with a humanised label and no
 * bounds rather than disappearing. A key the registry has but this row set
 * no longer contains is never constructed at all, because this function
 * only ever iterates the daemon's rows.
 */
function mergeRow(row: SettingRowPayload): SettingDef {
  const known = findSetting(row.key);
  return {
    key: row.key,
    group: row.group,
    label: known?.label ?? humanize(row.key),
    description: row.description,
    kind: row.kind,
    value: row.value,
    default: row.default,
    min: known?.min,
    max: known?.max,
    step: known?.step,
    options: known?.options ?? row.options.map((value) => ({ value, label: humanize(value) })),
    needsRestart: row.needsRestart,
    source: row.source,
  };
}

export class HttpSettingsRepo implements SettingsRepo {
  async load(): Promise<SettingDef[]> {
    const payload = await apiGet<SettingsPayload>("/v1/settings");
    return payload.rows.filter((row) => !DEAD_ROW_KEYS.has(row.key)).map(mergeRow);
  }

  async save(patch: Record<string, SettingValue>): Promise<SaveOutcome> {
    const body: SettingsPatch = { changes: patch };
    const outcome = await apiSend<SaveOutcomePayload>("PATCH", "/v1/settings", body);
    return {
      applied: outcome.saved,
      failed: Object.entries(outcome.rejected).map(([key, reason]) => ({ key, reason })),
      needsRestart: outcome.restartRequired,
    };
  }
}
