import { describe, it, expect } from "vitest";
import { SCRIPTED_TASKS, LEARNED_FACTS_POOL, HISTORY_CAP, FACTS_CAP } from "./demo-scripts";

describe("demo-scripts", () => {
  it("has exactly 3 scripted tasks, each with at least one step", () => {
    expect(SCRIPTED_TASKS).toHaveLength(3);
    SCRIPTED_TASKS.forEach((t) => expect(t.steps.length).toBeGreaterThan(0));
  });

  it("includes one task with a failed step followed by a recovery step", () => {
    const spotifyTask = SCRIPTED_TASKS.find((t) => t.title.includes("Spotify"));
    expect(spotifyTask).toBeDefined();
    const failedIdx = spotifyTask!.steps.findIndex((s) => s.status === "failed");
    expect(failedIdx).toBeGreaterThanOrEqual(0);
    expect(spotifyTask!.steps[failedIdx + 1].stack).toBe("APPS");
  });

  it("has a fact pool and caps matching the design", () => {
    expect(LEARNED_FACTS_POOL).toHaveLength(3);
    expect(HISTORY_CAP).toBe(8);
    expect(FACTS_CAP).toBe(6);
  });
});
