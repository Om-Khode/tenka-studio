import { describe, it, expect } from "vitest";
import { SETTINGS_REGISTRY, SETTING_GROUPS, findSetting } from "./settings-registry";

describe("settings-registry", () => {
  it("carries the assistant's full registry", () => {
    // 40 minus `personality`, which moved to its own PersonalityRepo --
    // runtime_config.REGISTRY never carried it (milestone 5b, Task 5).
    expect(SETTINGS_REGISTRY).toHaveLength(39);
  });

  it("has unique keys", () => {
    const keys = SETTINGS_REGISTRY.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every row a group, a label, and a description", () => {
    for (const def of SETTINGS_REGISTRY) {
      expect(def.group, def.key).toBeTruthy();
      expect(def.label, def.key).toBeTruthy();
      expect(def.description.length, def.key).toBeGreaterThan(10);
    }
  });

  it("agrees between kind and constraints", () => {
    for (const def of SETTINGS_REGISTRY) {
      if (def.kind === "slider") {
        expect(typeof def.min, def.key).toBe("number");
        expect(typeof def.max, def.key).toBe("number");
        expect(typeof def.step, def.key).toBe("number");
        expect(def.max!, def.key).toBeGreaterThan(def.min!);
      }
      if (def.kind === "select") {
        expect(def.options?.length, def.key).toBeGreaterThan(1);
        expect(def.options!.map((o) => o.value), def.key).toContain(def.default);
      }
      if (def.kind === "toggle") expect(typeof def.default, def.key).toBe("boolean");
      if (def.kind === "number" || def.kind === "slider") {
        expect(typeof def.default, def.key).toBe("number");
      }
      if (def.kind === "text") expect(typeof def.default, def.key).toBe("string");
    }
  });

  it("keeps a numeric default inside its own bounds", () => {
    for (const def of SETTINGS_REGISTRY) {
      if (typeof def.min === "number") expect(def.default as number, def.key).toBeGreaterThanOrEqual(def.min);
      if (typeof def.max === "number") expect(def.default as number, def.key).toBeLessThanOrEqual(def.max);
    }
  });

  it("derives groups in registry order with no repeats", () => {
    expect(new Set(SETTING_GROUPS).size).toBe(SETTING_GROUPS.length);
    expect(SETTING_GROUPS[0]).toBe(SETTINGS_REGISTRY[0].group);
  });

  it("includes at least one env-locked row, so the read-only path is real", () => {
    expect(SETTINGS_REGISTRY.some((s) => s.source === "env")).toBe(true);
  });

  it("gives every select row unique, non-empty option labels", () => {
    // This file is the only guard on a 40-row hand-written table -- a typo'd
    // duplicate value or a blank label in a select row would otherwise ship
    // silently (an empty menu item, or two options a user cannot tell apart).
    for (const def of SETTINGS_REGISTRY) {
      if (def.kind !== "select") continue;
      for (const option of def.options ?? []) {
        expect(option.label.length, `${def.key}: "${option.value}"`).toBeGreaterThan(0);
      }
      const values = def.options!.map((o) => o.value);
      expect(new Set(values).size, def.key).toBe(values.length);
    }
  });

  it("finds a row by key", () => {
    expect(findSetting("tts_speed")?.group).toBe("Voice I/O");
    expect(findSetting("nope")).toBeUndefined();
  });
});
