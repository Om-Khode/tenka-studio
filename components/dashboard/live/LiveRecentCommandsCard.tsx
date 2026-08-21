"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AwaitingEventsCard } from "./AwaitingEventsCard";
import { getRepos } from "@/services/repo-registry";
import { useLoadFailure } from "@/hooks/useCapabilityRefusal";
import { formatDate } from "@/lib/format";
import type { CommandRun } from "@/services/repos/types";
import type { LoadStatus } from "@/types/action";

const LABEL = "recent commands";
const HOW_MANY = 5;

/**
 * Past command runs, reconstructed from the daemon's audit log -- the only
 * record of them that exists. There is no command-history route.
 *
 * The caption is load-bearing, not decoration. `GET /v1/audit` records HTTP
 * requests, so this is what ran *through Studio*: a command TENKA performed
 * by voice or from her own console is genuinely not here. Without the caption
 * an empty card reads as "she has done nothing", which would be false on a
 * machine she has been working on all day.
 */
export function LiveRecentCommandsCard() {
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [runs, setRuns] = useState<CommandRun[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  // GET /v1/audit requires SYSTEM_CONTROL, not `observe` -- this card sits
  // among the telemetry cards but reads the audit log, so a device that may
  // watch her work still may not see this. Naming `observe` here would be a
  // more confident lie than the "could not reach" it replaces.
  const { message } = useLoadFailure("system_control", "she could not reach her audit log", error);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    // The listing resolves ids to labels. It is allowed to fail on its own:
    // a run whose command has since disappeared still happened, and dropping
    // real history because a label lookup failed would be the worse answer.
    Promise.all([
      getRepos().commands.recentRuns(HOW_MANY),
      getRepos()
        .commands.list()
        .catch(() => []),
    ])
      .then(([recent, defs]) => {
        if (cancelled) return;
        setRuns(recent);
        setLabels(Object.fromEntries(defs.map((d) => [d.id, d.label])));
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "error") {
    return <AwaitingEventsCard label={LABEL} note={message} />;
  }

  if (status !== "ready") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="font-mono text-[10px] uppercase text-bone-subtle">{LABEL}</span>

      {runs.length === 0 ? (
        <p className="text-sm text-bone-ghost">nothing run from Studio yet</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.map((run) => (
            <li key={`${run.id}-${run.at}`} className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-bone">{labels[run.id] ?? run.id}</span>
              <span className="shrink-0 font-mono text-[10px] uppercase text-bone-subtle">
                {run.outcome} · {formatDate(run.at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="font-mono text-[10px] text-bone-ghost">
        from her audit log — commands run by voice are not recorded here
      </p>
    </Card>
  );
}
