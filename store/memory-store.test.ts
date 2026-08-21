import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useMemoryStore,
  selectVisibleEntities,
  selectFactGroupsFor,
  selectNeighborsFor,
  selectVisiblePreferences,
  selectVisibleProcedures,
} from "./memory-store";
import type { Fact } from "@/types/memory";
import { HUB_ENTITY_ID, seedMemory } from "./memory-scripts";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import type { RepoBundle } from "@/services/repos/types";
import { ApiError } from "@/services/http";
import { useToastStore } from "./toast-store";

function reset() {
  useMemoryStore.setState(useMemoryStore.getInitialState());
}

describe("memory-store", () => {
  beforeEach(reset);

  it("starts idle and empty, so no component sees data before load()", () => {
    const s = useMemoryStore.getState();
    expect(s.status).toBe("idle");
    expect(s.entities).toHaveLength(0);
  });

  it("passes through loading before reaching ready", async () => {
    vi.useFakeTimers();
    const pending = useMemoryStore.getState().load();
    expect(useMemoryStore.getState().status).toBe("loading");
    await vi.runAllTimersAsync();
    await pending;
    expect(useMemoryStore.getState().status).toBe("ready");
    expect(useMemoryStore.getState().entities.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("reaches the error branch instead of hanging on loading forever when load's async work throws", async () => {
    // load() awaits `new Promise((resolve) => setTimeout(resolve, MS))`,
    // which never itself rejects. But a Promise executor that throws
    // SYNCHRONOUSLY auto-rejects the Promise it belongs to (spec behaviour) --
    // exactly the shape a real fetch() would take once it replaces this
    // scripted delay. No fake timers needed: the throw happens before
    // anything is actually scheduled.
    //
    // jsdom's localStorage.setItem also schedules its own setTimeout (the
    // storage-event dispatch) whenever the persist middleware writes a
    // changed value, which would otherwise race for the same mock. Stub it
    // out so the only setTimeout call left is the one inside load().
    const storageSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementationOnce(() => {
      throw new Error("simulated fetch failure");
    });

    try {
      await useMemoryStore.getState().load();
      expect(useMemoryStore.getState().status).toBe("error");
    } finally {
      // Always restore, even if load() unexpectedly rejects -- an unrestored
      // Storage stub would otherwise silently break every later test in this
      // file that asserts on localStorage content.
      timeoutSpy.mockRestore();
      storageSpy.mockRestore();
    }
  });

  it("filters entities by query and type", async () => {
    await useMemoryStore.getState().load();
    useMemoryStore.setState({ query: "tokyo" });
    expect(selectVisibleEntities(useMemoryStore.getState())).toHaveLength(1);

    useMemoryStore.setState({ query: "", typeFilter: "person" });
    const people = selectVisibleEntities(useMemoryStore.getState());
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((e) => e.type === "person")).toBe(true);
  });

  it("matches canonicalName case-insensitively, same as displayName", () => {
    // The seed's canonicalNames happen to already be lowercase, so this
    // needs its own fixture to actually exercise the comparison -- a query
    // is always lowercased, but canonicalName was compared un-lowercased.
    useMemoryStore.setState({
      entities: [
        {
          id: 1, type: "topic", canonicalName: "MixedCase Topic", displayName: "Something Else",
          properties: {}, source: "test", confidence: 1,
          createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
          sourceTurnId: null,
        },
      ],
      status: "ready",
      query: "mixedcase",
    });
    expect(selectVisibleEntities(useMemoryStore.getState())).toHaveLength(1);
  });

  it("groups a superseded fact under the value that replaced it", async () => {
    await useMemoryStore.getState().load();
    const groups = selectFactGroupsFor(useMemoryStore.getState(), 1);
    const livesIn = groups.find((g) => g.current.predicate === "lives_in");
    expect(livesIn?.current.object).toBe("Tokyo");
    expect(livesIn?.superseded.map((f) => f.object)).toEqual(["Osaka"]);
  });

  it("orders multiple superseded facts newest-invalidAt-first, not by array position", () => {
    // Set up a custom state with facts in reverse invalidAt order to verify sorting.
    const subjectId = 1;
    const facts: Fact[] = [
      {
        id: 1,
        subjectId,
        predicate: "lived_in",
        object: "Delhi",
        confidence: 0.9,
        source: "conversation",
        eventAt: null,
        invalidAt: "2026-01-15T00:00:00.000Z", // oldest
        expiresAt: null,
        verifiedAt: null,
        createdAt: "2026-01-15T00:00:00.000Z",
        sourceTurnId: null,
      },
      {
        id: 3,
        subjectId,
        predicate: "lived_in",
        object: "Mumbai",
        confidence: 0.95,
        source: "conversation",
        eventAt: null,
        invalidAt: "2026-07-01T00:00:00.000Z", // newest
        expiresAt: null,
        verifiedAt: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        sourceTurnId: null,
      },
      {
        id: 2,
        subjectId,
        predicate: "lived_in",
        object: "Bangalore",
        confidence: 0.92,
        source: "conversation",
        eventAt: null,
        invalidAt: "2026-03-20T00:00:00.000Z", // middle
        expiresAt: null,
        verifiedAt: null,
        createdAt: "2026-03-20T00:00:00.000Z",
        sourceTurnId: null,
      },
      {
        id: 4,
        subjectId,
        predicate: "lived_in",
        object: "Pune",
        confidence: 0.98,
        source: "conversation",
        eventAt: null,
        invalidAt: null, // current
        expiresAt: null,
        verifiedAt: null,
        createdAt: "2026-08-07T00:00:00.000Z",
        sourceTurnId: null,
      },
    ];

    useMemoryStore.setState({ facts, entities: [{ id: subjectId, type: "person", canonicalName: "test", displayName: "Test", properties: {}, source: "test", confidence: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-08-07T00:00:00.000Z", sourceTurnId: null }], relationships: [], preferences: [], procedures: [], status: "ready" });

    const groups = selectFactGroupsFor(useMemoryStore.getState(), subjectId);
    const group = groups.find((g) => g.current.predicate === "lived_in");

    expect(group?.current.object).toBe("Pune");
    // Superseded should be ordered newest-invalidAt-first
    expect(group?.superseded.map((f) => f.object)).toEqual(["Mumbai", "Bangalore", "Delhi"]);
  });

  it("drops neighbours whose entity no longer exists", async () => {
    await useMemoryStore.getState().load();
    const links = selectNeighborsFor(useMemoryStore.getState(), HUB_ENTITY_ID);
    expect(links.every((l) => l.entity !== undefined)).toBe(true);
    expect(links.some((l) => l.relationship.toId === 9999)).toBe(false);
  });

  it("forgets an entity, its facts, and its relationships", async () => {
    await useMemoryStore.getState().load();
    useMemoryStore.getState().forgetEntity(4);
    const s = useMemoryStore.getState();
    expect(selectVisibleEntities(s).some((e) => e.id === 4)).toBe(false);
    expect(selectFactGroupsFor(s, 4)).toHaveLength(0);
    expect(selectNeighborsFor(s, 1).some((l) => l.entity.id === 4)).toBe(false);
  });

  it("clears the selection when the selected entity is forgotten", async () => {
    await useMemoryStore.getState().load();
    useMemoryStore.getState().select(4);
    useMemoryStore.getState().forgetEntity(4);
    expect(useMemoryStore.getState().selectedId).toBeNull();
  });

  it("clears the selection when the query changes", async () => {
    await useMemoryStore.getState().load();
    useMemoryStore.getState().select(4);
    useMemoryStore.getState().setQuery("tokyo");
    expect(useMemoryStore.getState().selectedId).toBeNull();
  });

  it("leaves the selection null when setting a query with nothing selected", async () => {
    await useMemoryStore.getState().load();
    expect(useMemoryStore.getState().selectedId).toBeNull();
    useMemoryStore.getState().setQuery("tokyo");
    expect(useMemoryStore.getState().selectedId).toBeNull();
  });

  it("forgets a preference and a procedure by their own keys", async () => {
    await useMemoryStore.getState().load();
    useMemoryStore.getState().forgetPreference("coffee.roast");
    useMemoryStore.getState().forgetProcedure(2);
    const s = useMemoryStore.getState();
    expect(selectVisiblePreferences(s).some((p) => p.key === "coffee.roast")).toBe(false);
    expect(selectVisibleProcedures(s).some((p) => p.id === 2)).toBe(false);
  });

  it("clears the selection when a preference is forgotten -- selectedId is an index, so it can never be compared to a key", async () => {
    await useMemoryStore.getState().load();
    useMemoryStore.getState().setScope("preferences");
    useMemoryStore.getState().select(1); // index 1 of the visible list
    useMemoryStore.getState().forgetPreference("coffee.roast");
    expect(useMemoryStore.getState().selectedId).toBeNull();
  });

  it("clears the selection when the selected procedure is forgotten", async () => {
    await useMemoryStore.getState().load();
    useMemoryStore.getState().setScope("procedures");
    useMemoryStore.getState().select(2);
    useMemoryStore.getState().forgetProcedure(2);
    expect(useMemoryStore.getState().selectedId).toBeNull();
  });

  it("leaves an unrelated procedure's selection alone when a different one is forgotten", async () => {
    await useMemoryStore.getState().load();
    useMemoryStore.getState().setScope("procedures");
    useMemoryStore.getState().select(3);
    useMemoryStore.getState().forgetProcedure(2);
    expect(useMemoryStore.getState().selectedId).toBe(3);
  });

  it("forgetAll empties every scope but leaves the seed intact", async () => {
    await useMemoryStore.getState().load();
    // Snapshot the seeded arrays before forgetAll() so the assertion below
    // can catch a real mutation, not just a shrunk-but-still-nonempty array.
    const before = useMemoryStore.getState();
    const seeded = {
      entities: before.entities,
      facts: before.facts,
      relationships: before.relationships,
      preferences: before.preferences,
      procedures: before.procedures,
    };

    await useMemoryStore.getState().forgetAll();
    const s = useMemoryStore.getState();
    expect(selectVisibleEntities(s)).toHaveLength(0);
    expect(selectVisiblePreferences(s)).toHaveLength(0);
    expect(selectVisibleProcedures(s)).toHaveLength(0);
    // The seed itself is untouched -- only the overlay grew.
    expect(s.entities).toEqual(seeded.entities);
    expect(s.facts).toEqual(seeded.facts);
    expect(s.relationships).toEqual(seeded.relationships);
    expect(s.preferences).toEqual(seeded.preferences);
    expect(s.procedures).toEqual(seeded.procedures);
  });

  it("PROOF-OF-FAILURE (Milestone-4 blocker 2): forgetAll refuses when memory has not finished loading, leaving the overlay untouched", async () => {
    useMemoryStore.setState({ ...useMemoryStore.getInitialState(), status: "loading" });
    const result = await useMemoryStore.getState().forgetAll();
    expect(result.ok).toBe(false);
    expect(useMemoryStore.getState().overlay.forgottenEntities).toEqual([]);
  });

  it("persists only the overlay", async () => {
    await useMemoryStore.getState().load();
    useMemoryStore.getState().forgetEntity(4);
    const written = JSON.parse(localStorage.getItem("tenka-studio-memory") ?? "{}");
    expect(written.state).toEqual({
      overlay: { forgottenEntities: [4], forgottenPreferences: [], forgottenProcedures: [] },
    });
  });
});

describe("memory-store's load() actually goes through the repository seam", () => {
  afterEach(() => {
    // Every other test in this file (and every other test file that
    // imports memory-store.ts) relies on the module-load self-configuration
    // to the demo bundle -- restore it so this describe block cannot bleed
    // into a later test.
    configureRepos("demo", demoRepoBundle);
    reset();
  });

  it("load() resolves with whatever the currently-configured repository returns, not a hardcoded seed", async () => {
    const stubBundle: RepoBundle = {
      ...demoRepoBundle,
      memory: {
        load: async () => ({
          entities: [
            {
              id: 999, type: "topic", canonicalName: "stub", displayName: "Stub",
              properties: {}, source: "test", confidence: 1,
              createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
              sourceTurnId: null,
            },
          ],
          facts: [], relationships: [], preferences: [], procedures: [],
        }),
        forget: async () => {},
        forgetAll: async () => {},
      },
    };
    configureRepos("demo", stubBundle);

    await useMemoryStore.getState().load();

    const s = useMemoryStore.getState();
    expect(s.status).toBe("ready");
    expect(s.entities).toHaveLength(1);
    expect(s.entities[0].displayName).toBe("Stub");
  });

  it("load() reaches the error branch when the repository rejects, not just when setTimeout throws", async () => {
    const stubBundle: RepoBundle = {
      ...demoRepoBundle,
      memory: {
        load: async () => {
          throw new Error("simulated repository failure");
        },
        forget: async () => {},
        forgetAll: async () => {},
      },
    };
    configureRepos("demo", stubBundle);

    await useMemoryStore.getState().load();
    expect(useMemoryStore.getState().status).toBe("error");
  });
});

describe("memory-store forgetting is a real delete against the repository (Milestone-4 blocker 5)", () => {
  beforeEach(() => useToastStore.setState(useToastStore.getInitialState()));
  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    reset();
  });

  it("PROOF-OF-FAILURE (Milestone-4 blocker 5): forgetEntity() calls the repository at all -- before this task it never did, live or demo", async () => {
    await useMemoryStore.getState().load();
    let calledWith: [string, string] | null = null;
    const stubBundle: RepoBundle = {
      ...demoRepoBundle,
      memory: {
        load: demoRepoBundle.memory.load,
        forget: async (scope, itemId) => {
          calledWith = [scope, itemId];
        },
        forgetAll: demoRepoBundle.memory.forgetAll,
      },
    };
    configureRepos("demo", stubBundle);

    useMemoryStore.getState().forgetEntity(4);
    // The optimistic overlay applies synchronously; the repository call
    // that is supposed to back it up is what this test actually proves --
    // give its microtask a turn before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(calledWith).toEqual(["knowledge", "4"]);
  });

  it("a refused delete reverts the optimistic overlay, leaving the row visible again, and toasts", async () => {
    await useMemoryStore.getState().load();
    const stubBundle: RepoBundle = {
      ...demoRepoBundle,
      memory: {
        load: demoRepoBundle.memory.load,
        forget: async () => {
          throw new Error("protected path");
        },
        forgetAll: demoRepoBundle.memory.forgetAll,
      },
    };
    configureRepos("demo", stubBundle);

    useMemoryStore.getState().forgetEntity(4);
    // Optimistically hidden the instant forgetEntity() returns.
    expect(useMemoryStore.getState().overlay.forgottenEntities).toEqual([4]);

    await vi.waitFor(() => {
      expect(useMemoryStore.getState().overlay.forgottenEntities).toEqual([]);
    });
    expect(useToastStore.getState().toasts[0]?.ok).toBe(false);
  });

  it("forgetAll() is refused with a distinct message when the daemon says this device may not do that (403)", async () => {
    useMemoryStore.setState({ ...useMemoryStore.getInitialState(), ...seedMemory(), status: "ready" });
    const stubBundle: RepoBundle = {
      ...demoRepoBundle,
      memory: {
        load: demoRepoBundle.memory.load,
        forget: demoRepoBundle.memory.forget,
        forgetAll: async () => {
          throw new ApiError(403, "forbidden");
        },
      },
    };
    configureRepos("demo", stubBundle);

    const result = await useMemoryStore.getState().forgetAll();
    expect(result.ok).toBe(false);
    expect(result.title).toMatch(/this device may not do that/i);
    // Reverted -- a refused forgetAll must not leave an empty overlay
    // shadowing a real, persisted one.
    expect(useMemoryStore.getState().overlay.forgottenEntities).toEqual([]);
  });

  it("forgetAll() reports a non-403 failure generically and still reverts", async () => {
    useMemoryStore.setState({ ...useMemoryStore.getInitialState(), ...seedMemory(), status: "ready" });
    const stubBundle: RepoBundle = {
      ...demoRepoBundle,
      memory: {
        load: demoRepoBundle.memory.load,
        forget: demoRepoBundle.memory.forget,
        forgetAll: async () => {
          throw new Error("simulated network failure");
        },
      },
    };
    configureRepos("demo", stubBundle);

    const result = await useMemoryStore.getState().forgetAll();
    expect(result.ok).toBe(false);
    expect(result.title).not.toMatch(/this device may not do that/i);
    expect(useMemoryStore.getState().overlay.forgottenEntities).toEqual([]);
  });
});

describe("memory-store persistence guard", () => {
  // Mirrors store/file-store.test.ts's persistence-guard block: real jsdom
  // localStorage under the store's actual persist key, exercised through
  // persist.rehydrate() so onRehydrateStorage's guard is what runs, not a
  // hand-rolled stand-in for it.
  const STORAGE_KEY = "tenka-studio-memory";

  beforeEach(() => {
    localStorage.clear();
    reset();
  });

  it("falls back to the empty overlay when the persisted payload is structurally wrong", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          overlay: {
            forgottenEntities: "not-an-array",
            forgottenPreferences: null,
            forgottenProcedures: [],
          },
        },
        version: 0,
      }),
    );

    await useMemoryStore.persist.rehydrate();

    const s = useMemoryStore.getState();
    expect(s.hasHydrated).toBe(true);
    expect(s.overlay).toEqual({
      forgottenEntities: [],
      forgottenPreferences: [],
      forgottenProcedures: [],
    });
  });
});
