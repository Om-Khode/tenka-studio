import { apiGet, apiSend } from "@/services/http";
import type { components } from "@/types/api";
import type { Entity, Fact, Relationship, Preference, Procedure, MemoryScope, JsonValue } from "@/types/memory";
import type { MemoryRepo, MemorySnapshot } from "../types";

type EntityPayload = components["schemas"]["EntityPayload"];
type FactPayload = components["schemas"]["FactPayload"];
type RelationshipPayload = components["schemas"]["RelationshipPayload"];
type PreferenceRecordPayload = components["schemas"]["PreferenceRecordPayload"];
type ProcedureRecordPayload = components["schemas"]["ProcedureRecordPayload"];
type KnowledgeGraphPayload = components["schemas"]["KnowledgeGraphPayload"];
type PreferencesPayload = components["schemas"]["PreferencesPayload"];
type ProceduresPayload = components["schemas"]["ProceduresPayload"];

function mapEntity(p: EntityPayload): Entity {
  return {
    id: p.id,
    type: p.type,
    canonicalName: p.canonicalName,
    displayName: p.displayName,
    // The generated schema types this `unknown` -- openapi-typescript has no
    // recursive-JSON form to emit -- but it is real JSON off an
    // `application/json` body, so Studio's own recursive `JsonValue`
    // (types/memory.ts) is the honest type on this side of the wire.
    properties: p.properties as Record<string, JsonValue>,
    source: p.source,
    confidence: p.confidence,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    sourceTurnId: p.sourceTurnId,
  };
}

function mapFact(p: FactPayload): Fact {
  return {
    id: p.id,
    subjectId: p.subjectId,
    predicate: p.predicate,
    object: p.object,
    confidence: p.confidence,
    source: p.source,
    eventAt: p.eventAt,
    invalidAt: p.invalidAt,
    expiresAt: p.expiresAt,
    verifiedAt: p.verifiedAt,
    createdAt: p.createdAt,
    sourceTurnId: p.sourceTurnId,
  };
}

/**
 * A relationship pointing at an entity id absent from this same response's
 * `entities` array passes through here untouched, on purpose -- confirmed
 * against the daemon's own contract test
 * (`test_a_dangling_relationship_passes_through_untouched` in
 * `tests/test_api_read_routes.py`). Filtering it out at
 * this edge would hide a real data problem from the only code built to
 * survive it: `selectNeighborsFor` in `store/memory-store.ts` already drops
 * an edge whose other end does not resolve, at render time, where "this
 * pointed at nothing" is visible to whoever debugs it next.
 */
function mapRelationship(p: RelationshipPayload): Relationship {
  return {
    id: p.id,
    fromId: p.fromId,
    toId: p.toId,
    type: p.type,
    confidence: p.confidence,
    source: p.source,
    sourceTurnId: p.sourceTurnId,
    properties: p.properties as Record<string, JsonValue>,
  };
}

function mapPreference(p: PreferenceRecordPayload): Preference {
  return {
    key: p.key,
    value: p.value,
    updatedAt: p.updatedAt,
    history: p.history.map((h) => ({ value: h.value, changedAt: h.changedAt })),
  };
}

function mapProcedure(p: ProcedureRecordPayload): Procedure {
  return {
    id: p.id,
    name: p.name,
    steps: [...p.steps],
    taughtAt: p.taughtAt,
    runCount: p.runCount,
  };
}

/**
 * Three routes, three payload types (`/knowledge`, `/preferences`,
 * `/procedures` -- "the shipped contract", delta 1). `load()` fetches all
 * three concurrently and rejects if any one of them does, rather than
 * resolving a snapshot with a gap silently filled by an empty array. A page
 * that renders an empty knowledge graph because `/preferences` 500'd would
 * read as "she knows nothing", not "something failed" -- and
 * `memory-store.ts`'s `load()` already has an error branch built for exactly
 * this; a partial resolve would never reach it.
 */
export class HttpMemoryRepo implements MemoryRepo {
  async load(): Promise<MemorySnapshot> {
    const [knowledge, preferences, procedures] = await Promise.all([
      apiGet<KnowledgeGraphPayload>("/v1/memory/knowledge"),
      apiGet<PreferencesPayload>("/v1/memory/preferences"),
      apiGet<ProceduresPayload>("/v1/memory/procedures"),
    ]);

    return {
      entities: knowledge.entities.map(mapEntity),
      facts: knowledge.facts.map(mapFact),
      relationships: knowledge.relationships.map(mapRelationship),
      preferences: preferences.preferences.map(mapPreference),
      procedures: procedures.procedures.map(mapProcedure),
    };
  }

  /**
   * `itemId` goes straight into the path. `encodeURIComponent` covers a
   * preference key containing e.g. `/` or `?`; entity/procedure ids
   * (stringified integers) never need it but are not harmed by it either.
   * The response body (`ForgottenPayload.forgotten`, an echo of `itemId`)
   * carries nothing this repo's caller does not already know, so it is
   * discarded -- the only thing that matters to a caller is whether this
   * resolved or rejected.
   */
  async forget(scope: MemoryScope, itemId: string): Promise<void> {
    await apiSend<components["schemas"]["ForgottenPayload"]>(
      "DELETE",
      `/v1/memory/${scope}/${encodeURIComponent(itemId)}`,
    );
  }

  /**
   * Gated on `system_control`, not `chat_send` (the shipped contract). A caller
   * without that grant gets an `ApiError` with `status === 403`, the same
   * shape every other capability failure takes -- this repo does not wrap
   * or rename it, because `ApiError.status` already carries the distinction
   * the danger zone needs to say "this device may not do that" instead of a
   * generic failure.
   */
  async forgetAll(): Promise<void> {
    await apiSend<components["schemas"]["RemovedPayload"]>("DELETE", "/v1/memory");
  }
}
