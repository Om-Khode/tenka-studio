import { apiGet, apiSend } from "@/services/http";
import type { FileNode } from "@/types/file";
import type { components } from "@/types/api";
import type { FilesRepo } from "../types";

type FileEntryWire = components["schemas"]["FileEntryPayload"];
type FilesListingWire = components["schemas"]["FilesListingPayload"];
type FileContentWire = components["schemas"]["FileContentPayload"];
type RootsWire = components["schemas"]["RootsPayload"];
type DeletedWire = components["schemas"]["DeletedPayload"];

/**
 * The wire's `modifiedAt` is an ISO-8601 string (`datetime.fromtimestamp(...)
 * .isoformat()` on the daemon side); `FileNode.modifiedAt` stays epoch
 * millis, because file-store.ts sorts on it as a number and every seed
 * literal already is one. The conversion lives here, once, at the edge --
 * `FileNode`'s own type never needed to change.
 */
function toEpochMs(iso: string): number {
  return new Date(iso).getTime();
}

function toFileNode(entry: FileEntryWire): FileNode {
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    sizeBytes: entry.sizeBytes,
    modifiedAt: toEpochMs(entry.modifiedAt),
    contentKind: entry.contentKind,
  };
}

/**
 * Maps daemon JSON onto Studio's own types, once, at the edge -- see
 * services/repos/types.ts. Path-keyed end to end: every method here takes
 * or returns the same path string the wire uses as `FileEntryPayload.id`, so
 * a breadcrumb split() and a `list()` call share one string with no
 * translation step.
 *
 * File 404s cannot distinguish "gone" from "the operation failed" (delta
 * 10, contract-smoke-pass finding #10 -- `errors.py` funnels `KeyError`,
 * `FileNotFoundError`, `NotADirectoryError` and `OSError` into the same
 * fixed 404 body). This repo does not attempt to guess which; it rejects
 * with the daemon's `ApiError` unchanged and leaves the ambiguity for
 * whoever renders it to phrase honestly, per the plan's "the UI must not
 * claim which."
 */
export class HttpFileRepo implements FilesRepo {
  async roots(): Promise<string[]> {
    const payload = await apiGet<RootsWire>("/v1/files/roots");
    return payload.roots;
  }

  async list(path: string): Promise<FileNode[]> {
    const payload = await apiGet<FilesListingWire>(
      `/v1/files?path=${encodeURIComponent(path)}`,
    );
    return payload.entries.map(toFileNode);
  }

  async read(node: FileNode): Promise<FileNode> {
    const payload = await apiGet<FileContentWire>(
      `/v1/files/content?path=${encodeURIComponent(node.id)}`,
    );
    // Only the content-shaped fields come from this route -- name, kind,
    // sizeBytes and modifiedAt came from list() and are never fabricated
    // here (the content payload does not carry them at all).
    return {
      ...node,
      contentKind: payload.contentKind,
      content: payload.content,
      language: payload.language,
      truncated: payload.truncated,
    };
  }

  async rename(path: string, newName: string): Promise<FileNode> {
    const entry = await apiSend<FileEntryWire>("POST", "/v1/files/rename", {
      path,
      newName,
    });
    return toFileNode(entry);
  }

  async remove(path: string): Promise<void> {
    await apiSend<DeletedWire>("DELETE", "/v1/files", { path });
  }
}
