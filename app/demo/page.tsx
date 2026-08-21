"use client";

import { useDemoClock } from "@/hooks/useDemoClock";
import { CardSkeletonGate } from "@/components/ui/CardSkeletonGate";
import { StatBar } from "@/components/dashboard/StatBar";
import { RunningTaskCard } from "@/components/dashboard/RunningTaskCard";
import { SystemMetersCard } from "@/components/dashboard/SystemMetersCard";
import { ActiveModelCard } from "@/components/dashboard/ActiveModelCard";
import { RecentCommandsFeed } from "@/components/dashboard/RecentCommandsFeed";
import { LearnedTodayCard } from "@/components/dashboard/LearnedTodayCard";
import { TraitDriftStrip } from "@/components/dashboard/TraitDriftStrip";

export default function DemoDashboardPage() {
  useDemoClock();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-bone lg:text-3xl">
          She&apos;s awake.
        </h1>
        <StatBar />
      </div>

      <CardSkeletonGate>
        <RunningTaskCard />
      </CardSkeletonGate>

      {/* One column below `lg`, where a half-width card leaves a meter or a
          model name about 160px to render in. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <CardSkeletonGate>
            <SystemMetersCard />
          </CardSkeletonGate>
          <CardSkeletonGate>
            <ActiveModelCard />
          </CardSkeletonGate>
          {/*
            "cost — with vs without routing" is not rendered here, matching
            app/app/page.tsx, where it is absent because no daemon reports
            spend. Demo could invent the numbers -- it did -- but a card whose
            figures exist in no other tree is the one card a reader cannot
            check, and the routing argument is made better by the chat script
            (store/chat-scripts.ts's "reply-cost") where it can show its
            arithmetic.

            components/dashboard/RoutingEconomicsCard.tsx and its test are kept
            intact: when the daemon reports spend, both trees can render it.
          */}
        </div>
        <div className="flex flex-col gap-4">
          <CardSkeletonGate>
            <RecentCommandsFeed />
          </CardSkeletonGate>
          <CardSkeletonGate>
            <LearnedTodayCard />
          </CardSkeletonGate>
        </div>
      </div>

      <CardSkeletonGate>
        <TraitDriftStrip />
      </CardSkeletonGate>
    </div>
  );
}
