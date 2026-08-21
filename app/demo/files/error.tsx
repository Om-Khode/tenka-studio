"use client";

export default function FilesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-fail">files broke</p>
      <h2 className="font-display text-xl font-bold text-bone">
        She lost the folder.
      </h2>
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
