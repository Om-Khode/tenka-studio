import { Card } from "@/components/ui/card";

/**
 * Stands in for whichever Dashboard cards have no live data source at all
 * today: task execution, spend, and what she has learned all come from
 * store/demo-engine.ts's scripted task loop in the demo tree, and their live
 * equivalent is the `status` frame the event-stream task (milestone 5b, Task
 * 10) still has to wire up. Rendering nothing here would look broken; making
 * up numbers would be a lie the plan explicitly rules out elsewhere (the
 * backup ticker, RAM-as-percentage) -- this says plainly what is missing and
 * why, the same "hide it rather than fabricate" choice Commands' live volume
 * readout makes.
 *
 * `note` exists because this treatment now also covers cards whose source
 * exists but had nothing to say on this render -- a daemon that reports no
 * active model, a personality GET that failed. "Waiting on the live event
 * stream" would be a wrong explanation for those, and a card that explains
 * itself wrongly is the same class of problem as one that invents a number.
 */
const DEFAULT_NOTE = "waiting on the live event stream";

export function AwaitingEventsCard({ label, note = DEFAULT_NOTE }: { label: string; note?: string }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <span className="font-mono text-[11px] uppercase text-bone-subtle">{label}</span>
      <p className="py-4 text-center text-xs text-bone-ghost">{note}</p>
    </Card>
  );
}
