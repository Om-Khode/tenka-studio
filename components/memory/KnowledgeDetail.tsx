"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FactRow } from "./FactRow";
import { EgoGraph } from "./EgoGraph";
import { ProvenanceBlock } from "./ProvenanceBlock";
import {
  useMemoryStore,
  selectFactGroupsFor,
  selectNeighborsFor,
  FACTS_PAGE_SIZE,
} from "@/store/memory-store";
import { useToastStore } from "@/store/toast-store";

export function KnowledgeDetail({ entityId }: { entityId: number }) {
  // Narrow reads (Task 12) -- but NOT `useShallow(selectFactGroupsFor)`.
  // Those two selectors mint a fresh object per group/link, so a shallow
  // element-wise compare never matches and `getSnapshot` would return a
  // different value on two calls in one render (see their own docs). The raw
  // slices below are stable array references, so subscribing to them and
  // deriving in the render body is both correct and narrower than the whole
  // store this used to take.
  const entities = useMemoryStore((s) => s.entities);
  const facts = useMemoryStore((s) => s.facts);
  const relationships = useMemoryStore((s) => s.relationships);
  const overlay = useMemoryStore((s) => s.overlay);
  const forgetEntity = useMemoryStore((s) => s.forgetEntity);
  const [confirming, setConfirming] = useState(false);
  const [showAllFacts, setShowAllFacts] = useState(false);

  const entity = entities.find((e) => e.id === entityId);
  if (!entity) return null;

  const groups = selectFactGroupsFor({ facts, overlay }, entityId);
  const links = selectNeighborsFor({ entities, relationships, overlay }, entityId);
  // The assistant's get_facts_for_entity caps at 20; the pane never assumes
  // it holds everything.
  const shown = showAllFacts ? groups : groups.slice(0, FACTS_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg text-bone">{entity.displayName}</h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-bone-ghost">
          {entity.type}
        </span>
      </header>

      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wide text-bone-subtle">
          facts ({groups.length})
        </h3>
        {groups.length === 0 ? (
          <p className="text-xs text-bone-ghost">She knows of it, but knows nothing about it.</p>
        ) : (
          <ul aria-label="Facts" className="flex flex-col">
            {shown.map((group) => (
              <FactRow key={group.current.id} group={group} />
            ))}
          </ul>
        )}
        {groups.length > shown.length && (
          <Button variant="ghost" size="sm" onClick={() => setShowAllFacts(true)}>
            show all {groups.length}
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wide text-bone-subtle">
          relations ({links.length})
        </h3>
        <EgoGraph center={entity} links={links} />
        <ul aria-label="Relations" className="flex flex-col">
          {links.map(({ relationship, entity: other }) => (
            <li
              key={relationship.id}
              className="flex items-baseline gap-2 border-b border-border py-1.5 text-xs last:border-b-0"
            >
              <span className="font-mono text-[11px] text-bone-subtle">{relationship.type}</span>
              <span className="text-bone-ghost">→</span>
              <span className="text-bone-dim">{other.displayName}</span>
            </li>
          ))}
        </ul>
      </section>

      <ProvenanceBlock sourceTurnId={entity.sourceTurnId} />

      <Button
        variant="secondary"
        size="sm"
        className="self-start border-fail/40 text-fail hover:border-fail"
        onClick={() => setConfirming(true)}
      >
        forget this
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive
        title={`Forget ${entity.displayName}?`}
        body="She drops the entity, its facts, and its relations. Nothing else changes."
        confirmLabel="forget it"
        onConfirm={() => {
          forgetEntity(entityId);
          useToastStore.getState().push({
            ok: true,
            title: `Forgot ${entity.displayName}`,
            detail: "Its facts and relations went with it.",
          });
        }}
      />
    </div>
  );
}
