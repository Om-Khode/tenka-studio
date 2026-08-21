import { describe, it, expect } from "vitest";
import { seedTree, ROOTS, DOWNLOADS_BULK_COUNT } from "./file-scripts";

describe("file-scripts", () => {
  it("seeds exactly the three PRD roots", () => {
    const tree = seedTree();
    for (const root of ROOTS) {
      expect(tree[root]).toBeDefined();
    }
  });

  it("is deterministic — two seeds are byte-identical", () => {
    expect(JSON.stringify(seedTree())).toBe(JSON.stringify(seedTree()));
  });

  it("uses no wall-clock or randomness (same ids across seeds)", () => {
    const a = seedTree().desktop.map((n) => n.id);
    const b = seedTree().desktop.map((n) => n.id);
    expect(a).toEqual(b);
  });

  it("ids are paths, so the breadcrumb can be derived by splitting", () => {
    const tree = seedTree();
    for (const node of tree.desktop) {
      expect(node.id.startsWith("desktop/")).toBe(true);
      expect(node.id.split("/")).toHaveLength(2);
    }
  });

  it("gives Downloads a bulk folder big enough to exercise the virtualizer", () => {
    expect(seedTree().downloads.length).toBeGreaterThanOrEqual(DOWNLOADS_BULK_COUNT);
  });

  it("keeps Desktop and Documents small and readable", () => {
    const tree = seedTree();
    expect(tree.desktop.length).toBeLessThan(12);
    expect(tree.documents.length).toBeLessThan(12);
  });

  it("gives every root at least one subdirectory so the breadcrumb has somewhere to go", () => {
    const tree = seedTree();
    for (const root of ROOTS) {
      expect(tree[root].some((n) => n.kind === "dir")).toBe(true);
    }
  });

  it("registers every subdirectory as its own key in the listing map", () => {
    const tree = seedTree();
    for (const entries of Object.values(tree)) {
      for (const node of entries) {
        if (node.kind === "dir") expect(tree[node.id]).toBeDefined();
      }
    }
  });

  it("reports directories as zero bytes", () => {
    const tree = seedTree();
    const dir = tree.desktop.find((n) => n.kind === "dir")!;
    expect(dir.sizeBytes).toBe(0);
  });

  it("includes a text, a code, and an image file so every preview branch is reachable", () => {
    const all = Object.values(seedTree()).flat();
    const kinds = new Set(all.filter((n) => n.kind === "file").map((n) => n.contentKind));
    expect(kinds).toContain("text");
    expect(kinds).toContain("code");
    expect(kinds).toContain("image");
    expect(kinds).toContain("binary");
  });

  it("gives binaries no content, so Download can refuse to save an empty file", () => {
    const all = Object.values(seedTree()).flat();
    for (const node of all) {
      if (node.contentKind === "binary") expect(node.content).toBeUndefined();
    }
  });

  it("tags code files with a shiki language", () => {
    const all = Object.values(seedTree()).flat();
    for (const node of all) {
      if (node.contentKind === "code") expect(node.language).toBeTruthy();
    }
  });
});
