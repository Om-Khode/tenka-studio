"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, RotateCcw } from "lucide-react";

type CopyState = "idle" | "copied" | "failed";

export function MessageActions({
  content,
  onRegenerate,
  canRegenerate,
}: {
  content: string;
  onRegenerate: () => void;
  canRegenerate: boolean;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The copy confirmation is transient; a pending reset from a previous click
  // (or one that fires after this component unmounts) must never survive to
  // set state on a gone component.
  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  async function handleCopy() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(content);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    resetTimer.current = setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide">
      <button
        onClick={handleCopy}
        aria-label="Copy message"
        className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-bone-ghost transition-colors hover:bg-card hover:text-bone"
      >
        <Copy size={12} />
        copy
      </button>
      <button
        onClick={onRegenerate}
        disabled={!canRegenerate}
        aria-label="Regenerate reply"
        className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-bone-ghost transition-colors hover:bg-card hover:text-bone disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <RotateCcw size={12} />
        regenerate
      </button>
      {copyState === "copied" && <span className="text-moss">copied</span>}
      {copyState === "failed" && <span className="text-fail">couldn&apos;t copy</span>}
    </div>
  );
}
