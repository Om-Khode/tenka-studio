import { SETTINGS_REGISTRY, findSetting } from "@/store/settings-registry";
import type { SaveOutcome, SettingDef, SettingValue } from "@/types/settings";
import type { SettingsRepo } from "../types";

export const SETTINGS_LOAD_DELAY_MS = 300;
export const SETTINGS_SAVE_DELAY_MS = 450;

/**
 * One scripted rejection. A real PATCH /settings can apply three keys and
 * reject a fourth, and a repo that always succeeds would let a global
 * isSaving boolean pass every test here and then need replacing once
 * HttpSettingsRepo lands.
 */
export const REJECTED_KEY = "camera_enabled";
export const REJECTED_REASON = "camera is in use by another process";

/**
 * Wraps settings-registry.ts's static defaults. settings-store.ts keeps the
 * scripted delays that were already inline in load()/save() -- moved here,
 * not removed, so the loading/saving/error branches components already
 * render stay exercised.
 */
export class DemoSettingsRepo implements SettingsRepo {
  async load(): Promise<SettingDef[]> {
    await new Promise((resolve) => setTimeout(resolve, SETTINGS_LOAD_DELAY_MS));
    // Nothing to merge in demo: the registry already IS the presentation
    // and the "current value" both (the store's own `overrides` supplies
    // the latter via savedValue()/effectiveValue(), same as before this
    // interface grew a return value at all).
    return SETTINGS_REGISTRY;
  }

  async save(patch: Record<string, SettingValue>): Promise<SaveOutcome> {
    await new Promise((resolve) => setTimeout(resolve, SETTINGS_SAVE_DELAY_MS));

    const keys = Object.keys(patch);
    const applied = keys.filter((key) => key !== REJECTED_KEY);
    const failed = keys
      .filter((key) => key === REJECTED_KEY)
      .map((key) => ({ key, reason: REJECTED_REASON }));
    // Restart is reported for keys that ACTUALLY applied. A rejected key
    // changed nothing, so nothing is pending on its behalf.
    const needsRestart = applied.filter((key) => findSetting(key)?.needsRestart);

    return { applied, failed, needsRestart };
  }
}
