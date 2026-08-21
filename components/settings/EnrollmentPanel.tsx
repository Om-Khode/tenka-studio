"use client";

import { useEffect, useState } from "react";
import { Mic, ScanFace } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSystemStore } from "@/store/system-store";
import { useToastStore } from "@/store/toast-store";
import { formatDate } from "@/lib/format";

type Pending = { kind: "voice" | "face"; id: string; name: string } | null;

/** Both seeded people have one of each kind, so the dialog and toast must name
 * the kind, not just the person -- "Forget Om?" alone can't tell a mis-click
 * whether it is about to lose the voiceprint or the face encodings. `kind`
 * already reads as the noun we want ("voice"/"face"), so no separate map. */
const describePending = (p: NonNullable<Pending>) => `${p.name}'s ${p.kind}`;

/**
 * `count` is `number | null` on the wire -- null means the assistant does
 * not know, not zero (see types/system.ts, EnrolledItemPayload). Rendering
 * it unconditionally as `${count} ${noun}` turned an honest "unknown" into
 * the string "null samples"; rendering it as 0 would be worse, a confident
 * wrong fact. Absent is the only truthful choice: just the noun.
 */
function countLabel(count: number | null, noun: string): string {
  return count === null ? noun : `${count} ${noun}`;
}

export function EnrollmentPanel() {
  // Milestone-4 blocker 1: system-store had no LoadStatus before this task,
  // so this panel assumed `voices`/`faces` were always present -- true while
  // they were seeded synchronously, a lie once /app has to fetch them and
  // that fetch can fail. Mirrors PersonalityPanel's own idle -> load() ->
  // skeleton/error shape. Shares system-store's one status with BackupPanel
  // -- both effects check `=== "idle"` before calling load(), so mounting
  // both at once never double-fires it.
  const status = useSystemStore((s) => s.status);
  // Narrow reads: voices/faces are stable array references until mutated, and
  // the store actions are stable closures, so no useShallow is needed here --
  // the merged `rows` array below is built in the render body, not a selector.
  const voices = useSystemStore((s) => s.voices);
  const faces = useSystemStore((s) => s.faces);
  const forgetVoice = useSystemStore((s) => s.forgetVoice);
  const forgetFace = useSystemStore((s) => s.forgetFace);
  const load = useSystemStore((s) => s.load);
  const [pending, setPending] = useState<Pending>(null);

  useEffect(() => {
    if (status === "idle") void load();
  }, [status, load]);

  if (status === "error") {
    // GET /v1/enrollment requires RECALL -- who she recognises is part of what
    // she remembers, not part of what she is doing, so an `observe`-only phone
    // is refused here even though the backup panel above it loads fine.
    return (
      <Card className="p-4">
        <LoadFailure
          capability="recall"
          unreachable="She could not reach who she recognises."
          onRetry={() => void load()}
        />
      </Card>
    );
  }

  if (status !== "ready") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  }

  const rows = [
    ...voices.map((v) => ({
      kind: "voice" as const,
      id: v.id,
      name: v.name,
      detail: countLabel(v.sampleCount, "samples"),
      last: v.lastHeardAt,
    })),
    ...faces.map((f) => ({
      kind: "face" as const,
      id: f.id,
      name: f.name,
      detail: countLabel(f.encodingCount, "encodings"),
      last: f.lastSeenAt,
    })),
  ];

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-widest text-bone-subtle">
        who she recognises
      </h2>

      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={`${row.kind}-${row.id}`}
            className="flex items-center gap-3 border-b border-border py-2 last:border-b-0"
          >
            {row.kind === "voice" ? (
              <Mic size={14} className="text-bone-subtle" />
            ) : (
              <ScanFace size={14} className="text-bone-subtle" />
            )}
            <span className="flex min-w-0 flex-col">
              <span className="text-sm text-bone">{row.name}</span>
              <span className="font-mono text-[10px] text-bone-ghost">
                {row.detail} ·{" "}
                {row.last ? `last ${formatDate(row.last)}` : "not seen since"}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setPending({ kind: row.kind, id: row.id, name: row.name })}
              className="ml-auto font-mono text-[10px] uppercase tracking-wide text-bone-ghost hover:text-fail"
            >
              forget
            </button>
          </li>
        ))}
      </ul>

      <p className="text-xs text-bone-ghost">
        Enrolling someone new needs the microphone and camera on her machine — Studio can show who
        she knows, not teach her someone.
      </p>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        destructive
        title={pending ? `Forget ${describePending(pending)}?` : ""}
        body="She stops recognising them until they enrol again."
        confirmLabel="forget it"
        onConfirm={() => {
          if (!pending) return;
          const description = describePending(pending);
          // forgetVoice/forgetFace now await SystemRepo.forgetEnrolled()
          // before removing anything (follow-up to Milestone-4 blocker 5) --
          // the row is only gone, and only worth this toast, once the
          // daemon actually agreed. A refusal (including a 403 read as
          // "this device may not do that") comes back as its own
          // ActionResult, not a thrown rejection.
          const outcome = pending.kind === "voice" ? forgetVoice(pending.id) : forgetFace(pending.id);
          outcome
            .then((result) => {
              useToastStore.getState().push(
                result.ok ? { ok: true, title: `Forgot ${description}` } : result,
              );
            })
            .catch((err: unknown) => {
              useToastStore.getState().push({
                ok: false,
                title: "Could not forget that",
                detail: err instanceof Error ? err.message : undefined,
              });
            });
          setPending(null);
        }}
      />
    </Card>
  );
}
