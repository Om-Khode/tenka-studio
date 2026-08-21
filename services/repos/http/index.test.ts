import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { liveRepoBundle } from "./index";

describe("liveRepoBundle", () => {
  it("satisfies the full RepoBundle contract", () => {
    expect(typeof liveRepoBundle.memory.load).toBe("function");
    expect(typeof liveRepoBundle.settings.load).toBe("function");
    expect(typeof liveRepoBundle.settings.save).toBe("function");
    expect(typeof liveRepoBundle.personality.load).toBe("function");
    expect(typeof liveRepoBundle.files.list).toBe("function");
    expect(typeof liveRepoBundle.commands.list).toBe("function");
    expect(typeof liveRepoBundle.commands.run).toBe("function");
    expect(typeof liveRepoBundle.chat.sendMessage).toBe("function");
    expect(typeof liveRepoBundle.system.getBackupStatus).toBe("function");
  });
});

/**
 * The mirror image of services/repos/demo/index.test.ts's network scan:
 * `/demo` must never touch the network, and symmetrically, `/app`'s bundle
 * must never import a demo module or a *-scripts.ts seed file -- doing so
 * would mean a live page renders scripted content under live chrome, the
 * exact contamination Milestone 5b Task 9 exists to prevent. A plain
 * string scan catches it regardless of whether the import is direct or
 * re-exported through a barrel.
 */
describe("services/repos/http never imports demo scripts or the demo bundle", () => {
  const dir = import.meta.dirname;
  const sourceFiles = readdirSync(dir).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  );

  it("found at least the seven domain files plus the barrel, so this scan is not vacuous", () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(8);
  });

  const FORBIDDEN = [
    /from\s+["']@\/services\/repos\/demo/,
    /-scripts["']/,
    /\bdemo-engine\b/,
  ];

  for (const name of sourceFiles) {
    it(`${name} has no import of a demo module or a *-scripts seed`, () => {
      const source = readFileSync(join(dir, name), "utf8");
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});
