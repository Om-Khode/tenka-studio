"use client";

import { Card } from "@/components/ui/card";
import { useDemoStore } from "@/store/demo-engine";

export function RecentCommandsFeed() {
  const taskHistory = useDemoStore((s) => s.taskHistory);

  return (
    <Card className="flex flex-col gap-2 p-4">
      <span className="font-mono text-[11px] uppercase text-bone-subtle">
        recent commands
      </span>
      {taskHistory.length === 0 ? (
        <p className="py-6 text-center text-xs text-bone-ghost">no commands yet</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {taskHistory.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-none"
            >
              <span className={t.ok ? "text-bone" : "text-fail"}>{t.title}</span>
              <span className="font-mono text-[10px] text-bone-ghost">{t.stack}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
