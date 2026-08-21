"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { TURN_EXCERPTS } from "@/store/memory-scripts";
import { getRepoMode } from "@/services/repo-registry";
import { cn } from "@/lib/utils";

/**
 * The v17 source_turn_id backlink, made visible. It is null on every row
 * created before provenance existed, and that is a normal state -- not an
 * error, not an empty box.
 *
 * Shared by both route trees, which is why the excerpt is mode-gated
 * (milestone 5b, Task "10c"). `TURN_EXCERPTS` is demo seed data and the
 * daemon has no equivalent: openapi.json carries `sourceTurnId` on a memory
 * row and `turnId` on a chat POST's 202, and exposes no route keyed by
 * either -- a conversation's messages are addressed by `messageId`, which is
 * not the same identifier. So in live mode there is no wire source for the
 * line, and rendering the seeded one beside a real daemon's memory would put
 * words in a turn nobody can check. The id itself is genuine provenance and
 * still shows; the sentence under it simply is not there. Absent is honest.
 *
 * `=== "demo"`, not `!== "live"`. `getRepoMode()` is `RepoMode | null`, and
 * null means configureRepos() has not run -- an unbound registry, which
 * getRepos() deliberately fails CLOSED on. Every sibling guard was flipped this
 * way in Task 12 (system-store's three branches, and the memory/files stores'):
 * this one was the last left fail-open, so an unbound Studio rendered demo
 * excerpts under whatever chrome it happened to be showing. Demo is the branch
 * that has to prove itself.
 */
export function ProvenanceBlock({ sourceTurnId }: { sourceTurnId: string | null }) {
  const [open, setOpen] = useState(false);
  const demo = getRepoMode() === "demo";

  if (!sourceTurnId) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-wide text-bone-ghost">
        no provenance recorded
      </p>
    );
  }

  const excerpt = demo ? TURN_EXCERPTS[sourceTurnId] : null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 self-start font-mono text-[10px] uppercase tracking-wide text-bone-subtle hover:text-bone"
      >
        <ChevronRight size={12} className={cn("transition-transform", open && "rotate-90")} />
        why do you think that?
      </button>
      {open && (
        <div className="rounded-md border border-border bg-card p-3">
          {/* Labelled, not bare. This used to render the id alone, which in
              live mode was the entire contents of the panel -- an unexplained
              "c017af5f-…:54" under the question "why do you think that?".
              The id is real provenance and worth showing, but a raw
              identifier with no sentence around it reads as a rendering bug
              rather than an answer. */}
          <p className="font-mono text-[10px] uppercase tracking-wide text-bone-subtle">
            learned during turn
          </p>
          <p className="mt-0.5 break-all font-mono text-[10px] text-bone-ghost">{sourceTurnId}</p>

          {/* "no longer in her history" is a claim only the demo's complete
              excerpt map can make. In live mode the excerpt is missing
              because nothing serves it, not because the turn is gone -- so
              the line says which of the two it is rather than guessing. */}
          {demo ? (
            <p className="mt-1 text-xs text-bone-dim">
              {excerpt ?? "That turn is no longer in her history."}
            </p>
          ) : (
            <p className="mt-1 text-xs text-bone-dim">
              She recorded which turn taught her this, but not a way to read it back — no route
              serves a turn&apos;s text, so Studio can show the reference and not the words.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
