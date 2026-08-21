"use client";

import { Button } from "@/components/ui/button";

export default function SettingsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="font-display text-lg text-bone">Settings failed to render.</p>
      <p className="max-w-sm text-sm text-bone-dim">
        Nothing was changed — this is the view failing, not her configuration.
      </p>
      <Button variant="secondary" size="sm" onClick={reset}>
        try again
      </Button>
    </div>
  );
}
