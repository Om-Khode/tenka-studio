import type { ActionResult } from "@/types/action";
import type { FileNode } from "@/types/file";

const MIME: Record<string, string> = {
  text: "text/plain;charset=utf-8",
  code: "text/plain;charset=utf-8",
  image: "image/svg+xml",
  binary: "application/octet-stream",
};

const DATA_URI_RE = /^data:([^,;]*)((?:;[^,;]+)*),([\s\S]*)$/;

/**
 * `node.content` for images is a data URI (see store/file-scripts.ts's
 * `SCREENSHOT_SVG`), not the raw bytes it encodes. Downloading it verbatim
 * saves the literal text `data:image/svg+xml;utf8,%3C...` instead of the SVG
 * markup it represents. Decode it into the real payload before it lands in a
 * Blob.
 *
 * Only `;base64,` is a real encoding keyword here; everything else (this
 * project uses `;utf8,`, which is not a standard media-type parameter) is
 * treated as percent-encoded text, matching how the data URI was built.
 */
function decodeDataUri(content: string): { mime: string | null; bytes: BlobPart } {
  const match = DATA_URI_RE.exec(content);
  if (!match) return { mime: null, bytes: content };

  const [, mime, params, payload] = match;
  if (params.includes(";base64")) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { mime: mime || null, bytes };
  }

  return { mime: mime || null, bytes: decodeURIComponent(payload) };
}

/**
 * Saves a file for real — a Blob, an object URL, and an anchor click, so
 * something actually lands in the user's Downloads rather than a toast
 * claiming it did.
 *
 * Takes a node that already carries its bytes. A live listing does not: the
 * caller fetches the body through `FilesRepo.read()` first (see
 * app/demo/files/page.tsx's downloadFile). What is left here is the genuinely
 * bodiless case — a directory, or a binary, whose bytes the daemon's content
 * route does not serve.
 */
export function downloadNode(node: FileNode): ActionResult {
  if (node.kind !== "file" || !node.content) {
    return {
      ok: false,
      title: `Can't download ${node.name}`,
      // Not "a stand-in with no bytes behind it" -- that was demo copy, and
      // it was the line every live download got.
      detail: "She has no bytes for this one.",
    };
  }

  let blob: Blob;
  try {
    const { mime, bytes } = decodeDataUri(node.content);
    blob = new Blob([bytes], { type: mime ?? MIME[node.contentKind ?? "binary"] });
  } catch {
    // A malformed data URI (bad base64, a stray `%` in the percent-encoded
    // payload) throws out of atob/decodeURIComponent. Every other failure
    // path here returns ok: false instead of throwing -- this one is not
    // reachable through today's only content producer (it always encodes
    // with encodeURIComponent), but downloadNode is generic and shouldn't
    // break its own contract for the next caller.
    return {
      ok: false,
      title: `Couldn't save ${node.name}`,
      detail: "Her copy of this file is malformed.",
    };
  }

  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = node.name;
    anchor.click();
    return { ok: true, title: `Saved ${node.name}` };
  } catch {
    return { ok: false, title: `Couldn't save ${node.name}` };
  } finally {
    // In a finally, not after the click: an object URL that outlives its
    // anchor pins the whole Blob in memory for the life of the document.
    URL.revokeObjectURL(url);
  }
}
