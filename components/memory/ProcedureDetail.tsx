"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useMemoryStore } from "@/store/memory-store";
import { useToastStore } from "@/store/toast-store";
import { formatDate } from "@/lib/format";

/**
 * The caption under a procedure's name used to read "taught by voice · run N
 * times". "by voice" was a literal: `Procedure` (types/memory.ts) is
 * `{id, name, steps, taughtAt, runCount}` and `ProcedureRecordPayload` carries
 * the same five, so nothing on either side of the wire says how a procedure was
 * taught. One typed into Studio's own chat, or promoted from a learned
 * manifest, read as voice-taught all the same -- the `gemini-flash-lite` card's
 * failure in a smaller font. `taughtAt` is the one real provenance value the
 * row has, and it was being fetched (services/repos/http/memory.ts) and then
 * rendered nowhere. It replaces the claim rather than joining it.
 */
export function ProcedureDetail({ procedureId }: { procedureId: number }) {
  const procedures = useMemoryStore((s) => s.procedures);
  const forget = useMemoryStore((s) => s.forgetProcedure);
  const [confirming, setConfirming] = useState(false);

  const procedure = procedures.find((p) => p.id === procedureId);
  if (!procedure) return null;

  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-4">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg text-bone">{procedure.name}</h2>
        <p className="font-mono text-[10px] text-bone-ghost">
          taught {formatDate(procedure.taughtAt)} · run {procedure.runCount} times
        </p>
      </header>

      <ol className="flex flex-col gap-1">
        {procedure.steps.map((step, i) => (
          <li key={step} className="flex gap-3 border-b border-border py-2 text-sm last:border-b-0">
            <span className="font-mono text-[11px] text-bone-ghost">{i + 1}</span>
            <span className="text-bone-dim">{step}</span>
          </li>
        ))}
      </ol>

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
        title={`Forget "${procedure.name}"?`}
        body="She unlearns the routine. You would have to teach it again."
        confirmLabel="forget it"
        onConfirm={() => {
          forget(procedure.id);
          useToastStore.getState().push({ ok: true, title: `Forgot "${procedure.name}"` });
        }}
      />
    </div>
  );
}
