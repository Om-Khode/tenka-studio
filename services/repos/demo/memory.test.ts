import { describe, it, expect, vi } from "vitest";
import { DemoMemoryRepo } from "./memory";
import { MEMORY_LOAD_DELAY_MS } from "@/store/memory-scripts";

describe("DemoMemoryRepo", () => {
  it("resolves the same shape seedMemory() produces", async () => {
    const repo = new DemoMemoryRepo();
    const snapshot = await repo.load();
    expect(snapshot.entities.length).toBeGreaterThan(0);
    expect(snapshot.facts.length).toBeGreaterThan(0);
    expect(snapshot.relationships.length).toBeGreaterThan(0);
    expect(snapshot.preferences.length).toBeGreaterThan(0);
    expect(snapshot.procedures.length).toBeGreaterThan(0);
  });

  it("keeps the scripted latency -- resolves only after MEMORY_LOAD_DELAY_MS", async () => {
    vi.useFakeTimers();
    const repo = new DemoMemoryRepo();
    let resolved = false;
    void repo.load().then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(MEMORY_LOAD_DELAY_MS - 1);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });

  it("returns a fresh snapshot each call -- mutating one does not affect the next", async () => {
    const repo = new DemoMemoryRepo();
    const first = await repo.load();
    first.entities.length = 0;
    const second = await repo.load();
    expect(second.entities.length).toBeGreaterThan(0);
  });
});
