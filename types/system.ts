export interface BackupStatus {
  enabled: boolean;
  /** ISO string, or null when she has never backed up. */
  lastBackupAt: string | null;
  sizeBytes: number;
  /**
   * 0-100 while a backup runs, null when idle -- true for the demo's ticker,
   * but `POST /v1/backup/run` blocks until the backup finishes and answers
   * once with the final state (no partial progress exists on the wire), so
   * `HttpSystemRepo` always resolves this `null`. A caller that wants a
   * "running" indicator during that request tracks its own pending state
   * around the call; this field is not it live.
   */
  progressPct: number | null;
  /**
   * `BackupStatePayload` also carries these two, but no component reads
   * them yet (spec 4's `BackupPanel` predates the daemon). Optional so the
   * demo's existing literal (`store/system-store.ts`) keeps compiling
   * untouched -- `HttpSystemRepo` populates both.
   */
  provider?: string;
  /** Whether the *last* run actually succeeded -- the only signal for that; `enabled`/`lastBackupAt` don't carry it. */
  lastResult?: string;
  /**
   * Whether her backup encryption key is armed in the running process.
   *
   * Derived from the recovery phrase and held in memory only, so it is false
   * after every restart until someone supplies the phrase again -- and while
   * it is false, her scheduler skips every backup and a manual run is refused
   * with a 409. `enabled` describes a machine that INTENDS to back up;
   * this is the one that says it can.
   *
   * Optional for the same reason as the two above: the demo's literal state
   * has no such concept and keeps compiling. A live pane must treat
   * `undefined` as "not known", never as unlocked -- showing a healthy panel
   * through a week of skipped backups is exactly what happened before this
   * existed.
   */
  unlocked?: boolean;
}

export type RestoreStep = "phrase" | "verifying" | "confirm" | "result";

export interface VoiceProfile {
  id: string;
  name: string;
  /** null means the assistant does not know -- render absent, never 0. */
  sampleCount: number | null;
  enrolledAt: string;
  lastHeardAt: string | null;
}

export interface FaceProfile {
  id: string;
  name: string;
  /** null means the assistant does not know -- render absent, never 0. */
  encodingCount: number | null;
  metAt: string;
  lastSeenAt: string | null;
}

/**
 * `GET /v1/telemetry`'s payload, and the identical vocabulary the socket's
 * `telemetry` frame carries (milestone 5b plan, delta 6 -- "one mapping
 * serves both"). This is the dashboard's "live snapshot": a single point-in-
 * time read, not a stream -- the event-stream task (Task 10) is what turns
 * this into a live feed; until it lands, a caller that wants freshness polls
 * this repeatedly. `batteryPercent` is nullable on the wire (a desktop with
 * no battery); nothing else here is.
 */
export interface TelemetrySnapshot {
  cpuPercent: number;
  ramPercent: number;
  batteryPercent: number | null;
  activeModel: string;
  uptimeSeconds: number;
}
