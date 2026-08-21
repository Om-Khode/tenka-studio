import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase } from "@/services/http";
import { HttpFileRepo } from "./files";
import type { FileNode } from "@/types/file";

const BASE = apiBase();
const envelope = <T>(data: T) => ({
  data,
  meta: { requestId: "r1", generatedAt: "2026-08-09T00:00:00Z" },
});

describe("HttpFileRepo", () => {
  it("roots() unwraps RootsPayload.roots -- never a hardcoded list", async () => {
    server.use(
      http.get(`${BASE}/v1/files/roots`, () =>
        HttpResponse.json(envelope({ roots: ["desktop", "downloads", "documents"] })),
      ),
    );
    const repo = new HttpFileRepo();
    expect(await repo.roots()).toEqual(["desktop", "downloads", "documents"]);
  });

  it("list(path) sends the path as a query param and converts modifiedAt from ISO to epoch millis", async () => {
    let seenUrl = "";
    server.use(
      http.get(`${BASE}/v1/files`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json(
          envelope({
            path: "desktop",
            entries: [
              {
                id: "desktop/notes.md",
                name: "notes.md",
                kind: "file",
                sizeBytes: 42,
                modifiedAt: "2026-08-09T12:00:00Z",
                contentKind: "text",
              },
            ],
          }),
        );
      }),
    );

    const repo = new HttpFileRepo();
    const [node] = await repo.list("desktop");

    expect(seenUrl).toContain("path=desktop");
    expect(node.modifiedAt).toBe(new Date("2026-08-09T12:00:00Z").getTime());
    expect(typeof node.modifiedAt).toBe("number");
  });

  it("list(path) passes a directory's null contentKind through rather than defaulting it to a real kind", async () => {
    server.use(
      http.get(`${BASE}/v1/files`, () =>
        HttpResponse.json(
          envelope({
            path: "desktop",
            entries: [
              {
                id: "desktop/captures",
                name: "captures",
                kind: "dir",
                sizeBytes: 0,
                modifiedAt: "2026-08-09T00:00:00Z",
                contentKind: null,
              },
            ],
          }),
        ),
      ),
    );

    const repo = new HttpFileRepo();
    const [node] = await repo.list("desktop");
    expect(node.contentKind).toBeNull();
    expect(node.kind).toBe("dir");
  });

  it("list(path) rejects rather than resolving an empty listing when the daemon errors", async () => {
    server.use(http.get(`${BASE}/v1/files`, () => HttpResponse.json({ error: "not found" }, { status: 404 })));
    const repo = new HttpFileRepo();
    await expect(repo.list("gone")).rejects.toMatchObject({ status: 404 });
  });

  it("read(node) merges content, language and truncated onto the node, keeping its list()-sourced metadata", async () => {
    server.use(
      http.get(`${BASE}/v1/files/content`, () =>
        HttpResponse.json(
          envelope({
            id: "desktop/notes.md",
            contentKind: "text",
            content: "line one",
            language: "",
            truncated: false,
          }),
        ),
      ),
    );

    const repo = new HttpFileRepo();
    const listed: FileNode = {
      id: "desktop/notes.md",
      name: "notes.md",
      kind: "file",
      sizeBytes: 42,
      modifiedAt: 12345,
      contentKind: "text",
    };
    const read = await repo.read(listed);

    expect(read.content).toBe("line one");
    expect(read.truncated).toBe(false);
    // Metadata came from the listing, not the content route -- never overwritten.
    expect(read.name).toBe("notes.md");
    expect(read.sizeBytes).toBe(42);
    expect(read.modifiedAt).toBe(12345);
  });

  it("read(node) surfaces truncated: true so a preview can say the body was cut short", async () => {
    server.use(
      http.get(`${BASE}/v1/files/content`, () =>
        HttpResponse.json(
          envelope({
            id: "downloads/big.log",
            contentKind: "text",
            content: "only the first slice",
            language: "",
            truncated: true,
          }),
        ),
      ),
    );

    const repo = new HttpFileRepo();
    const node: FileNode = {
      id: "downloads/big.log",
      name: "big.log",
      kind: "file",
      sizeBytes: 999_999,
      modifiedAt: 0,
    };
    const read = await repo.read(node);
    expect(read.truncated).toBe(true);
  });

  it("rename() returns the node at its new id, per the response entry -- not the id it was called with", async () => {
    let sentBody: unknown;
    server.use(
      http.post(`${BASE}/v1/files/rename`, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(
          envelope({
            id: "desktop/todo.md",
            name: "todo.md",
            kind: "file",
            sizeBytes: 42,
            modifiedAt: "2026-08-09T00:00:00Z",
            contentKind: "text",
          }),
        );
      }),
    );

    const repo = new HttpFileRepo();
    const renamed = await repo.rename("desktop/notes.md", "todo.md");

    expect(sentBody).toEqual({ path: "desktop/notes.md", newName: "todo.md" });
    expect(renamed.id).toBe("desktop/todo.md");
    expect(renamed.name).toBe("todo.md");
  });

  it("remove() resolves on success and rejects on a 404 without claiming whether the file was already gone", async () => {
    server.use(
      http.delete(`${BASE}/v1/files`, () => HttpResponse.json(envelope({ deleted: "desktop/notes.md" }))),
    );
    const repo = new HttpFileRepo();
    await expect(repo.remove("desktop/notes.md")).resolves.toBeUndefined();

    server.use(http.delete(`${BASE}/v1/files`, () => HttpResponse.json({ error: "not found" }, { status: 404 })));
    await expect(repo.remove("desktop/ghost.md")).rejects.toMatchObject({ status: 404 });
  });
});
