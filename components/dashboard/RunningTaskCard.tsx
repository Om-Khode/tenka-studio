"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { useDemoStore } from "@/store/demo-engine";
import type { StackTag } from "@/types/demo";
import { cn } from "@/lib/utils";

const STACK_COLOR: Record<StackTag, string> = {
  BROWSER: "text-blue border-blue/40",
  APPS: "text-gold border-gold/40",
  VISION: "text-amber border-amber/40",
  LOCAL: "text-steel border-steel/40",
  QUEUED: "text-steel border-steel/40",
};

export function RunningTaskCard() {
  const task = useDemoStore((s) => s.getCurrentTask());
  const currentStepIndex = useDemoStore((s) => s.currentStepIndex);
  const abortCurrentTask = useDemoStore((s) => s.abortCurrentTask);

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-mono text-sm text-amber">
          ● RUNNING &quot;{task.title}&quot;
        </h2>
        <button
          onClick={abortCurrentTask}
          className="rounded-md border border-fail/40 px-3 py-1 font-mono text-xs text-fail hover:bg-fail/10"
        >
          abort
        </button>
      </div>
      <ol className="flex flex-col gap-2">
        {task.steps.map((step, i) => {
          const reached = i <= currentStepIndex;
          const isCurrent = i === currentStepIndex;
          const statusColor = !reached
            ? "text-bone-ghost"
            : step.status === "failed"
              ? "text-fail"
              : step.status === "done"
                ? "text-moss"
                : "text-bone-ghost";
          const statusMark = !reached ? "○" : step.status === "failed" ? "✕" : step.status === "done" ? "✓" : "○";
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
                reached ? "text-bone" : "text-bone-ghost"
              )}
            >
              <span className="flex items-center gap-2">
                {isCurrent ? (
                  <motion.span
                    data-testid={`status-${step.id}`}
                    data-current="true"
                    className={cn("font-mono", statusColor)}
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    {statusMark}
                  </motion.span>
                ) : (
                  <span data-testid={`status-${step.id}`} className={cn("font-mono", statusColor)}>
                    {statusMark}
                  </span>
                )}
                {step.label}
              </span>
              <span
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
                  STACK_COLOR[step.stack]
                )}
              >
                {step.stack}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
