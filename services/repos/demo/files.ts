import { seedTree, ROOTS } from "@/store/file-scripts";
import type { FileNode } from "@/types/file";
import type { FilesRepo } from "../types";

/** Every dir key seedTree() would ever produce, searched breadth-first so a
 * lookup by id does not need to know its own parent ahead of time. */
function findNode(id: string): FileNode | undefined {
  const tree = seedTree();
  for (const dirId of Object.keys(tree)) {
    const hit = tree[dirId].find((n) => n.id === id);
    if (hit) return hit;
  }
  return undefined;
}

function parentOf(id: string): string {
  return id.split("/").slice(0, -1).join("/");
}

/**
 * Wraps store/file-scripts.ts. file-store.ts does NOT call this yet -- its
 * `entriesByDir` stays seeded synchronously at module scope, exactly as
 * before (see that store's own comments). This exists so RepoBundle
 * type-checks and so Task 9 has a real, path-scoped contract to build the
 * live tree's async loading against -- matching FilesRepo, not the store's
 * own local-overlay conventions (rename/remove here operate on a fresh
 * seedTree() each call and persist nothing; the store's overlay is a
 * separate, session-persisted mechanism that a later task reconciles).
 */
export class DemoFilesRepo implements FilesRepo {
  async roots(): Promise<string[]> {
    return [...ROOTS];
  }

  /**
   * Rejects for a path this seed has no listing for, where it used to resolve
   * `[]`. The live repo rejects (the daemon 404s), and a demo that answers
   * "this directory is empty" to "this directory does not exist" is not a
   * rehearsal of /app -- it is a quieter product with a branch (`status:
   * "error"`, the retry affordance) that only ever runs against a real daemon.
   * Every directory node the seed produces has a key here, so nothing
   * reachable by navigation is affected.
   */
  async list(path: string): Promise<FileNode[]> {
    const listing = seedTree()[path];
    if (!listing) throw new Error(`list: no such directory "${path}"`);
    return listing;
  }

  /**
   * The seed already inlines content/language on every node that has any (see
   * file-scripts.ts), and nothing in demo mode is ever cut short -- so this is
   * a pass-through, not a fetch. Re-reads by id rather than trusting the
   * caller's copy, the same way the live repo would.
   *
   * A miss now rejects instead of returning the caller's own node back. That
   * fallback made an unreadable file render as a successfully-loaded preview
   * with no content -- the read reported success and the pane showed emptiness
   * as though that were the file. Live rejects; so does this.
   */
  async read(node: FileNode): Promise<FileNode> {
    const found = findNode(node.id);
    if (!found) throw new Error(`read: no such path "${node.id}"`);
    return found;
  }

  async rename(path: string, newName: string): Promise<FileNode> {
    const node = findNode(path);
    if (!node) throw new Error(`rename: no such path "${path}"`);
    const id = `${parentOf(path)}/${newName}`;
    return { ...node, id, name: newName };
  }

  async remove(path: string): Promise<void> {
    if (!findNode(path)) throw new Error(`remove: no such path "${path}"`);
  }
}
