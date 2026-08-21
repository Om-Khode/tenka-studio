"use client";

import { useEffect, useRef } from "react";
import { useDemoStore } from "@/store/demo-engine";
import { useFileStore } from "@/store/file-store";
import { SCREENSHOT_COMMAND_ID, SCREENSHOT_SVG_SIZE } from "@/store/command-catalogue";
import { SCREENSHOT_SVG } from "@/store/file-scripts";

/** Fast enough to feel responsive, slow enough that the steps are readable. */
export const COMMAND_STEP_MS = 900;

/** Where a capture lands, so clicking through to Files finds it. */
const SCREENSHOT_DIR = "desktop";

const SCREENSHOT_ID_PREFIX = `${SCREENSHOT_DIR}/screenshot-`;

function writeScreenshot() {
  const store = useFileStore.getState();
  // Counted from overlay.created's ids, not entriesByDir's names: a rename
  // only ever touches overlay.renames (the id stays put), and a delete only
  // ever adds to overlay.deleted (the created entry is never forgotten) --
  // so a count keyed on name or on the currently-visible listing can both
  // undercount and mint an id a previous capture already holds.
  const existing = store.overlay.created.filter((n) =>
    n.id.startsWith(SCREENSHOT_ID_PREFIX),
  ).length;
  const name = `screenshot-${existing + 1}.svg`;

  store.addFile({
    id: `${SCREENSHOT_DIR}/${name}`,
    name,
    kind: "file",
    sizeBytes: SCREENSHOT_SVG_SIZE,
    modifiedAt: Date.now(),
    contentKind: "image",
    content: SCREENSHOT_SVG,
  });
}

/**
 * Drives whichever command the user fired, on every /demo route.
 *
 * Mounted in app/demo/layout.tsx rather than the Commands page: useDemoClock
 * lives on /demo only, so a command fired on /demo/commands would otherwise
 * freeze the moment the user navigated away -- and since the grid's disabled
 * state derives from userTask !== null, it would freeze locked.
 *
 * Pairs with the yield in useDemoClock: that clock skips its advance while
 * userTask is set, so the two never step the same task on the Dashboard.
 *
 * Chains its own setTimeout from inside the previous tick's callback (the
 * same shape as useDemoClock) instead of scheduling one timeout per render
 * and relying on the [userTask, currentStepIndex] dependency array to queue
 * the next one. Re-scheduling through React's effect cycle needs a render
 * plus a passive-effect flush between ticks, which a single burst of
 * advanceStep calls does not reliably provide. Chaining inside the callback
 * re-reads state via getState() on every tick, so it never runs on a stale
 * closure and never depends on React getting a chance to re-render mid-burst.
 */
export function useCommandRun() {
  const userTask = useDemoStore((s) => s.userTask);

  // Survives the slot being cleared, so the completion handler still knows
  // which command it is retiring even after advanceStep() has run.
  const runningIdRef = useRef<string | null>(null);
  if (userTask) runningIdRef.current = userTask.id.split("-run-")[0];

  useEffect(() => {
    if (!userTask) return;
    const task = userTask; // narrowing survives into tick(), unlike userTask itself

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      timeoutId = setTimeout(() => {
        if (cancelled) return;

        const wasScreenshot = runningIdRef.current === SCREENSHOT_COMMAND_ID;
        const wasLastStep =
          useDemoStore.getState().currentStepIndex >= task.steps.length - 1;

        useDemoStore.getState().advanceStep();

        // Only on a natural completion. An abort clears the slot without ever
        // reaching the last step, and a capture that never finished should
        // not leave a file behind.
        if (wasScreenshot && wasLastStep) writeScreenshot();

        if (useDemoStore.getState().userTask) {
          tick();
        }
      }, COMMAND_STEP_MS);
    }

    tick();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // Assumes userTask's object reference is stable for a whole run. If the store
    // ever replaced it per step, this effect would re-fire and tear down the
    // in-flight chain -- a phase reset, not a double-step, but risking a silently
    // reset step timer and a stale closure-captured task.steps.length.
  }, [userTask]);
}
