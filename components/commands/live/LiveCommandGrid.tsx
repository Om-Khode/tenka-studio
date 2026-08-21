"use client";

import { useEffect, useState } from "react";
import { CommandCard } from "../CommandCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { getRepos } from "@/services/repo-registry";
import { useToastStore } from "@/store/toast-store";
import type { CommandDef } from "@/types/command";
import type { LoadStatus } from "@/types/action";

/**
 * The live counterpart to components/commands/CommandGrid.tsx. That grid
 * drives store/demo-engine.ts's single scripted task slot -- working, tested
 * behaviour with no live equivalent (`HttpCommandRepo.run()` answers once
 * with the finished result, not a step-by-step trace to animate). This is a
 * separate component rather than a mode branch inside CommandGrid so
 * neither file needs to import the other mode's machinery: CommandGrid
 * keeps importing demo-engine unconditionally (fine -- it only ever mounts
 * under /demo), and this one never does.
 *
 * `CommandsRepo.list()` returns the daemon's OWN four commands, merged with
 * this codebase's presentation catalogue at the repository edge
 * (services/repos/http/commands.ts) -- never a hardcoded list here. A
 * command's `.steps` (demo-only, from store/command-catalogue.ts's
 * presentation borrow) is stripped before render: there is nothing to
 * animate them against, and showing the first step highlighted for the
 * whole duration of a real run would be closer to a lie than an honest
 * "running" state.
 */
export function LiveCommandGrid() {
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [commands, setCommands] = useState<CommandDef[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [pendingGuard, setPendingGuard] = useState<CommandDef | null>(null);
  // Kept, not swallowed: this loader owns its failure in local state, so it can
  // hand the thrown value to LoadFailure and have a 403 the session probe did
  // not predict still read as a refusal rather than as an unreachable daemon.
  const [error, setError] = useState<unknown>(null);
  const push = useToastStore((s) => s.push);

  async function load() {
    setStatus("loading");
    setError(null);
    try {
      const list = await getRepos().commands.list();
      setCommands(list);
      setStatus("ready");
    } catch (err) {
      setError(err);
      setStatus("error");
    }
  }

  useEffect(() => {
    void load();
    // Fires once per mount; the catalogue does not change mid-session.
  }, []);

  async function run(command: CommandDef) {
    setRunningId(command.id);
    try {
      // Never throws (CommandsRepo.run's own contract) -- a refused or
      // unreachable run still resolves an ActionResult, so this has nothing
      // to catch.
      const result = await getRepos().commands.run(command.id);
      push(result);
    } finally {
      setRunningId(null);
    }
  }

  function fire(command: CommandDef) {
    // The daemon's own `destructive` flag decides, not Studio's `kind`.
    // HttpCommandRepo already derives `kind` from it, so the two agree here by
    // construction -- reading the wire field directly is what makes that
    // impossible to quietly undo from the presentation catalogue's side, which
    // is where the gate used to live. `?? kind === "guarded"` covers only a row
    // with no wire flag at all, which this grid never renders.
    if (command.destructive ?? command.kind === "guarded") {
      setPendingGuard(command);
      return;
    }
    void run(command);
  }

  if (status === "loading" || status === "idle") {
    return (
      <div aria-label="Loading commands" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (status === "error") {
    // `observe` -- GET /v1/commands is gated on it. Running a command is gated
    // on the command's OWN declared grant instead, which is why this names the
    // listing's capability and not a run's.
    return (
      <LoadFailure
        capability="observe"
        unreachable="She could not reach her command list."
        onRetry={() => void load()}
        error={error}
        className="py-16"
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {commands.map((command) => (
          <CommandCard
            key={command.id}
            command={{ ...command, steps: undefined }}
            onFire={() => fire(command)}
            disabled={runningId !== null}
            running={runningId === command.id}
          />
        ))}
      </div>

      <ConfirmDialog
        open={pendingGuard !== null}
        onOpenChange={(open) => {
          if (!open) setPendingGuard(null);
        }}
        title={pendingGuard?.confirm?.title ?? ""}
        body={pendingGuard?.confirm?.body ?? ""}
        confirmLabel={pendingGuard?.confirm?.confirmLabel ?? "confirm"}
        destructive
        onConfirm={() => {
          if (pendingGuard) void run(pendingGuard);
        }}
      />
    </>
  );
}
