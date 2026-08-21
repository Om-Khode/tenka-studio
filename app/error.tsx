"use client";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-fail">
        something broke
      </p>
      <h1 className="font-display text-2xl font-bold text-bone">
        She didn&apos;t see that coming.
      </h1>
      <p className="max-w-sm text-sm text-bone-dim">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-md border border-border px-4 py-2 font-mono text-xs text-bone hover:border-border-strong"
      >
        try again
      </button>
    </div>
  );
}
