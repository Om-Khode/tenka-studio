"use client";

import { useEffect, useRef, useState } from "react";
import { CommandCard } from "./CommandCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { COMMANDS, toDemoTask } from "@/store/command-catalogue";
import { useDemoStore } from "@/store/demo-engine";
import { useToastStore } from "@/store/toast-store";
import type { CommandDef } from "@/types/command";

export function CommandGrid() {
  const userTask = useDemoStore((s) => s.userTask);
  const currentStepIndex = useDemoStore((s) => s.currentStepIndex);
  const taskHistory = useDemoStore((s) => s.taskHistory);
  const push = useToastStore((s) => s.push);

  const [pendingGuard, setPendingGuard] = useState<CommandDef | null>(null);

  // Which catalogue row owns the slot, so the right card shows progress.
  const runningId = userTask ? userTask.id.split("-run-")[0] : null;

  // Report a run the moment it retires. Keyed on the newest history entry
  // rather than on userTask going null, because an abort and a completion both
  // clear the slot and only history knows which one happened.
  const lastReportedRef = useRef<string | null>(null);
  // Tracks the DemoTask ids this grid itself started (not titles -- see
  // deviation note in the task report) so the Dashboard's scripted autoplay
  // loop, which also writes into taskHistory, cannot raise a toast here for a
  // run the user never fired.
  const firedRunIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const latest = taskHistory[0];
    if (!latest || lastReportedRef.current === latest.id) return;
    lastReportedRef.current = latest.id;

    // CompletedTask.id is minted as `${task.id}-${Date.now()}-${Math.random()}`
    // in demo-engine.ts, so it always carries its source task's id as a
    // prefix -- matching on that is exact, unlike matching on title, which two
    // different commands could in principle share.
    const firedId = Array.from(firedRunIdsRef.current).find((id) =>
      latest.id.startsWith(id),
    );
    if (!firedId) return;
    firedRunIdsRef.current.delete(firedId);

    push({
      ok: latest.ok,
      title: latest.title,
      detail: latest.ok ? "done" : "aborted",
    });
  }, [taskHistory, push]);

  function fire(command: CommandDef) {
    if (command.kind === "instant") {
      const direction = command.instantEffect === "volume-up" ? "up" : "down";
      const level = useDemoStore.getState().setVolume(direction);
      push({ ok: true, title: `Volume ${level}%` });
      return;
    }

    if (command.kind === "guarded") {
      setPendingGuard(command);
      return;
    }

    start(command);
  }

  function start(command: CommandDef) {
    const task = toDemoTask(command);
    const started = useDemoStore.getState().startUserTask(task);
    if (!started) return; // slot taken — the disabled cards already say so
    firedRunIdsRef.current.add(task.id);
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {COMMANDS.map((command) => (
          <CommandCard
            key={command.id}
            command={command}
            onFire={() => fire(command)}
            disabled={userTask !== null}
            running={runningId === command.id}
            currentStepIndex={currentStepIndex}
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
          if (pendingGuard) start(pendingGuard);
        }}
      />
    </>
  );
}
