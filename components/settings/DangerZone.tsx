"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useMemoryStore } from "@/store/memory-store";
import { useSettingsStore } from "@/store/settings-store";
import { usePersonalityStore } from "@/store/personality-store";
import { useToastStore } from "@/store/toast-store";
import { getRepoMode } from "@/services/repo-registry";

type Action = {
  id: string;
  label: string;
  blurb: string;
  title: string;
  body: string;
  run: () => void;
  disabled?: boolean;
};

export function DangerZone() {
  const forgetAll = useMemoryStore((s) => s.forgetAll);
  // Milestone-4 blocker 2: a failed load() leaves entities/preferences/
  // procedures empty, not "she knows nothing" -- forgetAll() itself already
  // refuses unless status is "ready" (memory-store.ts), but the button
  // stays clickable and confirmable without this, which reads as "nothing
  // happened" rather than telling the user why.
  const memoryStatus = useMemoryStore((s) => s.status);
  const resetAll = useSettingsStore((s) => s.resetAllToDefaults);
  // Same shape as memoryStatus above, for the same reason one layer over:
  // live, resetAllToDefaults() builds its patch out of `defs`, and a failed
  // or unfinished load leaves `defs` as the static registry -- rows with no
  // stated value, so nothing to send. The store refuses that case outright;
  // this keeps the button from being clickable and confirmable first. Demo
  // needs no load at all (its defaults come from the registry), so the gate
  // is live-only -- `=== "demo"` matching every other mode branch, so an
  // unbound registry takes the stricter path.
  const settingsStatus = useSettingsStore((s) => s.status);
  const settingsReady = getRepoMode() === "demo" || settingsStatus === "ready";
  const resetPersonality = usePersonalityStore((s) => s.reset);
  const [pending, setPending] = useState<Action | null>(null);

  const push = (title: string, detail?: string) =>
    useToastStore.getState().push({ ok: true, title, detail });

  const ACTIONS: Action[] = [
    {
      id: "memory",
      label: "forget all memory",
      blurb:
        memoryStatus === "ready"
          ? "Every entity, fact, preference, and taught procedure."
          : "Her memory hasn't finished loading yet.",
      title: "Forget everything she knows?",
      body: "She keeps her settings and her personality. Everything she learned about you goes.",
      disabled: memoryStatus !== "ready",
      run: () => {
        // Milestone-4 blocker 3, applied here too: forgetAll() already
        // catches internally and resolves rather than rejects (including
        // the system_control 403 -> "this device may not do that" case --
        // memory-store.ts), so this only routes that outcome to a toast.
        forgetAll()
          .then((result) => useToastStore.getState().push(result))
          .catch((err: unknown) => {
            useToastStore.getState().push({
              ok: false,
              title: "Could not forget everything",
              detail: err instanceof Error ? err.message : undefined,
            });
          });
      },
    },
    {
      id: "personality",
      label: "reset personality",
      blurb: "Back to the warm honest base. Other settings are untouched.",
      title: "Reset her personality?",
      body: "The base goes back to warm honest. Nothing else changes.",
      run: () => {
        // reset() talks to PersonalityRepo now, not the settings overrides
        // -- it can genuinely reject over the network, so this catches
        // rather than leaving an unhandled rejection the way a synchronous
        // resetKey() call never could.
        resetPersonality()
          .then(() => push("Personality reset"))
          .catch((err: unknown) => {
            useToastStore.getState().push({
              ok: false,
              title: "Could not reset personality",
              detail: err instanceof Error ? err.message : undefined,
            });
          });
      },
    },
    {
      id: "settings",
      label: "reset all settings",
      blurb: settingsReady
        ? "Every one of her runtime settings returns to its default."
        : "Her settings haven't finished loading yet.",
      title: "Reset every setting?",
      body: "Every value she is running goes back to its default. What she remembers is untouched.",
      disabled: !settingsReady,
      run: () => {
        // The toast is the store's own ActionResult now, not a hardcoded
        // success. Live, this is a real PATCH that can be refused per key or
        // outright (403 without system_control), and the version of this
        // that pushed "Every value is back to its default." unconditionally
        // said so after a call that had written nothing at all.
        resetAll()
          .then((result) => useToastStore.getState().push(result))
          .catch((err: unknown) => {
            useToastStore.getState().push({
              ok: false,
              title: "Could not reset her settings",
              detail: err instanceof Error ? err.message : undefined,
            });
          });
      },
    },
  ];

  return (
    <Card className="flex flex-col gap-3 border-fail/30 p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-widest text-fail">danger zone</h2>

      {ACTIONS.map((action) => (
        <div
          key={action.id}
          /*
            Stacks below `sm`. The button's label is the action's label, so in
            a row at 390px the two halves say the same words twice, side by
            side, and neither has room: "forget all\nmemory" wrapping mid-phrase
            beside a button reading "FORGET ALL MEMORY". Stacked, the label and
            its blurb read as one sentence with the control under it.
          */
          className="flex flex-col items-start gap-2 border-b border-border py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <span className="flex min-w-0 flex-col">
            <span className="font-mono text-xs text-bone">{action.label}</span>
            <span className="text-xs text-bone-dim">{action.blurb}</span>
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="w-full shrink-0 border-fail/40 text-fail hover:border-fail sm:w-auto"
            disabled={action.disabled}
            onClick={() => setPending(action)}
          >
            {action.label}
          </Button>
        </div>
      ))}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        destructive
        title={pending?.title ?? ""}
        body={pending?.body ?? ""}
        confirmLabel="do it"
        onConfirm={() => {
          pending?.run();
          setPending(null);
        }}
      />
    </Card>
  );
}
