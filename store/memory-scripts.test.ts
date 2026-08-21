import { describe, it, expect } from "vitest";
import { seedMemory, TURN_EXCERPTS, HUB_ENTITY_ID } from "./memory-scripts";

describe("seedMemory", () => {
  it("is deterministic across calls", () => {
    expect(seedMemory()).toEqual(seedMemory());
  });

  it("gives every fact an existing subject", () => {
    const { entities, facts } = seedMemory();
    const ids = new Set(entities.map((e) => e.id));
    for (const fact of facts) expect(ids.has(fact.subjectId)).toBe(true);
  });

  it("includes at least one superseded fact", () => {
    const { facts } = seedMemory();
    expect(facts.some((f) => f.invalidAt !== null)).toBe(true);
  });

  it("includes at least one fact with no provenance", () => {
    const { facts } = seedMemory();
    expect(facts.some((f) => f.sourceTurnId === null)).toBe(true);
  });

  it("resolves every non-null sourceTurnId to an excerpt", () => {
    const { entities, facts } = seedMemory();
    const turns = [...entities, ...facts]
      .map((row) => row.sourceTurnId)
      .filter((id): id is string => id !== null);
    expect(turns.length).toBeGreaterThan(0);
    for (const id of turns) expect(TURN_EXCERPTS[id]).toBeTruthy();
  });

  it("gives the hub entity more neighbours than the ego graph can draw", () => {
    const { relationships } = seedMemory();
    const degree = relationships.filter(
      (r) => r.fromId === HUB_ENTITY_ID || r.toId === HUB_ENTITY_ID,
    ).length;
    expect(degree).toBeGreaterThan(12);
  });

  it("leaves one relationship pointing at a missing entity", () => {
    const { entities, relationships } = seedMemory();
    const ids = new Set(entities.map((e) => e.id));
    expect(relationships.some((r) => !ids.has(r.toId))).toBe(true);
  });
});
