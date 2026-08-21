"use client";

import { Card } from "@/components/ui/card";
import { useEventStreamStore } from "@/hooks/useEventStream";

const LABEL = "running task";

/**
 * The `status` frame, rendered where the demo tree shows its scripted task
 * strip. The frames were already arriving and already in the store -- the
 * Topbar's activity line reads the same slice -- but this card was left as an
 * AwaitingEventsCard saying "waiting on the live event stream" while the
 * stream was in fact connected and talking. A pane that says it is waiting
 * for something it already has is a worse lie than an empty one.
 *
 * `phase` is the daemon's own StatusPhase string and `detail` its human line;
 * `step` is `[n, total]` only on phases that count, and `tier` names the
 * automation tier (manifest / browser / app / vision) when one applies.
 * Nothing here invents a percentage: the daemon says which step of how many,
 * or it says nothing, and a progress bar drawn from an unstepped phase would
 * be a measurement of nothing.
 */
export function LiveRunningTaskCard() {
  const activity = useEventStreamStore((s) => s.activity);
  const connection = useEventStreamStore((s) => s.connection);

  // Distinguish "connected and she is idle" from "no frame has ever arrived".
  // The first is a fact about her; the second is a fact about the socket, and
  // conflating them is how the old copy came to claim a live stream was
  // pending while it was running.
  if (!activity) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <span className="font-mono text-[10px] uppercase text-bone-subtle">{LABEL}</span>
        <p className="text-sm text-bone-ghost">
          {connection === "open"
            ? "nothing running — she is idle"
            : "not connected to her event stream"}
        </p>
      </Card>
    );
  }

  // The connect-time frame is NOT a task. The daemon sends
  // `phase="connected", detail=<active model>` as the very first frame on a
  // new socket (app.py's /v1/events handler), overloading `detail` with
  // something that is not a task description at all -- so this card rendered
  // "gemini-2.5-flash-lite" under RUNNING TASK the moment you connected, with
  // the same string already correct in the Active Model card beside it.
  //
  // Treated as "nothing running" rather than re-labelled: connected means she
  // is reachable, and it says nothing about whether she is doing anything.
  const phase = activity.phase.toUpperCase();
  const idle = phase === "IDLE" || phase === "CONNECTED";
  const detail = phase === "CONNECTED" ? "" : activity.detail;

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase text-bone-subtle">{LABEL}</span>
        <span className="font-mono text-[10px] uppercase text-bone-ghost">
          {activity.phase.toLowerCase().replace(/_/g, " ")}
          {activity.tier ? ` · ${activity.tier}` : ""}
        </span>
      </div>

      <p className={`text-sm ${idle ? "text-bone-ghost" : "text-bone"}`}>
        {detail || (idle ? "nothing running — she is idle" : "…")}
      </p>

      {activity.step && (
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="task progress"
            aria-valuenow={activity.step[0]}
            aria-valuemin={0}
            aria-valuemax={activity.step[1]}
            className="h-1 flex-1 rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-amber"
              style={{ width: `${(activity.step[0] / activity.step[1]) * 100}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-bone-subtle">
            {activity.step[0]}/{activity.step[1]}
          </span>
        </div>
      )}
    </Card>
  );
}
