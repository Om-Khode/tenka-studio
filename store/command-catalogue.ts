import type { DemoTask } from "@/types/demo";
import type { CommandDef } from "@/types/command";

export const SCREENSHOT_COMMAND_ID = "take-screenshot";

/**
 * Maps the daemon's OS-capability command ids (snake_case, `CommandDefPayload
 * .commandId`) onto this catalogue's own ids, so `HttpCommandRepo` (Batch 2,
 * Task 6) can find the demo's presentation -- icon, kind, steps, confirm
 * copy -- for the same capability. The two spellings share no characters by
 * design (`take-screenshot` vs `screenshot`, `lock-pc` vs `lock_workstation`),
 * so a merge keyed on equal ids finds nothing without this table.
 *
 * `open-chrome` and `open-vscode` are deliberately absent -- the daemon's own
 * `LiveCommandRuntime` docstring says opening an application is a chat turn,
 * not a command, and it will never grow the other two. The live Commands
 * page has four rows, not six.
 */
export const DAEMON_COMMAND_IDS: Record<string, string> = {
  lock_workstation: "lock-pc",
  volume_up: "volume-up",
  volume_down: "volume-down",
  screenshot: SCREENSHOT_COMMAND_ID,
};

/** Byte size reported for a captured screenshot, so the listing shows something honest. */
export const SCREENSHOT_SVG_SIZE = 640;

// Module-scoped counter rather than Date.now()/Math.random(): run ids must be
// distinct but reproducible in tests, and nothing here is persisted.
let runCounter = 0;

export const COMMANDS: CommandDef[] = [
  {
    id: "open-chrome",
    label: "Open Chrome",
    icon: "Globe",
    kind: "stepped",
    payload: { type: "open_application", application: "chrome" },
    costUsd: 0.0009,
    visionCalls: 0,
    steps: [
      { id: "s1", label: "resolve intent → app_action", stack: "LOCAL", status: "done" },
      { id: "s2", label: "chrome running under another profile", stack: "APPS", status: "failed" },
      { id: "s3", label: "replanned → new window, default profile", stack: "APPS", status: "done" },
    ],
  },
  {
    id: "open-vscode",
    label: "Open VS Code",
    icon: "Code2",
    kind: "stepped",
    payload: { type: "open_application", application: "vscode" },
    costUsd: 0.0011,
    visionCalls: 0,
    steps: [
      { id: "s1", label: "resolve intent → app_action", stack: "LOCAL", status: "done" },
      { id: "s2", label: "launch vscode → last workspace", stack: "APPS", status: "done" },
    ],
  },
  {
    id: SCREENSHOT_COMMAND_ID,
    label: "Take Screenshot",
    icon: "Camera",
    kind: "stepped",
    payload: { type: "take_screenshot" },
    costUsd: 0.0005,
    visionCalls: 1,
    steps: [
      { id: "s1", label: "resolve intent → capture", stack: "LOCAL", status: "done" },
      { id: "s2", label: "capture primary display", stack: "VISION", status: "done" },
      { id: "s3", label: "write to desktop", stack: "LOCAL", status: "done" },
    ],
  },
  {
    id: "lock-pc",
    label: "Lock PC",
    icon: "Lock",
    kind: "guarded",
    payload: { type: "lock_workstation" },
    costUsd: 0.0002,
    visionCalls: 0,
    confirm: {
      title: "Lock this PC?",
      body: "She locks the screen immediately. Anything unsaved stays open behind the lock, but you will need your password to get back in.",
      confirmLabel: "lock it",
    },
    steps: [
      { id: "s1", label: "resolve intent → session control", stack: "LOCAL", status: "done" },
      { id: "s2", label: "lock workstation", stack: "LOCAL", status: "done" },
    ],
  },
  {
    id: "volume-up",
    label: "Volume Up",
    icon: "Volume2",
    kind: "instant",
    payload: { type: "set_volume", direction: "up" },
    instantEffect: "volume-up",
  },
  {
    id: "volume-down",
    label: "Volume Down",
    icon: "Volume1",
    kind: "instant",
    payload: { type: "set_volume", direction: "down" },
    instantEffect: "volume-down",
  },
];

/**
 * Adapts a catalogue row into the shape the demo engine's single slot holds.
 * Only stepped and guarded commands become tasks; instant ones never occupy
 * the slot, which is the entire reason that kind exists.
 */
export function toDemoTask(def: CommandDef): DemoTask {
  return {
    id: `${def.id}-run-${runCounter++}`,
    title: def.label,
    steps: def.steps ?? [],
    costUsd: def.costUsd ?? 0,
    visionCalls: def.visionCalls ?? 0,
  };
}
