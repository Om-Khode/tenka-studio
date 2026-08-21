"use client";

/**
 * The block a surface renders when its load failed.
 *
 * One component rather than nine hand-written blocks, because the fault was
 * never the wording alone -- it was that the wording and the retry button were
 * decided separately at every call site, so a surface could (and did) tell a
 * user their device lacked permission and then offer them a button that could
 * only fail again. Here the two come from the same `useLoadFailure` call and
 * cannot disagree: `onRetry` is honoured only when retrying could actually
 * work.
 *
 * Never hides the surface. Capabilities are the intersection of what a device
 * was granted and what its listener carries, so the same phone sees different
 * ones from loopback and from a tunnel -- a panel that vanished on one of them
 * would read as Studio breaking, not as a boundary. It explains instead.
 */
import { Button } from "@/components/ui/button";
import { useLoadFailure } from "@/hooks/useCapabilityRefusal";
import { cn } from "@/lib/utils";
import type { Capability } from "@/types/session";

export interface LoadFailureProps {
  /** What the failed request needed. See useLoadFailure's own doc for the map. */
  capability: Capability;
  /** What to say when the daemon genuinely did not answer. */
  unreachable: string;
  /** Omitted where the surface has nothing to re-run. Ignored on a refusal. */
  onRetry?: () => void;
  /** The thrown value, where the caller kept it. */
  error?: unknown;
  className?: string;
}

export function LoadFailure({
  capability,
  unreachable,
  onRetry,
  error,
  className,
}: LoadFailureProps) {
  const { refused, message } = useLoadFailure(capability, unreachable, error);

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 text-center", className)}>
      <p className="text-sm text-bone-dim">{message}</p>
      {!refused && onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          try again
        </Button>
      )}
    </div>
  );
}
