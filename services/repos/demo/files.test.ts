import { describe, it, expect } from "vitest";
import { DemoFilesRepo } from "./files";
import { seedTree, ROOTS } from "@/store/file-scripts";

describe("DemoFilesRepo", () => {
  it("roots() returns every root file-scripts.ts defines, in order", async () => {
    const repo = new DemoFilesRepo();
    expect(await repo.roots()).toEqual([...ROOTS]);
  });

  it("list(path) resolves the exact directory seedTree() produces for that path", async () => {
    const repo = new DemoFilesRepo();
    expect(await repo.list("desktop")).toEqual(seedTree().desktop);
  });

  /**
   * Rejects where it used to resolve `[]`. The live repo rejects (the daemon
   * 404s), and a demo that answers "this directory is empty" to "this directory
   * does not exist" is not a rehearsal of /app -- it is a quieter product whose
   * error branch and retry affordance only ever run against a real daemon.
   * Every directory node the seed produces has a listing key, so nothing
   * reachable by navigation takes this path.
   */
  it("list(path) rejects for a path with no listing, exactly as the live repo does", async () => {
    const repo = new DemoFilesRepo();
    await expect(repo.list("nope/nowhere")).rejects.toThrow(/no such directory/i);
  });

  /**
   * read() used to return the caller's own node on a miss, so an unreadable
   * file rendered as a successfully-loaded preview with no content -- the read
   * reported success and the pane showed emptiness as though that were the
   * file.
   */
  it("read(node) rejects for a node the seed does not have, rather than handing the caller its own node back", async () => {
    const repo = new DemoFilesRepo();
    await expect(
      repo.read({ id: "desktop/ghost.md", name: "ghost.md", kind: "file", sizeBytes: 0, modifiedAt: 0 }),
    ).rejects.toThrow(/no such path/i);
  });

  it("list(path) returns a fresh array each call", async () => {
    const repo = new DemoFilesRepo();
    const first = await repo.list("desktop");
    first.length = 0;
    const second = await repo.list("desktop");
    expect(second.length).toBeGreaterThan(0);
  });

  it("read() passes an already-inlined node through unchanged", async () => {
    const repo = new DemoFilesRepo();
    const [node] = await repo.list("desktop/captures");
    const read = await repo.read(node);
    expect(read).toEqual(node);
    expect(read.content).toBeDefined();
  });

  it("read() re-reads by id rather than trusting a stale caller-supplied copy", async () => {
    const repo = new DemoFilesRepo();
    const [node] = await repo.list("desktop/captures");
    const stale: typeof node = { ...node, name: "wrong-name.svg" };
    const read = await repo.read(stale);
    expect(read.name).toBe(node.name);
  });

  it("rename() returns a node at a new id under the same parent, carrying the new name", async () => {
    const repo = new DemoFilesRepo();
    const renamed = await repo.rename("desktop/notes.md", "todo.md");
    expect(renamed.id).toBe("desktop/todo.md");
    expect(renamed.name).toBe("todo.md");
  });

  it("rename() rejects rather than resolving for a path that does not exist", async () => {
    const repo = new DemoFilesRepo();
    await expect(repo.rename("desktop/ghost.md", "x.md")).rejects.toThrow();
  });

  it("remove() resolves for a real path", async () => {
    const repo = new DemoFilesRepo();
    await expect(repo.remove("desktop/notes.md")).resolves.toBeUndefined();
  });

  it("remove() rejects rather than resolving for a path that does not exist", async () => {
    const repo = new DemoFilesRepo();
    await expect(repo.remove("desktop/ghost.md")).rejects.toThrow();
  });
});
