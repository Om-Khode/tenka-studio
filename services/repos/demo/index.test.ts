import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { demoRepoBundle } from "./index";

describe("demoRepoBundle", () => {
  it("satisfies the full RepoBundle contract", () => {
    expect(typeof demoRepoBundle.memory.load).toBe("function");
    expect(typeof demoRepoBundle.settings.load).toBe("function");
    expect(typeof demoRepoBundle.settings.save).toBe("function");
    expect(typeof demoRepoBundle.personality.load).toBe("function");
    expect(typeof demoRepoBundle.files.list).toBe("function");
    expect(typeof demoRepoBundle.commands.list).toBe("function");
    expect(typeof demoRepoBundle.commands.run).toBe("function");
    expect(typeof demoRepoBundle.chat.sendMessage).toBe("function");
    expect(typeof demoRepoBundle.system.getBackupStatus).toBe("function");
  });
});

/**
 * "/demo/* never touches the network" (this milestone's plan, global
 * constraints) -- enforced by scanning source text rather than trusting the
 * import graph, because services/http.ts does not exist in this worktree yet
 * (a sibling task owns it) and a type-level check would tell us nothing
 * until it lands. A plain string scan catches the mistake regardless of
 * whether the offending call is an import, a bare fetch(), or a
 * dynamically-constructed URL.
 */
describe("services/repos/demo never touches the network", () => {
  const dir = import.meta.dirname;
  const sourceFiles = readdirSync(dir).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  );

  it("found at least the seven domain files plus the barrel, so this scan is not vacuous", () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(8);
  });

  const FORBIDDEN = [
    /from\s+["']@\/services\/http["']/,
    /from\s+["']@\/services\/token["']/,
    /\bfetch\s*\(/,
    /\bWebSocket\b/,
    /\bXMLHttpRequest\b/,
  ];

  for (const name of sourceFiles) {
    it(`${name} has no network primitive or HTTP-client import`, () => {
      const source = readFileSync(join(dir, name), "utf8");
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});
