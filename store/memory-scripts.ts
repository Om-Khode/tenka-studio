import type { Entity, Fact, Relationship, Preference, Procedure } from "@/types/memory";

/**
 * No Date.now(), no Math.random(): the store replays a persisted forget
 * overlay over a freshly-seeded dataset, and a non-deterministic id would
 * silently forget a different row after a reload.
 */
const DAY = 86_400_000;
const EPOCH = Date.UTC(2026, 6, 1); // 2026-07-01, fixed
const iso = (dayOffset: number) => new Date(EPOCH + dayOffset * DAY).toISOString();

/** The entity given more neighbours than the ego graph will draw. */
export const HUB_ENTITY_ID = 1;

/** Scripted latency. Real enough to show a skeleton, short enough not to annoy. */
export const MEMORY_LOAD_DELAY_MS = 350;

export const ENTITY_TYPES = ["person", "app", "place", "topic", "device"] as const;

/**
 * Provenance targets. A turn id is opaque TEXT in the real schema.
 *
 * Every excerpt below is invented, and must stay invented. This dataset ships
 * in the public demo build (docs/deploy.md), where anyone can read it — so the
 * person it describes is a fiction with a plausible life, never the developer's
 * own. It used to be the latter: a real name, a real relocation, a real
 * sibling, and the real GPU in the machine this was written on.
 */
export const TURN_EXCERPTS: Record<string, string> = {
  "s12:4812": "you: I moved to Tokyo last month, finally out of Osaka",
  "s12:4813": "you: mostly Rust these days, TENKA is Python though",
  "s08:3320": "you: play something, the usual lo-fi thing",
  "s08:3321": "you: never open Spotify on the work profile, use the web player",
  "s15:5901": "you: my brother Sakuta is visiting on the weekend",
  "s15:5902": "you: the studio machine is the one with the 4060",
  "s19:7104": "you: I'm done with dark roast, switch me to filter coffee",
};

const BASE_ENTITIES: Omit<Entity, "properties">[] = [
  { id: 1, type: "person", canonicalName: "kirigaya shirogane", displayName: "Kirigaya Shirogane",
    source: "conversation", confidence: 1, createdAt: iso(0), updatedAt: iso(31),
    sourceTurnId: "s12:4812" },
  { id: 2, type: "place", canonicalName: "tokyo", displayName: "Tokyo",
    source: "conversation", confidence: 0.92, createdAt: iso(30), updatedAt: iso(30),
    sourceTurnId: "s12:4812" },
  { id: 3, type: "place", canonicalName: "osaka", displayName: "Osaka",
    source: "conversation", confidence: 0.9, createdAt: iso(2), updatedAt: iso(30),
    sourceTurnId: null },
  { id: 4, type: "app", canonicalName: "spotify", displayName: "Spotify",
    source: "automation", confidence: 1, createdAt: iso(5), updatedAt: iso(28),
    sourceTurnId: "s08:3320" },
  { id: 5, type: "topic", canonicalName: "rust", displayName: "Rust",
    source: "conversation", confidence: 0.85, createdAt: iso(9), updatedAt: iso(29),
    sourceTurnId: "s12:4813" },
  { id: 6, type: "topic", canonicalName: "tenka", displayName: "TENKA",
    source: "conversation", confidence: 1, createdAt: iso(1), updatedAt: iso(33),
    sourceTurnId: "s12:4813" },
  { id: 7, type: "person", canonicalName: "sakuta", displayName: "Sakuta",
    source: "conversation", confidence: 0.78, createdAt: iso(22), updatedAt: iso(22),
    sourceTurnId: "s15:5901" },
  { id: 8, type: "device", canonicalName: "studio machine", displayName: "Studio machine",
    source: "conversation", confidence: 0.95, createdAt: iso(11), updatedAt: iso(24),
    sourceTurnId: "s15:5902" },
  { id: 9, type: "topic", canonicalName: "filter coffee", displayName: "Filter coffee",
    source: "conversation", confidence: 0.7, createdAt: iso(34), updatedAt: iso(34),
    sourceTurnId: "s19:7104" },
];

/**
 * Filler entities exist so the list virtualizes over something realistic and
 * so the hub has neighbours to hide. Generated, but from an index -- still
 * deterministic.
 */
function fillerEntities(): Entity[] {
  return Array.from({ length: 60 }, (_, i) => {
    const n = i + 10;
    const type = ENTITY_TYPES[i % ENTITY_TYPES.length];
    return {
      id: n,
      type,
      canonicalName: `${type} ${n}`,
      displayName: `${type[0].toUpperCase()}${type.slice(1)} ${n}`,
      properties: {},
      source: i % 3 === 0 ? "automation" : "conversation",
      confidence: 1 - (i % 5) * 0.05,
      createdAt: iso(i % 34),
      updatedAt: iso(i % 34),
      sourceTurnId: null,
    };
  });
}

const FACTS: Fact[] = [
  // The supersession pair: she learned Osaka first, then Tokyo replaced it.
  { id: 1, subjectId: 1, predicate: "lives_in", object: "Osaka", confidence: 0.9,
    source: "conversation", eventAt: iso(-400), invalidAt: iso(30), expiresAt: null,
    verifiedAt: null, createdAt: iso(2), sourceTurnId: null },
  { id: 2, subjectId: 1, predicate: "lives_in", object: "Tokyo", confidence: 0.92,
    source: "conversation", eventAt: iso(28), invalidAt: null, expiresAt: null,
    verifiedAt: iso(31), createdAt: iso(30), sourceTurnId: "s12:4812" },
  { id: 3, subjectId: 1, predicate: "works_on", object: "TENKA", confidence: 1,
    source: "conversation", eventAt: null, invalidAt: null, expiresAt: null,
    verifiedAt: iso(33), createdAt: iso(1), sourceTurnId: "s12:4813" },
  { id: 4, subjectId: 1, predicate: "learning", object: "Rust", confidence: 0.85,
    source: "conversation", eventAt: iso(9), invalidAt: null, expiresAt: null,
    verifiedAt: null, createdAt: iso(9), sourceTurnId: "s12:4813" },
  { id: 5, subjectId: 1, predicate: "sibling", object: "Sakuta", confidence: 0.78,
    source: "conversation", eventAt: null, invalidAt: null, expiresAt: null,
    verifiedAt: null, createdAt: iso(22), sourceTurnId: "s15:5901" },
  { id: 6, subjectId: 1, predicate: "drinks", object: "dark roast", confidence: 0.6,
    source: "conversation", eventAt: null, invalidAt: iso(34), expiresAt: null,
    verifiedAt: null, createdAt: iso(6), sourceTurnId: null },
  { id: 7, subjectId: 1, predicate: "drinks", object: "filter coffee", confidence: 0.7,
    source: "conversation", eventAt: iso(34), invalidAt: null, expiresAt: null,
    verifiedAt: null, createdAt: iso(34), sourceTurnId: "s19:7104" },
  { id: 8, subjectId: 4, predicate: "opened_via", object: "web player", confidence: 0.95,
    source: "automation", eventAt: null, invalidAt: null, expiresAt: null,
    verifiedAt: iso(28), createdAt: iso(5), sourceTurnId: "s08:3321" },
  { id: 9, subjectId: 4, predicate: "usual_mood", object: "lo-fi", confidence: 0.8,
    source: "conversation", eventAt: null, invalidAt: null, expiresAt: null,
    verifiedAt: null, createdAt: iso(5), sourceTurnId: "s08:3320" },
  { id: 10, subjectId: 8, predicate: "gpu", object: "RTX 4060", confidence: 1,
    source: "conversation", eventAt: null, invalidAt: null, expiresAt: null,
    verifiedAt: iso(24), createdAt: iso(11), sourceTurnId: "s15:5902" },
  { id: 11, subjectId: 6, predicate: "written_in", object: "Python 3.11", confidence: 1,
    source: "conversation", eventAt: null, invalidAt: null, expiresAt: null,
    verifiedAt: null, createdAt: iso(1), sourceTurnId: null },
  { id: 12, subjectId: 2, predicate: "timezone", object: "Asia/Tokyo", confidence: 1,
    source: "automation", eventAt: null, invalidAt: null, expiresAt: null,
    verifiedAt: null, createdAt: iso(30), sourceTurnId: null },
];

/**
 * Relationship 999 points at entity 9999, which does not exist. Real graphs
 * carry dangling references -- the assistant documents at least one
 * deliberate case -- and the ego graph must skip rather than throw.
 */
function relationships(): Relationship[] {
  const named: Relationship[] = [
    { id: 1, fromId: 1, toId: 2, type: "lives_in", confidence: 0.92,
      source: "conversation", sourceTurnId: "s12:4812" },
    { id: 2, fromId: 1, toId: 6, type: "works_on", confidence: 1,
      source: "conversation", sourceTurnId: "s12:4813" },
    { id: 3, fromId: 1, toId: 5, type: "learning", confidence: 0.85,
      source: "conversation", sourceTurnId: "s12:4813" },
    { id: 4, fromId: 1, toId: 7, type: "sibling", confidence: 0.78,
      source: "conversation", sourceTurnId: "s15:5901" },
    { id: 5, fromId: 1, toId: 8, type: "owns", confidence: 0.95,
      source: "conversation", sourceTurnId: "s15:5902" },
    { id: 6, fromId: 1, toId: 4, type: "uses", confidence: 1,
      source: "automation", sourceTurnId: "s08:3320" },
    { id: 7, fromId: 6, toId: 8, type: "runs_on", confidence: 1,
      source: "automation", sourceTurnId: null },
    { id: 8, fromId: 3, toId: 2, type: "replaced_by", confidence: 0.9,
      source: "conversation", sourceTurnId: "s12:4812" },
  ];
  // Push the hub past the ego graph's draw limit.
  const bulk: Relationship[] = Array.from({ length: 44 }, (_, i) => ({
    id: 100 + i,
    fromId: HUB_ENTITY_ID,
    toId: 10 + i,
    type: "mentioned_with",
    confidence: 0.5,
    source: "conversation",
    sourceTurnId: null,
  }));
  const dangling: Relationship = {
    id: 999, fromId: HUB_ENTITY_ID, toId: 9999, type: "mentioned_with",
    confidence: 0.4, source: "conversation", sourceTurnId: null,
  };
  return [...named, ...bulk, dangling];
}

const PREFERENCES: Preference[] = [
  { key: "music.player", value: "web player", updatedAt: iso(28),
    history: [{ value: "desktop app", changedAt: iso(5) }] },
  { key: "coffee.roast", value: "filter", updatedAt: iso(34),
    history: [{ value: "dark roast", changedAt: iso(6) }] },
  { key: "reply.length", value: "short", updatedAt: iso(12), history: [] },
  { key: "notifications.evening", value: "muted", updatedAt: iso(19),
    history: [{ value: "all", changedAt: iso(3) }, { value: "urgent only", changedAt: iso(11) }] },
  { key: "browser.default", value: "chrome", updatedAt: iso(8), history: [] },
];

const PROCEDURES: Procedure[] = [
  { id: 1, name: "morning setup", taughtAt: iso(7), runCount: 23,
    steps: ["open Chrome", "open the standup board", "open VS Code on TENKA", "mute notifications"] },
  { id: 2, name: "wind down", taughtAt: iso(15), runCount: 9,
    steps: ["close the work profile", "start the lo-fi playlist", "drop screen brightness"] },
  { id: 3, name: "ship a branch", taughtAt: iso(26), runCount: 4,
    steps: ["run the tests", "push the branch", "open the compare page"] },
];

export function seedMemory(): {
  entities: Entity[];
  facts: Fact[];
  relationships: Relationship[];
  preferences: Preference[];
  procedures: Procedure[];
} {
  return {
    entities: [...BASE_ENTITIES.map((e) => ({ ...e, properties: {} })), ...fillerEntities()],
    facts: FACTS.map((f) => ({ ...f })),
    relationships: relationships(),
    preferences: PREFERENCES.map((p) => ({ ...p, history: [...p.history] })),
    procedures: PROCEDURES.map((p) => ({ ...p, steps: [...p.steps] })),
  };
}
