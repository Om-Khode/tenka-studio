import { COMMANDS } from "@/store/command-catalogue";
import type { ActionResult } from "@/types/action";
import type { CommandDef } from "@/types/command";
import type { CommandRun, CommandsRepo } from "../types";

/**
 * Wraps store/command-catalogue.ts. Nothing calls this yet -- CommandGrid.tsx
 * and useCommandRun.ts import COMMANDS directly and drive runs through
 * store/demo-engine.ts's single task slot, which is working, tested
 * behaviour this task does not touch. This exists for RepoBundle
 * completeness and as a reference for Task 6, which also has to reconcile
 * these six catalogue ids against the daemon's four command ids before a
 * real merge is possible.
 */
export class DemoCommandsRepo implements CommandsRepo {
  async list(): Promise<CommandDef[]> {
    return COMMANDS;
  }

  async run(id: string): Promise<ActionResult> {
    const def = COMMANDS.find((c) => c.id === id);
    if (!def) return { ok: false, title: "Unknown command" };
    return { ok: true, title: `Ran ${def.label}` };
  }

  /**
   * Empty, not a scripted history. The demo tree renders its own task history
   * from demo-engine; this exists so the bundle satisfies CommandsRepo, and a
   * fabricated run list here would be seed data sitting one mode-branch away
   * from a live pane.
   */
  async recentRuns(): Promise<CommandRun[]> {
    return [];
  }
}
