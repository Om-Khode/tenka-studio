/**
 * Shapes mirror the assistant's SQLite columns (kg_entities, kg_facts,
 * kg_relationships, user_preferences + preference_log, user_procedures) so
 * spec 5 maps rather than translates. Dates are ISO strings, not Date objects:
 * they cross a persist boundary and must survive JSON round-tripping.
 */
export type MemoryScope = "knowledge" | "preferences" | "procedures";
export type EntitySort = "name" | "facts" | "recent";

/**
 * Arbitrary JSON, recursively. The daemon's own schema types this `unknown`
 * (`components["schemas"]["JsonValue"]` in `types/api.d.ts` -- openapi-typescript
 * cannot express a recursive JSON-value schema more precisely), but Studio's
 * own types can afford to say what "arbitrary JSON" actually means so a
 * future renderer gets real structure instead of re-deriving this union.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// kg_entities
export interface Entity {
  id: number;
  type: string;
  canonicalName: string;
  displayName: string;
  properties: Record<string, JsonValue>;
  source: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  sourceTurnId: string | null;
}

// kg_facts
export interface Fact {
  id: number;
  subjectId: number;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  eventAt: string | null;
  invalidAt: string | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  sourceTurnId: string | null;
}

// kg_relationships
export interface Relationship {
  id: number;
  fromId: number;
  toId: number;
  type: string;
  confidence: number;
  source: string;
  sourceTurnId: string | null;
  /**
   * The daemon carries this on every RelationshipPayload; Studio's seed
   * never has, so it stays optional rather than forcing `properties: {}`
   * onto ~54 literals in store/memory-scripts.ts for a field the demo does
   * not use.
   */
  properties?: Record<string, JsonValue>;
}

// user_preferences + preference_log
export interface Preference {
  key: string;
  value: string;
  updatedAt: string;
  history: { value: string; changedAt: string }[];
}

// user_procedures
export interface Procedure {
  id: number;
  name: string;
  steps: string[];
  taughtAt: string;
  runCount: number;
}

/**
 * A predicate's current value plus everything it replaced. Facts are
 * superseded, never overwritten, so the UI needs both halves together.
 */
export interface FactGroup {
  current: Fact;
  superseded: Fact[];
}

/** Only what the user changed is persisted. The seed is never written. */
export interface MemoryOverlay {
  forgottenEntities: number[];
  forgottenPreferences: string[];
  forgottenProcedures: number[];
}
