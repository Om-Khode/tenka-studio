"use client";

import { useDemoStore } from "@/store/demo-engine";

export function StatBar() {
  const tasksCompletedToday = useDemoStore((s) => s.tasksCompletedToday);
  const spendTodayUsd = useDemoStore((s) => s.spendTodayUsd);
  const taskHistory = useDemoStore((s) => s.taskHistory);

  const zeroVisionPct =
    taskHistory.length === 0
      ? 100
      : Math.round(
          (taskHistory.filter((t) => t.visionCalls === 0).length / taskHistory.length) * 100
        );

  return (
    // Wraps: three stat pairs at `gap-6` are wider than a 390px viewport, and
    // this sits beside an h1 on the dashboard header row.
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-bone-subtle lg:gap-x-6">
      <span>
        tasks today · <span className="text-bone">{tasksCompletedToday}</span>
      </span>
      <span>
        zero-vision · <span className="text-bone">{zeroVisionPct}%</span>
      </span>
      <span>
        spend today · <span className="text-bone">${spendTodayUsd.toFixed(4)}</span>
      </span>
    </div>
  );
}
