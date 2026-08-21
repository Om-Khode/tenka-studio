export type FileKind = "text" | "code" | "image" | "binary";

export interface FileNode {
  /**
   * The node's path, e.g. "downloads/invoices/inv-0001.pdf". Using the path as
   * the id means the breadcrumb is a split() and spec 5's GET /files?path= maps
   * straight onto it.
   */
  id: string;
  name: string;
  kind: "dir" | "file";
  /** Directories report 0; the list renders an em dash for them. */
  sizeBytes: number;
  modifiedAt: number;
  /**
   * files only. Optional *and* nullable: the wire's `FileEntryPayload`
   * always sends this key, `null` for a directory -- but every directory
   * literal in `store/file-scripts.ts` omits the field entirely rather than
   * writing `contentKind: null` at every call site, so both absences must
   * type-check.
   */
  contentKind?: FileKind | null;
  /** Text/code literal, or a data URI for images. Absent on binaries. */
  content?: string;
  /** shiki language, for contentKind === "code". */
  language?: string;
  /**
   * True when the daemon cut the body short (`FileContentPayload.truncated`).
   * A preview must say so rather than render a partial file as if it were
   * the whole thing -- absent (not false) means "not known to be truncated",
   * which covers demo nodes that never had a truncation concept to begin
   * with.
   */
  truncated?: boolean;
}

export type SortKey = "name" | "size" | "modified";

/**
 * What actually gets persisted. Storing the whole tree would write an
 * 800-entry blob to localStorage on every keystroke of a rename; storing the
 * diff and replaying it over a fresh seed is small, and survives a seed change
 * without corrupting.
 */
export interface FileOverlay {
  renames: Record<string, string>;
  deleted: string[];
  /** Files TENKA created during the session, e.g. a screenshot. */
  created: FileNode[];
}
