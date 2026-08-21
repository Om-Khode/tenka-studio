import { describe, it, expect } from "vitest";
import { DemoCommandsRepo } from "./commands";
import { COMMANDS } from "@/store/command-catalogue";

describe("DemoCommandsRepo", () => {
  it("list() returns the full catalogue", async () => {
    const repo = new DemoCommandsRepo();
    const commands = await repo.list();
    expect(commands).toEqual(COMMANDS);
  });

  it("run() resolves ok for a known command id", async () => {
    const repo = new DemoCommandsRepo();
    const result = await repo.run(COMMANDS[0].id);
    expect(result.ok).toBe(true);
  });

  it("run() resolves ok:false for an id the catalogue does not have -- never throws", async () => {
    const repo = new DemoCommandsRepo();
    const result = await repo.run("not-a-real-command");
    expect(result.ok).toBe(false);
  });
});
