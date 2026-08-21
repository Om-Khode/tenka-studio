"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useToastStore, type Toast } from "@/store/toast-store";
import { cn } from "@/lib/utils";

export const TOAST_TIMEOUT_MS = 5000;

function ToastRow({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const [paused, setPaused] = useState(false);
  // Held in a ref so the effect below can restart a clean timer on unpause
  // without re-running for unrelated renders.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => dismissRef.current(toast.id), TOAST_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [toast.id, paused]);

  return (
    <motion.div
      layout
      data-testid="toast"
      data-ok={String(toast.ok)}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        // Not a fixed w-80: 20rem is wider than a 390px viewport once the
        // container's own gutters are taken off it.
        "pointer-events-auto flex w-[min(20rem,calc(100vw-2rem))] items-start gap-3 rounded-lg border bg-bg p-3 shadow-lg",
        toast.ok ? "border-border-strong" : "border-fail/50",
      )}
    >
      <span
        aria-hidden
        className={cn("mt-1 font-mono text-xs", toast.ok ? "text-moss" : "text-fail")}
      >
        {toast.ok ? "✓" : "✕"}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-bone">{toast.title}</p>
        {toast.detail && <p className="mt-0.5 text-xs text-bone-dim">{toast.detail}</p>}
        {toast.undo && (
          <button
            type="button"
            onClick={() => {
              toast.undo?.();
              dismiss(toast.id);
            }}
            className="mt-2 font-mono text-xs uppercase tracking-wide text-amber hover:underline"
          >
            undo
          </button>
        )}
      </div>

      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(toast.id)}
        className="text-bone-ghost transition-colors hover:text-bone"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
