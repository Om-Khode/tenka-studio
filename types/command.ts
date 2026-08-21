import type { TaskStep } from "./demo";

/**
 * The six PRD commands are not the same kind of thing. Volume Up is instant
 * and repeatable, Open VS Code takes seconds, and Lock PC is irreversible the
 * day it stops being a mock. Kind lives on the catalogue row rather than as
 * branching inside the page, so spec 5 can map a backend command list onto the
 * same three behaviours.
 */
export type CommandKind = "stepped" | "instant" | "guarded";

export interface CommandDef {
  id: string;
  label: string;
  /** Lucide icon *name*, resolved to a component at the component layer. */
  icon: string;
  kind: CommandKind;
  /**
   * The literal POST /command body -- demo mode only. `POST
   * /v1/commands/{id}/run` takes no body at all (the id is the whole
   * request), so this is absent on any row synthesized purely from the
   * daemon's own catalogue with no demo presentation to carry one.
   */
  payload?: { type: string; [key: string]: string };

  /** stepped and guarded only. A guarded command is a stepped one behind a confirm. */
  steps?: TaskStep[];
  costUsd?: number;
  visionCalls?: number;

  /** guarded only. */
  confirm?: { title: string; body: string; confirmLabel: string };

  /**
   * instant only. Names an *effect*, not a message: the toast text is computed
   * from the resulting state ("Volume 60%") and a static string cannot carry
   * it. The page owns the formatting; the catalogue stays serializable.
   */
  instantEffect?: "volume-up" | "volume-down";

  /**
   * Mirrors the daemon's `CommandDefPayload` (Batch 2, Task 6). Present on
   * every command `HttpCommandRepo.list()` returns -- including one with no
   * catalogue row to merge presentation from -- so a command Studio has
   * never seen still carries enough to render guarded-if-destructive rather
   * than bare. Absent on the two demo-only rows (`open-chrome`,
   * `open-vscode`) that have no live counterpart and never will.
   */
  description?: string;
  destructive?: boolean;
  requiredGrant?: string;
}
