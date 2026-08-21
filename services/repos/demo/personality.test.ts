import { describe, it, expect } from "vitest";
import { DemoPersonalityRepo } from "./personality";

describe("DemoPersonalityRepo", () => {
  it("defaults to warm_honest", async () => {
    const repo = new DemoPersonalityRepo();
    const payload = await repo.load();
    expect(payload.base).toBe("warm_honest");
    expect(payload.available).toContain("tsundere");
  });

  it("setBase switches the active profile and it sticks across load()", async () => {
    const repo = new DemoPersonalityRepo();
    await repo.setBase("tsundere");
    const payload = await repo.load();
    expect(payload.base).toBe("tsundere");
  });

  /**
   * Rejects where it used to substitute the default and report success. The
   * caller saw `ok`, read back `warm_honest`, and had no way to tell that apart
   * from having asked for it -- a silent switch to a personality nobody chose.
   * `available` is the contract; a base outside it is a caller error.
   */
  it("setBase rejects a base it does not recognise, rather than quietly substituting the default", async () => {
    const repo = new DemoPersonalityRepo();
    await expect(repo.setBase("does-not-exist")).rejects.toThrow(/unknown personality/i);
    // And it must not have switched anything on the way out.
    expect((await repo.load()).base).toBe("warm_honest");
  });

  it("reset returns to warm_honest after switching away", async () => {
    const repo = new DemoPersonalityRepo();
    await repo.setBase("minimal");
    const payload = await repo.reset();
    expect(payload.base).toBe("warm_honest");
  });

  it("every profile carries the same trait keys", async () => {
    const repo = new DemoPersonalityRepo();
    const warm = await repo.load();
    const tsundere = await repo.setBase("tsundere");
    expect(Object.keys(tsundere.traits).sort()).toEqual(Object.keys(warm.traits).sort());
  });
});
