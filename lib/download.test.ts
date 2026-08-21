import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadNode } from "./download";
import type { FileNode } from "@/types/file";

const textFile: FileNode = {
  id: "desktop/notes.md",
  name: "notes.md",
  kind: "file",
  sizeBytes: 12,
  modifiedAt: 0,
  contentKind: "text",
  content: "# tonight\n",
};

const binary: FileNode = {
  id: "documents/resume.pdf",
  name: "resume.pdf",
  kind: "file",
  sizeBytes: 1000,
  modifiedAt: 0,
  contentKind: "binary",
};

const SVG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';

const svgDataUriFile: FileNode = {
  id: "desktop/wallpaper.svg",
  name: "wallpaper.svg",
  kind: "file",
  sizeBytes: 620,
  modifiedAt: 0,
  contentKind: "image",
  content: `data:image/svg+xml;utf8,${encodeURIComponent(SVG_MARKUP)}`,
};

const base64DataUriFile: FileNode = {
  id: "desktop/icon.png",
  name: "icon.png",
  kind: "file",
  sizeBytes: 100,
  modifiedAt: 0,
  contentKind: "image",
  // "hi" base64-encoded, standing in for real binary image bytes.
  content: "data:image/png;base64,aGk=",
};

/** Captures the Blob passed to createObjectURL so its bytes can be asserted on. */
function captureCreatedBlob() {
  let captured: Blob | null = null;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    captured = blob;
    return "blob:mock";
  });
  return () => captured as unknown as Blob;
}

describe("downloadNode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });

  it("creates an object URL, clicks an anchor, and revokes the URL", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const result = downloadNode(textFile);

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    expect(result.ok).toBe(true);
    expect(result.title).toContain("notes.md");
  });

  it("names the saved file after the node", () => {
    let downloadAttr = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadAttr = this.download;
    });
    downloadNode(textFile);
    expect(downloadAttr).toBe("notes.md");
  });

  it("refuses a binary with no mock content rather than saving an empty file", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const result = downloadNode(binary);
    expect(result.ok).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("revokes even when the click throws, so the URL cannot leak", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("blocked");
    });
    const result = downloadNode(textFile);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    expect(result.ok).toBe(false);
  });

  it("decodes a percent-encoded data URI (utf8 SVG) into real markup bytes, not the data: text", async () => {
    const getBlob = captureCreatedBlob();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadNode(svgDataUriFile);

    const blob = getBlob();
    expect(blob).not.toBeNull();
    expect(blob.type).toBe("image/svg+xml");
    const text = await blob.text();
    expect(text).toBe(SVG_MARKUP);
    expect(text.startsWith("<svg")).toBe(true);
    expect(text).not.toContain("data:");
  });

  it("decodes a base64 data URI into real bytes", async () => {
    const getBlob = captureCreatedBlob();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadNode(base64DataUriFile);

    const blob = getBlob();
    expect(blob).not.toBeNull();
    expect(blob.type).toBe("image/png");
    const text = await blob.text();
    expect(text).toBe("hi");
  });

  it("returns ok: false instead of throwing when a base64 data URI's payload is invalid", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const malformed: FileNode = {
      ...svgDataUriFile,
      content: "data:image/svg+xml;base64,!!!not-base64!!!",
    };

    let result: ReturnType<typeof downloadNode> | undefined;
    expect(() => {
      result = downloadNode(malformed);
    }).not.toThrow();

    expect(result?.ok).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("returns ok: false instead of throwing when a percent-encoded data URI has a stray %", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const malformed: FileNode = {
      ...svgDataUriFile,
      content: "data:image/svg+xml;utf8,not%valid%encoding",
    };

    let result: ReturnType<typeof downloadNode> | undefined;
    expect(() => {
      result = downloadNode(malformed);
    }).not.toThrow();

    expect(result?.ok).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("leaves plain-text (non-data-URI) content unchanged", async () => {
    const getBlob = captureCreatedBlob();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadNode(textFile);

    const blob = getBlob();
    expect(blob).not.toBeNull();
    expect(blob.type).toBe("text/plain;charset=utf-8");
    const text = await blob.text();
    expect(text).toBe(textFile.content);
  });
});
