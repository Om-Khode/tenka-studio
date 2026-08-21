/**
 * Renders nothing, deliberately.
 *
 * The demo counterpart (components/dashboard/StatBar.tsx) reads
 * tasksCompletedToday / spendTodayUsd / taskHistory off store/demo-engine.ts.
 * None of the three has a daemon source: `TelemetryPayload` is cpuPercent,
 * ramPercent, batteryPercent, activeModel and uptimeSeconds, and no route
 * anywhere reports spend or a daily task count.
 *
 * This used to render the three labels with an em dash each. That was honest
 * about the value and dishonest about the prospect -- three permanent blanks
 * across the top of the dashboard read as data still loading, when in fact
 * nothing is on its way. An absent strip says the same thing without the
 * implied promise.
 *
 * Kept as a component rather than deleted so the live page keeps its slot and
 * its layout, and so restoring it is one return statement once the daemon
 * reports these. Do not fill it from a client-side tally: a count Studio
 * derives from what it happened to observe is not "tasks today", it is
 * "tasks Studio saw while its tab was open".
 */
export function LiveStatBar() {
  return null;
}
