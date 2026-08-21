"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/Switch";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { BackupRestoreDialog } from "./BackupRestoreDialog";
import { BackupUnlockDialog } from "./BackupUnlockDialog";
import { useSystemStore } from "@/store/system-store";
import { useToastStore } from "@/store/toast-store";
import { getRepoMode } from "@/services/repo-registry";
// Task 12: this panel's own `mb()` is gone, folded into lib/format.ts's
// formatBytes. That is a decision, not a dedup -- `mb()` pinned the unit, so a
// 2 GB backup read "2048.0 MB" and a never-run one "0.0 MB". A backup only
// grows, which is exactly the case a unit ladder exists for; and "—" is what
// this codebase already renders for a quantity that does not exist (see
// EnrollmentPanel's countLabel, LiveSystemMetersCard's battery), which a
// backup that has never run is. The demo's 41 MB figure is byte-identical
// either way.
import { formatBytes, formatDate } from "@/lib/format";

export function BackupPanel() {
  // Milestone-4 blocker 1: system-store had no LoadStatus before this task,
  // so this panel assumed `backup` was always present -- true while it was
  // seeded synchronously, a lie once /app has to fetch it and that fetch can
  // fail. Mirrors PersonalityPanel's own idle -> load() -> skeleton/error
  // shape.
  const status = useSystemStore((s) => s.status);
  const backup = useSystemStore((s) => s.backup);
  const setBackupEnabled = useSystemStore((s) => s.setBackupEnabled);
  const runBackup = useSystemStore((s) => s.runBackup);
  const load = useSystemStore((s) => s.load);
  const [restoring, setRestoring] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  // The store's own pending flag, not `progressPct !== null`: live's
  // POST /v1/backup/run has no partial progress on the wire, so progressPct
  // stays null for the whole run there (types/system.ts) and this button
  // would never have disabled itself. progressPct still drives the bar
  // below -- demo is the only mode that has one to draw.
  const running = useSystemStore((s) => s.backupRunning);
  // No daemon route writes `enabled` (openapi.json has only GET /v1/backup,
  // POST /v1/backup/run, POST /v1/backup/restore, and no settings key
  // carries it) -- live, this Switch flipped, told the daemon nothing, and
  // reverted on the next load(). Disabled with a reason beats a control that
  // pretends.
  // `=== "demo"` (Task 12), matching system-store's setBackupEnabled: only
  // the demo path actually honours this flip.
  const canToggle = getRepoMode() === "demo";

  useEffect(() => {
    if (status === "idle") void load();
  }, [status, load]);

  if (status === "error") {
    // GET /v1/backup is an `observe` read. system-store's load() also fetches
    // enrollment (RECALL) into the same status, but this panel only ever
    // renders the backup half, so `observe` is the honest capability to name
    // here and EnrollmentPanel names `recall` for the same shared status.
    return (
      <Card className="p-4">
        <LoadFailure
          capability="observe"
          unreachable="She could not reach her backup status."
          onRetry={() => void load()}
        />
      </Card>
    );
  }

  if (status !== "ready") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-bone-subtle">
          backup &amp; restore
        </h2>
        <span
          title={canToggle ? undefined : "She has no route to change this — set it on her machine."}
        >
          <Switch
            aria-label="cloud backup"
            checked={backup.enabled}
            disabled={!canToggle}
            onCheckedChange={setBackupEnabled}
          />
        </span>
      </div>

      <p className="text-xs text-bone-dim">
        Last backup{" "}
        {backup.lastBackupAt ? formatDate(backup.lastBackupAt) : "never"} ·{" "}
        {formatBytes(backup.sizeBytes)} · encrypted with her recovery phrase.
      </p>

      {/*
        The line above is exactly what a stale panel looked like for a week: a
        seven-day-old date beside an enabled switch, while every scheduled
        backup was silently skipped. Her encryption key is derived from the
        recovery phrase and held in memory only, so it dies on each restart --
        `enabled` says she intends to back up, `unlocked` says she can.

        `=== false`, not `!backup.unlocked`: the field is optional, and
        `undefined` means the demo repo (which has no key at all) or a daemon
        too old to report one. Neither is "paused", and warning on either would
        put a red banner on a healthy machine.
      */}
      {backup.enabled && backup.unlocked === false && (
        <div className="flex flex-col gap-2 rounded-md border border-amber/40 bg-amber/5 p-3">
          <p className="text-xs text-amber">
            Backups are paused — her key is locked. Nothing has been backed up since she last
            restarted, so the date above is from before that.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => setUnlocking(true)}
          >
            unlock…
          </Button>
        </div>
      )}

      {/* Gated on a real measurement, not on `running`: live has none to
          report, and a progressbar announcing aria-valuenow=0 for the whole
          run is worse than no progressbar at all. */}
      {backup.progressPct !== null && (
        <div
          role="progressbar"
          aria-valuenow={Math.round(backup.progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-full rounded-full bg-border"
        >
          <div
            className="h-full rounded-full bg-amber transition-[width]"
            style={{ width: `${backup.progressPct}%` }}
          />
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={running || !backup.enabled}
          onClick={async () => {
            // Milestone-4 blocker 3: runBackup() already catches internally
            // and resolves { ok: false, ... } rather than rejecting, but
            // this stays defensive -- a synchronous throw from getRepos()
            // (called before configureRepos(), a real bug rather than a
            // daemon failure) would otherwise be an unhandled rejection
            // with nothing on screen.
            try {
              const result = await runBackup();
              useToastStore.getState().push(result);
              // A refused run is almost always the locked key, and the toast
              // explains it without offering the fix. Open the dialog so the
              // user is one step from resuming rather than left to find the
              // banner above on their own.
              if (!result.ok && result.title === "Backup key is locked") {
                setUnlocking(true);
              }
            } catch (err) {
              useToastStore.getState().push({
                ok: false,
                title: "Backup failed",
                detail: err instanceof Error ? err.message : undefined,
              });
            }
          }}
        >
          {running ? "backing up…" : "back up now"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRestoring(true)}>
          restore…
        </Button>
      </div>

      <BackupRestoreDialog open={restoring} onOpenChange={setRestoring} />
      <BackupUnlockDialog open={unlocking} onOpenChange={setUnlocking} />
    </Card>
  );
}
