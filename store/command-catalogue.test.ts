import { describe, it, expect } from "vitest";
import { COMMANDS, toDemoTask, SCREENSHOT_COMMAND_ID, DAEMON_COMMAND_IDS } from "./command-catalogue";

describe("command-catalogue", () => {
  it("ships the six commands the PRD names", () => {
    expect(COMMANDS.map((c) => c.label)).toEqual([
      "Open Chrome",
      "Open VS Code",
      "Take Screenshot",
      "Lock PC",
      "Volume Up",
      "Volume Down",
    ]);
  });

  it("gives every command a unique id", () => {
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length);
  });

  it("contains no JSX so the catalogue can come over the wire in spec 5", () => {
    // A React element survives JSON.stringify just fine -- $$typeof is a
    // symbol *value*, which JSON.stringify silently drops, so `not.toThrow()`
    // alone proves nothing about JSX specifically. A round-trip equality
    // check does: dropping $$typeof (and any other symbol/function props)
    // makes the parsed copy unequal to the original, exactly when a plain
    // JSON-safe row would round-trip identically.
    expect(JSON.parse(JSON.stringify(COMMANDS))).toEqual(COMMANDS);
    for (const c of COMMANDS) {
      expect(typeof c.icon).toBe("string");
    }
  });

  it("carries the literal POST /command body on every row", () => {
    const chrome = COMMANDS.find((c) => c.id === "open-chrome");
    expect(chrome?.payload).toEqual({ type: "open_application", application: "chrome" });
  });

  it("gives every stepped and guarded command steps, and instant commands none", () => {
    for (const c of COMMANDS) {
      if (c.kind === "instant") {
        expect(c.steps).toBeUndefined();
        expect(c.instantEffect).toBeDefined();
      } else {
        expect(c.steps?.length).toBeGreaterThan(0);
      }
    }
  });

  it("guards only Lock PC, and gives it confirm copy", () => {
    const guarded = COMMANDS.filter((c) => c.kind === "guarded");
    expect(guarded.map((c) => c.id)).toEqual(["lock-pc"]);
    expect(guarded[0].confirm?.confirmLabel).toBeTruthy();
  });

  it("scripts a visible failure and recovery on Open Chrome", () => {
    const chrome = COMMANDS.find((c) => c.id === "open-chrome");
    expect(chrome?.steps?.some((s) => s.status === "failed")).toBe(true);
    // The failure must not be the last word -- it replans and succeeds.
    expect(chrome?.steps?.[chrome.steps.length - 1].status).toBe("done");
  });

  it("names the screenshot command by the exported constant", () => {
    expect(COMMANDS.some((c) => c.id === SCREENSHOT_COMMAND_ID)).toBe(true);
  });

  it("toDemoTask produces a DemoTask carrying the command's steps and title", () => {
    const def = COMMANDS.find((c) => c.id === "open-vscode")!;
    const task = toDemoTask(def);
    expect(task.title).toBe("Open VS Code");
    expect(task.steps).toEqual(def.steps);
    expect(task.costUsd).toBe(def.costUsd);
  });

  it("toDemoTask gives each run a distinct id without Date.now or Math.random", () => {
    const def = COMMANDS[0];
    const a = toDemoTask(def);
    const b = toDemoTask(def);
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith(def.id)).toBe(true);
  });

  it("maps every daemon command id onto a catalogue row that actually exists", () => {
    const catalogueIds = new Set(COMMANDS.map((c) => c.id));
    for (const catalogueId of Object.values(DAEMON_COMMAND_IDS)) {
      expect(catalogueIds.has(catalogueId)).toBe(true);
    }
  });

  it("maps exactly the daemon's four OS capabilities, sharing no spelling with the catalogue ids they resolve to", () => {
    expect(Object.keys(DAEMON_COMMAND_IDS).sort()).toEqual(
      ["lock_workstation", "screenshot", "volume_down", "volume_up"].sort(),
    );
    for (const [daemonId, catalogueId] of Object.entries(DAEMON_COMMAND_IDS)) {
      expect(daemonId).not.toBe(catalogueId);
    }
  });

  it("never maps open-chrome or open-vscode -- they have no live counterpart", () => {
    expect(Object.values(DAEMON_COMMAND_IDS)).not.toContain("open-chrome");
    expect(Object.values(DAEMON_COMMAND_IDS)).not.toContain("open-vscode");
  });
});
