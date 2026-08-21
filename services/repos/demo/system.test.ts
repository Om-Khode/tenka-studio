import { describe, it, expect } from "vitest";
import { DemoSystemRepo } from "./system";

describe("DemoSystemRepo", () => {
  it("getBackupStatus resolves a well-formed, idle status", async () => {
    const repo = new DemoSystemRepo();
    const status = await repo.getBackupStatus();
    expect(status.progressPct).toBeNull();
    expect(typeof status.enabled).toBe("boolean");
  });

  it("runBackup and restoreBackup are inert placeholders, not the demo's real ticker", async () => {
    const repo = new DemoSystemRepo();
    const status = await repo.runBackup();
    expect(status.progressPct).toBeNull();
    expect(await repo.restoreBackup("anything")).toBe(false);
  });

  it("listVoices and listFaces resolve arrays", async () => {
    const repo = new DemoSystemRepo();
    expect(await repo.listVoices()).toEqual([]);
    expect(await repo.listFaces()).toEqual([]);
  });

  it("forgetEnrolled resolves true -- system-store.ts awaits this in both modes, so a permanent false would refuse every demo forget", async () => {
    const repo = new DemoSystemRepo();
    expect(await repo.forgetEnrolled("voice", "v1")).toBe(true);
    expect(await repo.forgetEnrolled("face", "f1")).toBe(true);
  });

  it("getTelemetry is an inert placeholder -- nothing in demo mode calls it", async () => {
    const repo = new DemoSystemRepo();
    const snapshot = await repo.getTelemetry();
    expect(snapshot.batteryPercent).toBeNull();
    expect(snapshot.activeModel).toBe("");
  });
});
