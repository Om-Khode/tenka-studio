import { useEffect } from "react";
import { useDemoStore } from "@/store/demo-engine";

const MIN_DELAY_MS = 1500;
const MAX_DELAY_MS = 3000;

function randomDelay() {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

export function useDemoClock() {
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function schedule() {
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        // The scripted loop yields to a command the user actually fired.
        // Without this both this clock and useCommandRun would advance the
        // same task on the Dashboard, double-stepping it.
        if (!useDemoStore.getState().userTask) {
          useDemoStore.getState().advanceStep();
        }
        useDemoStore.getState().jitterStats();
        schedule();
      }, randomDelay());
    }

    schedule();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);
}
