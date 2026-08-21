"use client";

import { Card } from "@/components/ui/card";
import { useDemoStore } from "@/store/demo-engine";

export function LearnedTodayCard() {
  const learnedFacts = useDemoStore((s) => s.learnedFacts);

  return (
    <Card className="flex flex-col gap-2 p-4">
      <span className="font-mono text-[11px] uppercase text-bone-subtle">
        what she learned today
      </span>
      {learnedFacts.length === 0 ? (
        <p className="py-6 text-center text-xs text-bone-ghost">nothing yet</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {learnedFacts.map((f) => (
            <li key={f.id} className="flex gap-2 text-sm text-bone-dim">
              <span className="text-amber">•</span>
              {f.text}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
