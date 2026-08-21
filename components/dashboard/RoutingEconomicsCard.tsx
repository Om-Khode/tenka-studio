"use client";

import { Card } from "@/components/ui/card";
import { useDemoStore } from "@/store/demo-engine";

const VISION_ONLY_MULTIPLIER = 4.68; // matches the marketing site's cost section ratio

export function RoutingEconomicsCard() {
  const spendTodayUsd = useDemoStore((s) => s.spendTodayUsd);
  const visionOnlyUsd = spendTodayUsd * VISION_ONLY_MULTIPLIER || 0.0192;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="font-mono text-[11px] uppercase text-bone-subtle">
        cost — with vs without routing
      </span>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-bone-dim">with routing</span>
        <span data-testid="cost-with-routing" className="font-mono text-sm text-moss">
          ${spendTodayUsd.toFixed(4)}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-bone-dim">vision on everything</span>
        <span data-testid="cost-vision-only" className="font-mono text-sm text-fail">
          ${visionOnlyUsd.toFixed(4)}
        </span>
      </div>
    </Card>
  );
}
