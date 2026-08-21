"use client";

import { CardSkeletonGate } from "@/components/ui/CardSkeletonGate";
import { LiveStatBar } from "@/components/dashboard/live/LiveStatBar";
import { LiveSystemMetersCard } from "@/components/dashboard/live/LiveSystemMetersCard";
import { LiveActiveModelCard } from "@/components/dashboard/live/LiveActiveModelCard";
import { LiveTraitDriftStrip } from "@/components/dashboard/live/LiveTraitDriftStrip";
import { LiveRunningTaskCard } from "@/components/dashboard/live/LiveRunningTaskCard";
import { LiveRecentCommandsCard } from "@/components/dashboard/live/LiveRecentCommandsCard";

/**
 * Not a re-export of app/demo/page.tsx (milestone 5b, Task "10b"). That page
 * mounts useDemoClock() and every card on it reads store/demo-engine.ts
 * directly -- exactly the "dashboard's meters come from demo-engine ...
 * regardless of mode" bug filed against this task.
 *
 * This page used to reuse `ActiveModelCard` and `TraitDriftStrip` unchanged,
 * defended here as live-safe because "neither ever read demo-engine.ts or a
 * `*-scripts.ts` file". That was true and it was the wrong test, so the rule
 * is written down here rather than left to be rediscovered: **the question
 * is not where a value came from, it is whether the pane presents it as a
 * reading off this machine.** `ActiveModelCard` printed the literal
 * "gemini-flash-lite · primary · free tier"; `TraitDriftStrip` printed six
 * literal trait numbers. Both are hardcoded constants that happen to sit in
 * a component file instead of a scripts file, and a user running Groq or
 * Ollama read the first as fact about their own daemon. A hardcoded constant
 * presented as a live reading does the same harm as demo data. Both now have
 * live-only counterparts wired to their real sources -- `GET /v1/telemetry`'s
 * `activeModel` and `GET /v1/personality`'s `traits`, the first of which was
 * already being fetched on this page and discarded.
 *
 * What survives that rule is a card with NO source: `LiveStatBar` and
 * `AwaitingEventsCard` say plainly that nothing has been observed yet, which
 * is itself an honest reading. The remaining blanks fill in when the
 * event-stream task (milestone 5b, Task 10) wires the `status` frame's task
 * strip through -- see AwaitingEventsCard's own doc.
 */
export default function LiveDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-bone lg:text-3xl">
          She&apos;s awake.
        </h1>
        <LiveStatBar />
      </div>

      <CardSkeletonGate>
        <LiveRunningTaskCard />
      </CardSkeletonGate>

      {/* One column below `lg`, matching app/demo/page.tsx. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <CardSkeletonGate>
            <LiveSystemMetersCard />
          </CardSkeletonGate>
          <CardSkeletonGate>
            <LiveActiveModelCard />
          </CardSkeletonGate>
        </div>
        <div className="flex flex-col gap-4">
          <CardSkeletonGate>
            <LiveRecentCommandsCard />
          </CardSkeletonGate>
          {/*
            "cost — with vs without routing" and "what she learned today" are
            deliberately absent, not pending.

            Neither has a daemon source. TelemetryPayload is cpuPercent,
            ramPercent, batteryPercent, activeModel, uptimeSeconds -- nothing
            anywhere tracks spend, and no route reports what was learned in a
            given day. Both were rendering "waiting on the live event stream"
            against a stream that was connected and talking, so the message
            was not merely unhelpful, it was false: nothing was coming.

            An absent card is honest. Restore them when the daemon actually
            reports spend and daily learning, not before -- and see
            LiveStatBar for the same ruling on tasks/zero-vision/spend today.
          */}
        </div>
      </div>

      <CardSkeletonGate>
        <LiveTraitDriftStrip />
      </CardSkeletonGate>
    </div>
  );
}
