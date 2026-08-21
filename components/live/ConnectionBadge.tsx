"use client";

import { cn } from "@/lib/utils";
import { useEventStreamStore } from "@/hooks/useEventStream";
import type { ConnectionState, StatusFrame } from "@/hooks/useEventStream";

/**
 * What sits where `DEMO MODE` sits in the other tree (milestone 5b, Task 10).
 * The live badge has one more job than the demo one: a dropped daemon has to
 * be visible, because every pane under it keeps rendering the last thing it
 * knew and stale-looks-live is the failure this milestone exists to prevent.
 * The mode is still named here -- this replaces the mode badge in the live
 * tree, it does not sit beside it.
 *
 * The second span is the only renderer of `status` frames today. The
 * dashboard's task strip is the one the plan describes, and it stays an
 * AwaitingEventsCard until someone owns that card -- but a phase that reaches
 * the store and is drawn nowhere would make "she is mid-task" invisible on
 * every route except the one card that does not exist yet.
 */

/**
 * `throttled` and `not recognized` exist because "reconnecting" was covering
 * for all three: a daemon that is off, a client being rate-limited, and a
 * token she refuses read identically, and only one of those is fixed by
 * waiting. The wording is deliberately the user's problem rather than the
 * close code -- 1008/1013 name nothing to someone reading a badge.
 */
const LABELS: Record<ConnectionState, string> = {
  connecting: "connecting",
  open: "connected",
  reconnecting: "reconnecting",
  throttled: "throttled · retrying",
  unauthorized: "not recognized",
  closed: "offline",
};

const TONES: Record<ConnectionState, string> = {
  connecting: "border-amber/40 text-amber",
  open: "border-moss/40 text-moss",
  reconnecting: "border-amber/40 text-amber",
  throttled: "border-amber/40 text-amber",
  unauthorized: "border-fail/40 text-fail",
  closed: "border-fail/40 text-fail",
};

/**
 * Phases that mean "she is not doing anything", so the activity span stays
 * off rather than reading `idle` at the user forever. `connected` is the
 * connect-time frame the daemon synthesises before any real phase has fired;
 * it says the socket is up, which the badge beside it already says.
 */
const QUIET_PHASES = new Set(["IDLE", "DONE", "STOPPED", "CONNECTED"]);

function activityText(activity: StatusFrame | null): string | null {
  if (!activity) return null;
  if (QUIET_PHASES.has(activity.phase.toUpperCase())) return null;
  const step = activity.step ? ` ${activity.step[0]}/${activity.step[1]}` : "";
  const detail = activity.detail ? ` · ${activity.detail}` : "";
  return `${activity.phase.toLowerCase()}${step}${detail}`;
}

export function ConnectionBadge() {
  const connection = useEventStreamStore((s) => s.connection);
  const activity = useEventStreamStore((s) => s.activity);

  const text = activityText(activity);

  return (
    <>
      <span className={cn("rounded-md border px-3 py-1.5", TONES[connection])}>
        ● live · {LABELS[connection]}
      </span>
      {text !== null && (
        <span
          className="max-w-[24ch] truncate rounded-md border border-border px-3 py-1.5 text-bone-subtle"
          title={text}
        >
          {text}
        </span>
      )}
    </>
  );
}
