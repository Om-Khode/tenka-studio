"use client";

import { motion } from "framer-motion";
import type { StackTag, TaskStep } from "@/types/demo";
import { cn } from "@/lib/utils";

/** Same vocabulary the Dashboard's RunningTaskCard uses, deliberately. */
const STACK_COLOR: Record<StackTag, string> = {
  BROWSER: "text-blue border-blue/40",
  APPS: "text-gold border-gold/40",
  VISION: "text-amber border-amber/40",
  LOCAL: "text-steel border-steel/40",
  QUEUED: "text-steel border-steel/40",
};

export function CommandProgress({
  steps,
  currentStepIndex,
}: {
  steps: TaskStep[];
  currentStepIndex: number;
}) {
  return (
    <ol data-testid="command-progress" className="mt-3 flex flex-col gap-1.5 text-left">
      {steps.map((step, i) => {
        const reached = i <= currentStepIndex;
        const isCurrent = i === currentStepIndex;
        const color = !reached
          ? "text-bone-ghost"
          : step.status === "failed"
            ? "text-fail"
            : "text-moss";
        const mark = !reached ? "○" : step.status === "failed" ? "✕" : "✓";

        return (
          <li key={step.id} className="flex items-center justify-between gap-2 text-xs">
            <span className={cn("flex min-w-0 items-center gap-2", reached ? "text-bone" : "text-bone-ghost")}>
              {isCurrent ? (
                <motion.span
                  className={cn("font-mono", color)}
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  {mark}
                </motion.span>
              ) : (
                <span className={cn("font-mono", color)}>{mark}</span>
              )}
              <span className="truncate">{step.label}</span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
                STACK_COLOR[step.stack],
              )}
            >
              {step.stack}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
