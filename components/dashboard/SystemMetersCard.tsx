"use client";

import { Card } from "@/components/ui/card";
import { useDemoStore } from "@/store/demo-engine";

export function SystemMetersCard() {
  const stats = useDemoStore((s) => s.systemStats);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase text-bone-subtle">cpu</span>
        <span className="font-mono text-sm text-bone">{stats.cpuPct.toFixed(0)}%</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase text-bone-subtle">ram</span>
        <span className="font-mono text-sm text-bone">
          {stats.ramGb.toFixed(1)} / {stats.ramTotalGb} GB
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase text-bone-subtle">battery</span>
        <span className="font-mono text-sm text-moss">
          {stats.batteryPct.toFixed(0)}% {stats.batteryCharging ? "· charging" : ""}
        </span>
      </div>
    </Card>
  );
}
