"use client";

import {
  Camera,
  Code2,
  Globe,
  Lock,
  Terminal,
  Volume1,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { CommandProgress } from "./CommandProgress";
import type { CommandDef } from "@/types/command";
import { cn } from "@/lib/utils";

/**
 * The catalogue stores icons as strings so it stays serializable for spec 5.
 * This is the one place those strings become components.
 */
export const COMMAND_ICONS: Record<string, LucideIcon> = {
  Globe,
  Code2,
  Camera,
  Lock,
  Volume2,
  Volume1,
};

export interface CommandCardProps {
  command: CommandDef;
  onFire: () => void;
  /** Another stepped command holds the slot. Ignored for instant commands. */
  disabled?: boolean;
  /** This command holds the slot. */
  running?: boolean;
  currentStepIndex?: number;
}

export function CommandCard({
  command,
  onFire,
  disabled = false,
  running = false,
  currentStepIndex = 0,
}: CommandCardProps) {
  // Instant commands never take the slot, so the slot lock must never reach
  // them -- that is the whole reason the kind exists.
  const isBlocked = command.kind !== "instant" && (disabled || running);
  const state = running ? "running" : isBlocked ? "disabled" : "idle";
  const Icon = COMMAND_ICONS[command.icon] ?? Terminal;

  return (
    <Card
      data-testid="command-card"
      data-state={state}
      data-kind={command.kind}
      hoverable={!isBlocked}
      className={cn(
        "p-0 transition-opacity",
        state === "disabled" && "opacity-40",
        state === "running" && "border-amber/50",
      )}
    >
      <button
        type="button"
        onClick={onFire}
        disabled={isBlocked}
        className="flex w-full flex-col items-start gap-3 p-5 text-left disabled:cursor-not-allowed"
      >
        <span className="flex w-full items-center gap-3">
          <Icon size={20} className={running ? "text-amber" : "text-bone-subtle"} aria-hidden />
          <span className="font-display text-sm font-bold text-bone">{command.label}</span>
          {command.kind === "guarded" && (
            <span className="ml-auto rounded-sm border border-fail/40 px-1.5 py-0.5 font-mono text-[10px] text-fail">
              guarded
            </span>
          )}
        </span>

        {/* The capability this device must hold for the run to be allowed
            (`CommandDefPayload.requiredGrant`). Present on live rows only; the
            demo catalogue has none and renders nothing here.

            It labels rather than disables on purpose: no route exposes which
            grants THIS device was issued -- openapi.json's StatusPayload
            carries assistantName/activeModel/personality/busy and nothing about
            capabilities -- so a disabled card would be Studio guessing, which
            is the failure this whole pass is about. Naming the requirement is
            what can honestly be said, and it beats the alternative the card had
            before: a fully-enabled button whose only hint that this device may
            not do that arrives afterwards, as a "Command refused" toast. */}
        {command.requiredGrant && (
          <span className="font-mono text-[10px] text-bone-ghost">
            needs {command.requiredGrant}
          </span>
        )}
      </button>

      {running && command.steps && (
        <div className="px-5 pb-5">
          <CommandProgress steps={command.steps} currentStepIndex={currentStepIndex} />
        </div>
      )}
    </Card>
  );
}
