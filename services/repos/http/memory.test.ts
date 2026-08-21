import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase, ApiError } from "@/services/http";
import { HttpMemoryRepo } from "./memory";

const BASE = apiBase();
const envelope = <T>(data: T) => ({ data, meta: { requestId: "r1", generatedAt: "2026-08-09T00:00:00Z" } });

const KNOWLEDGE = {
  entities: [
    {
      id: 1,
      type: "person",
      canonicalName: "kirigaya shirogane",
      displayName: "Kirigaya Shirogane",
      // A non-string property value: the whole reason Entity.properties
      // widens off `Record<string, string>`.
      properties: { visits: 12, verified: true, tags: ["pune", "rust"], note: null },
      source: "conversation",
      confidence: 1,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
      sourceTurnId: "s12:4812",
    },
    {
      id: 2,
      type: "place",
      canonicalName: "pune",
      displayName: "Pune",
      properties: {},
      source: "conversation",
      confidence: 0.92,
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
      sourceTurnId: "s12:4812",
    },
  ],
  facts: [
    // The supersession pair: superseded first (invalidAt set), current second.
    {
      id: 1,
      subjectId: 1,
      predicate: "lives_in",
      object: "Mumbai",
      confidence: 0.9,
      source: "conversation",
      eventAt: "2025-05-28T00:00:00.000Z",
      invalidAt: "2026-07-30T00:00:00.000Z",
      expiresAt: null,
      verifiedAt: null,
      createdAt: "2026-07-02T00:00:00.000Z",
      sourceTurnId: null,
    },
    {
      id: 2,
      subjectId: 1,
      predicate: "lives_in",
      object: "Pune",
      confidence: 0.92,
      source: "conversation",
      eventAt: "2026-07-28T00:00:00.000Z",
      invalidAt: null,
      expiresAt: null,
      verifiedAt: "2026-07-31T00:00:00.000Z",
      createdAt: "2026-07-30T00:00:00.000Z",
      sourceTurnId: "s12:4812",
    },
  ],
  relationships: [
    { id: 1, fromId: 1, toId: 2, type: "lives_in", properties: {}, confidence: 0.92, source: "conversation", sourceTurnId: "s12:4812" },
    // Dangling on purpose: toId 9999 is not in `entities` above. The daemon
    // sends this untouched (per its own contract test); this repo must not
    // filter it either.
    { id: 999, fromId: 1, toId: 9999, type: "mentioned_with", properties: { weight: 0.4 }, confidence: 0.4, source: "conversation", sourceTurnId: null },
  ],
};

const PREFERENCES = {
  preferences: [
    {
      key: "coffee.roast",
      value: "filter",
      updatedAt: "2026-08-03T00:00:00.000Z",
      history: [{ value: "dark roast", changedAt: "2026-07-06T00:00:00.000Z" }],
    },
  ],
};

const PROCEDURES = {
  procedures: [
    { id: 1, name: "morning setup", steps: ["open Chrome", "open VS Code"], taughtAt: "2026-07-07T00:00:00.000Z", runCount: 23 },
  ],
};

function stubReads(overrides?: { knowledgeStatus?: number; preferencesStatus?: number; proceduresStatus?: number }) {
  const ks = overrides?.knowledgeStatus ?? 200;
  const ps = overrides?.preferencesStatus ?? 200;
  const rs = overrides?.proceduresStatus ?? 200;
  server.use(
    http.get(`${BASE}/v1/memory/knowledge`, () =>
      ks === 200
        ? HttpResponse.json(envelope(KNOWLEDGE))
        : HttpResponse.json({ detail: "boom" }, { status: ks }),
    ),
    http.get(`${BASE}/v1/memory/preferences`, () =>
      ps === 200
        ? HttpResponse.json(envelope(PREFERENCES))
        : HttpResponse.json({ detail: "boom" }, { status: ps }),
    ),
    http.get(`${BASE}/v1/memory/procedures`, () =>
      rs === 200
        ? HttpResponse.json(envelope(PROCEDURES))
        : HttpResponse.json({ detail: "boom" }, { status: rs }),
    ),
  );
}

describe("HttpMemoryRepo.load", () => {
  it("maps all three routes into one snapshot", async () => {
    stubReads();
    const repo = new HttpMemoryRepo();
    const snapshot = await repo.load();

    expect(snapshot.entities).toHaveLength(2);
    expect(snapshot.entities[0].properties).toEqual({
      visits: 12,
      verified: true,
      tags: ["pune", "rust"],
      note: null,
    });

    expect(snapshot.facts).toHaveLength(2);
    const superseded = snapshot.facts.find((f) => f.id === 1);
    const current = snapshot.facts.find((f) => f.id === 2);
    expect(superseded?.invalidAt).toBe("2026-07-30T00:00:00.000Z");
    expect(current?.invalidAt).toBeNull();

    expect(snapshot.preferences).toEqual(PREFERENCES.preferences);
    expect(snapshot.procedures).toEqual(PROCEDURES.procedures);
  });

  it("passes a dangling relationship through untouched", async () => {
    stubReads();
    const repo = new HttpMemoryRepo();
    const snapshot = await repo.load();

    const dangling = snapshot.relationships.find((r) => r.id === 999);
    expect(dangling).toBeDefined();
    expect(dangling?.toId).toBe(9999);
    expect(snapshot.entities.some((e) => e.id === 9999)).toBe(false);
    expect(dangling?.properties).toEqual({ weight: 0.4 });
  });

  it("rejects rather than resolving a partial snapshot when one route fails", async () => {
    stubReads({ preferencesStatus: 500 });
    const repo = new HttpMemoryRepo();
    await expect(repo.load()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("HttpMemoryRepo.forget", () => {
  it("issues a DELETE to /v1/memory/{scope}/{itemId}", async () => {
    let seenMethod = "";
    let seenUrl = "";
    server.use(
      http.delete(`${BASE}/v1/memory/knowledge/1`, ({ request }) => {
        seenMethod = request.method;
        seenUrl = request.url;
        return HttpResponse.json(envelope({ forgotten: "1" }));
      }),
    );
    const repo = new HttpMemoryRepo();
    await repo.forget("knowledge", "1");
    expect(seenMethod).toBe("DELETE");
    expect(seenUrl).toBe(`${BASE}/v1/memory/knowledge/1`);
  });

  it("does not need system_control -- a plain 200 with only chat_send resolves", async () => {
    server.use(
      http.delete(`${BASE}/v1/memory/preferences/coffee.roast`, () =>
        HttpResponse.json(envelope({ forgotten: "coffee.roast" })),
      ),
    );
    const repo = new HttpMemoryRepo();
    await expect(repo.forget("preferences", "coffee.roast")).resolves.toBeUndefined();
  });

  it("rejects with the daemon's status on a 404 (item already gone)", async () => {
    server.use(
      http.delete(`${BASE}/v1/memory/procedures/999`, () => HttpResponse.json({ error: "not found" }, { status: 404 })),
    );
    const repo = new HttpMemoryRepo();
    const err = await repo.forget("procedures", "999").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });
});

describe("HttpMemoryRepo.forgetAll", () => {
  it("issues a DELETE to /v1/memory", async () => {
    server.use(http.delete(`${BASE}/v1/memory`, () => HttpResponse.json(envelope({ removed: 12 }))));
    const repo = new HttpMemoryRepo();
    await expect(repo.forgetAll()).resolves.toBeUndefined();
  });

  it("surfaces a missing system_control grant as a distinct 403, not a generic failure", async () => {
    server.use(
      http.delete(`${BASE}/v1/memory`, () => HttpResponse.json({ detail: "capability not granted" }, { status: 403 })),
    );
    const repo = new HttpMemoryRepo();
    const err = await repo.forgetAll().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
  });
});
