import { describe, it, expect, vi } from "vitest";
import { SETTINGS_REGISTRY } from "@/store/settings-registry";
import {
  DemoSettingsRepo,
  REJECTED_KEY,
  REJECTED_REASON,
  SETTINGS_SAVE_DELAY_MS,
} from "./settings";

describe("DemoSettingsRepo", () => {
  it("load() resolves with the static registry -- demo has nothing else to fetch", async () => {
    const repo = new DemoSettingsRepo();
    await expect(repo.load()).resolves.toEqual(SETTINGS_REGISTRY);
  });

  it("save() applies every key except the scripted rejection", async () => {
    const repo = new DemoSettingsRepo();
    const outcome = await repo.save({ tts_speed: 1.4, [REJECTED_KEY]: false });
    expect(outcome.applied).toEqual(["tts_speed"]);
    expect(outcome.failed).toEqual([{ key: REJECTED_KEY, reason: REJECTED_REASON }]);
  });

  it("save() reports needsRestart only for keys that actually applied", async () => {
    const repo = new DemoSettingsRepo();
    // wake_word_enabled needsRestart; camera_enabled (REJECTED_KEY) also
    // needsRestart but gets rejected, so it must not show up here.
    const outcome = await repo.save({ wake_word_enabled: false, [REJECTED_KEY]: false });
    expect(outcome.needsRestart).toEqual(["wake_word_enabled"]);
  });

  it("keeps the scripted save latency", async () => {
    vi.useFakeTimers();
    const repo = new DemoSettingsRepo();
    let resolved = false;
    void repo.save({ tts_speed: 1.4 }).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DELAY_MS - 1);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });
});
