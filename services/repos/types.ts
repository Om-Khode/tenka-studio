/**
 * The repository seam. Every domain speaks Studio's own types (types/*.ts),
 * never the daemon's JSON -- Http* implementations (Batch 2 of the
 * milestone-5b plan) map at the edge, once, inside themselves.
 * `configureRepos()` binds one bundle per route tree: `services/repos/demo/*`
 * for `/demo`, an `Http*` bundle for `/app`.
 *
 * Not every field here is wired into a store yet:
 *   - `memory` and `settings` ARE wired -- memory-store.ts and
 *     settings-store.ts call `getRepos()` for their existing load()/save()
 *     paths, which already had a `LoadStatus`/scripted-delay shape to
 *     preserve.
 *   - `files`, `commands`, `chat`, and `system` are deliberately thin. Chat
 *     and system's scripted streaming / backup ticker stay store-internal in
 *     demo mode -- moving working, tested behaviour into a repository it
 *     doesn't need yet is a rewrite for no gain (see this milestone's plan,
 *     Task 2). Files and commands have no `load()`/`LoadStatus` pattern to
 *     preserve today -- file-store.ts seeds `entriesByDir` synchronously at
 *     module scope and the Files page has no loading/error branch, so wiring
 *     either into a page is later work (Batch 2/3/9), not this seam.
 *
 * These four interfaces exist so `RepoBundle` type-checks now and so the
 * later Http* tasks have a contract to start from -- expect them to grow
 * (e.g. Task 7 splits a chat "conversation ref" from a "conversation
 * detail"), not to be final.
 */

import type { Entity, Fact, Relationship, Preference, Procedure, MemoryScope } from "@/types/memory";
import type { SaveOutcome, SettingDef, SettingValue } from "@/types/settings";
import type { FileNode } from "@/types/file";
import type { CommandDef } from "@/types/command";
import type { ConversationDetail, ConversationRef } from "@/types/chat";
import type { BackupStatus, FaceProfile, TelemetrySnapshot, VoiceProfile } from "@/types/system";
import type { ActionResult } from "@/types/action";

export interface MemorySnapshot {
  entities: Entity[];
  facts: Fact[];
  relationships: Relationship[];
  preferences: Preference[];
  procedures: Procedure[];
}

export interface MemoryRepo {
  load(): Promise<MemorySnapshot>;
  /**
   * A single item, by scope. `itemId` is always a string on the wire (an
   * entity/procedure numeric id stringified, or a preference key verbatim)
   * -- the repo does not know or care which, it just forwards the path
   * segment the daemon expects. Rejects (never resolves `false`-ish) on a
   * daemon error, including a 403 when the caller lacks `chat_send` -- which
   * cannot happen for this route today, but the shape does not assume the
   * daemon's grant table stays that way.
   */
  forget(scope: MemoryScope, itemId: string): Promise<void>;
  /**
   * Forgets everything. The daemon gates this on `system_control`, not
   * `chat_send` -- a caller must be able to tell that 403 apart from any other
   * failure (`ApiError.status`), so the danger zone can say "this device
   * may not do that" instead of a generic error.
   */
  forgetAll(): Promise<void>;
}

export interface SettingsRepo {
  /**
   * Resolves to the full set of settings to render, merged daemon-first:
   * DemoSettingsRepo returns the static registry verbatim (nothing to merge
   * against), HttpSettingsRepo merges `GET /v1/settings`'s rows with the
   * registry's presentation data (label, slider bounds, option text) at the
   * edge, once. A key the registry has never seen still comes back with a
   * humanised label; a key the registry has but the daemon no longer
   * reports is simply absent from the result -- callers must not keep a
   * stale copy of a previous load() around once they read this one.
   */
  load(): Promise<SettingDef[]>;
  save(patch: Record<string, SettingValue>): Promise<SaveOutcome>;
}

/** Mirrors the daemon's `PersonalityPayload` (base, available, traits, sampleLine). */
export interface PersonalityPayload {
  base: string;
  available: string[];
  traits: Record<string, number>;
  sampleLine: string;
}

export interface PersonalityRepo {
  load(): Promise<PersonalityPayload>;
  setBase(base: string): Promise<PersonalityPayload>;
  reset(): Promise<PersonalityPayload>;
}

export interface FilesRepo {
  /** GET /v1/files/roots. Never hardcode roots on the client. */
  roots(): Promise<string[]>;
  /**
   * One directory's listing. Path-keyed end to end: a node's id is its path,
   * and this is the same string a breadcrumb split() produces, so a click
   * on any crumb is `list(thatCrumb.id)` with no translation in between.
   */
  list(path: string): Promise<FileNode[]>;
  /**
   * Body content for a node `list()` already returned. Takes the node,
   * not just its id, and returns it merged with content/language/truncated
   * -- the daemon's content route never carries name/size/modifiedAt, so a
   * repo that fetched by id alone would have to fabricate those fields
   * rather than reuse the real ones the listing already had.
   */
  read(node: FileNode): Promise<FileNode>;
  rename(path: string, newName: string): Promise<FileNode>;
  /**
   * Resolves on success, rejects otherwise -- a 404 here cannot say "already
   * gone" apart from "the delete itself failed" (a real filesystem-level
   * error), so this must not invent a boolean claiming to know which.
   */
  remove(path: string): Promise<void>;
}

/**
 * One past command run, derived from the daemon's audit log.
 *
 * `id` is parsed back out of the audited path, so it is the daemon's own
 * command id -- but nothing guarantees that id is still in `list()` (a
 * command can disappear while its history remains), so a caller must be able
 * to render an id it cannot resolve to a label.
 */
export interface CommandRun {
  id: string;
  at: string;
  /**
   * The audit log's own word for how it ended. Deliberately not narrowed to a
   * boolean: "denied" and "error" are different things to show a user.
   */
  outcome: string;
}

export interface CommandsRepo {
  list(): Promise<CommandDef[]>;
  /**
   * Never throws: a refused or unreachable run resolves to `ok: false`.
   * Commands report through the shared toast queue (types/action.ts), and a
   * thrown error would bypass the one feedback vocabulary the product has.
   */
  run(id: string): Promise<ActionResult>;
  /**
   * Recent runs, newest first, from `GET /v1/audit`.
   *
   * **Only what ran through the API.** The audit log records HTTP requests,
   * so a command TENKA performed by voice or from her own console never
   * appears here. A pane rendering this must not present it as everything
   * she has done.
   */
  recentRuns(limit: number): Promise<CommandRun[]>;
}

/**
 * `sendMessage` used to resolve `{ reply: string }` -- a shape only a
 * scripted demo could ever honour. `POST /v1/chat` answers 202 with a
 * `turnId`/`conversationId` and nothing else; the reply streams over the
 * socket (Task 10), never in this response, so no real implementation could
 * satisfy the old signature. Nothing called it (chat-store.ts's scripted
 * streaming never went through this repo -- see repos/demo/chat.ts), so
 * widening it here breaks no caller.
 */
export interface ChatRepo {
  /** POST /v1/chat. Busy is a 409 the composer renders (`ApiError.status === 409`), not a silent drop. */
  sendMessage(text: string): Promise<{ turnId: string; conversationId: string }>;
  /** GET /v1/chat/conversations. Titles only -- a pane fetches the body it needs via getConversation(). */
  listConversations(): Promise<ConversationRef[]>;
  /** GET /v1/chat/conversations/{id}. A missing conversation resolves to null; anything else throws -- a 500 must not read as "no such chat". */
  getConversation(id: string): Promise<ConversationDetail | null>;
  /** POST /v1/abort. Resolves whether a turn was actually stopped. */
  abort(): Promise<boolean>;
}

export interface SystemRepo {
  /** GET /v1/backup. */
  getBackupStatus(): Promise<BackupStatus>;
  /**
   * POST /v1/backup/run. Blocks until the backup finishes and resolves the
   * final state -- there is no live progress signal to poll or stream, so a
   * caller that wants a "running" indicator holds its own pending flag for
   * the duration of this call; `BackupStatus.progressPct` stays null.
   */
  runBackup(): Promise<BackupStatus>;
  /** POST /v1/backup/restore. Requires system_control. A wrong phrase resolves false, never throws -- only a capability/network/precondition failure does. */
  restoreBackup(phrase: string): Promise<boolean>;
  /**
   * POST /v1/backup/unlock. Requires system_control.
   *
   * Arms the backup encryption key for the assistant's CURRENT process. The
   * key is derived from the recovery phrase and never persisted, so it is gone
   * after every restart -- and while it is gone her scheduler skips every
   * backup and `runBackup()` is refused with a 409. Without this, the only way
   * to resume backups from Studio was to restore, which unlocks as a side
   * effect of overwriting everything she remembers.
   *
   * A malformed phrase resolves false. A 403, a 429 from this route's tight
   * budget, or an unreachable daemon still throw -- flattening those would
   * tell the user their phrase was wrong when she never received it.
   *
   * Note it cannot verify the phrase is the RIGHT one: deriving a key with no
   * archive to decrypt proves nothing. A wrong-but-well-formed phrase resolves
   * true and fails at the next backup. That is the daemon's behaviour, stated
   * here rather than papered over.
   */
  unlockBackup(phrase: string): Promise<boolean>;
  /** GET /v1/enrollment (voices half). */
  listVoices(): Promise<VoiceProfile[]>;
  /** GET /v1/enrollment (faces half). */
  listFaces(): Promise<FaceProfile[]>;
  /** DELETE /v1/enrollment/{kind}/{itemId}. Requires system_control. Resolves whether it actually removed something. */
  forgetEnrolled(kind: "voice" | "face", itemId: string): Promise<boolean>;
  /**
   * GET /v1/telemetry. A snapshot, not a feed -- see TelemetrySnapshot's own
   * doc. Milestone 5b Task "10b" wires the Dashboard's system-meters card
   * onto this so `/app` stops reading store/demo-engine.ts for cpu/ram/
   * battery; the event-stream task turns it into a live push later without
   * this method's shape changing.
   */
  getTelemetry(): Promise<TelemetrySnapshot>;
}

export type RepoMode = "demo" | "live";

export interface RepoBundle {
  memory: MemoryRepo;
  settings: SettingsRepo;
  personality: PersonalityRepo;
  files: FilesRepo;
  commands: CommandsRepo;
  chat: ChatRepo;
  system: SystemRepo;
}
