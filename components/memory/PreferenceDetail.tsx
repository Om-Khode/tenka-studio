"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useMemoryStore } from "@/store/memory-store";
import { useToastStore } from "@/store/toast-store";
import { formatDate } from "@/lib/format";

export function PreferenceDetail({ preferenceKey }: { preferenceKey: string }) {
  const preferences = useMemoryStore((s) => s.preferences);
  const forget = useMemoryStore((s) => s.forgetPreference);
  const [confirming, setConfirming] = useState(false);

  const preference = preferences.find((p) => p.key === preferenceKey);
  if (!preference) return null;

  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-4">
      <header className="flex flex-col gap-1">
        <h2 className="font-mono text-xs text-bone-subtle">{preference.key}</h2>
        <p className="font-display text-lg text-bone">{preference.value}</p>
        <p className="font-mono text-[10px] text-bone-ghost">
          learned {formatDate(preference.updatedAt)}
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wide text-bone-subtle">
          before this
        </h3>
        {preference.history.length === 0 ? (
          <p className="text-xs text-bone-ghost">Never changed since she learned it.</p>
        ) : (
          <ul className="flex flex-col">
            {[...preference.history]
              .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
              .map((entry) => (
                <li
                  key={entry.changedAt}
                  className="flex items-baseline justify-between border-b border-border py-1.5 text-xs last:border-b-0"
                >
                  <span className="text-bone-dim line-through">{entry.value}</span>
                  <span className="font-mono text-[10px] text-bone-ghost">
                    until {formatDate(entry.changedAt)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-bone-ghost">
        Preferences are learned, not written. Tell her directly to change one.
      </p>

      <Button
        variant="secondary"
        size="sm"
        className="self-start border-fail/40 text-fail hover:border-fail"
        onClick={() => setConfirming(true)}
      >
        forget this
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive
        title={`Forget ${preference.key}?`}
        body="She drops the preference and its history. She may learn it again."
        confirmLabel="forget it"
        onConfirm={() => {
          forget(preference.key);
          useToastStore.getState().push({ ok: true, title: `Forgot ${preference.key}` });
        }}
      />
    </div>
  );
}
