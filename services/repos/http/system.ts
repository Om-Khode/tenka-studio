import { apiGet, apiSend, ApiError } from "@/services/http";
import type { components } from "@/types/api";
import type { SystemRepo } from "../types";
import type { BackupStatus, FaceProfile, TelemetrySnapshot, VoiceProfile } from "@/types/system";

type BackupStatePayload = components["schemas"]["BackupStatePayload"];
type RestorePayload = components["schemas"]["RestorePayload"];
type UnlockPayload = components["schemas"]["UnlockPayload"];
type EnrollmentPayload = components["schemas"]["EnrollmentPayload"];
type EnrolledItemPayload = components["schemas"]["EnrolledItemPayload"];
type ForgetEnrolledPayload = components["schemas"]["ForgetEnrolledPayload"];
type TelemetryPayload = components["schemas"]["TelemetryPayload"];

/**
 * The daemon uses `""` as its "don't know / never happened" sentinel for
 * both `BackupStatePayload.lastBackupAt` and `EnrolledItemPayload.lastSeenAt`
 * -- it never sends `null` for either (delta 4, corrected by the Task 0
 * smoke pass). Studio's own types use `null` for that meaning, and the
 * daemon will not map it for us.
 */
function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
}

function toBackupStatus(payload: BackupStatePayload): BackupStatus {
  return {
    enabled: payload.enabled,
    lastBackupAt: emptyToNull(payload.lastBackupAt),
    sizeBytes: payload.sizeBytes,
    // No live progress signal exists: GET /v1/backup and POST
    // /v1/backup/run both answer with the final state only, never a partial
    // one. Inventing a number here (the demo's 0-100 ticker) would be a lie
    // about a granularity the daemon does not report.
    progressPct: null,
    provider: payload.provider,
    lastResult: payload.lastResult,
    unlocked: payload.unlocked,
  };
}

function toVoiceProfile(payload: EnrolledItemPayload): VoiceProfile {
  return {
    id: payload.itemId,
    name: payload.name,
    // `count` is genuinely nullable on the wire (unlike lastSeenAt's ""
    // sentinel) -- null means the assistant does not know, passed through
    // unchanged rather than coerced to 0. See types/system.ts.
    sampleCount: payload.count,
    enrolledAt: payload.enrolledAt,
    lastHeardAt: emptyToNull(payload.lastSeenAt),
  };
}

function toFaceProfile(payload: EnrolledItemPayload): FaceProfile {
  return {
    id: payload.itemId,
    name: payload.name,
    encodingCount: payload.count,
    metAt: payload.enrolledAt,
    lastSeenAt: emptyToNull(payload.lastSeenAt),
  };
}

/**
 * Maps Studio's system domain (backup, restore, enrollment) onto the
 * daemon's `/v1/backup*` and `/v1/enrollment*` routes. Not wired into
 * system-store.ts by this task -- that rewiring, plus teaching
 * `BackupPanel`/`EnrollmentPanel` to render a null count as absent rather
 * than "0", is Task 11's job (Milestone-4 blockers).
 */
export class HttpSystemRepo implements SystemRepo {
  async getBackupStatus(): Promise<BackupStatus> {
    return toBackupStatus(await apiGet<BackupStatePayload>("/v1/backup"));
  }

  async runBackup(): Promise<BackupStatus> {
    // Blocks for the whole backup; resolves once, with the finished state.
    return toBackupStatus(await apiSend<BackupStatePayload>("POST", "/v1/backup/run"));
  }

  async restoreBackup(phrase: string): Promise<boolean> {
    try {
      const result = await apiSend<RestorePayload>("POST", "/v1/backup/restore", {
        recoveryPhrase: phrase,
      });
      return result.restored;
    } catch (err) {
      // The route's only explicit failure is a 400 built from a fixed
      // "restore failed" string (routes/system.py) for a wrong or
      // unreadable phrase -- the daemon never echoes what was submitted.
      // That one case resolves false. Anything else (403 missing
      // system_control, 429 throttled, a network failure) is a different
      // kind of "no" and must still throw, or a caller cannot tell "the
      // phrase was wrong" from "she never got the request".
      if (err instanceof ApiError && err.status === 400) return false;
      throw err;
    }
  }

  async unlockBackup(phrase: string): Promise<boolean> {
    try {
      const result = await apiSend<UnlockPayload>("POST", "/v1/backup/unlock", {
        recoveryPhrase: phrase,
      });
      return result.unlocked;
    } catch (err) {
      // Same split as restoreBackup above: the route's own 400 ("unlock
      // failed", a fixed string that never echoes the phrase) means the
      // phrase was malformed, and resolves false. A 403, a 429 from this
      // route's deliberately tight budget, or an unreachable daemon are
      // different answers and must still throw -- a caller that flattened
      // them would tell the user their phrase was wrong when she never
      // received it.
      if (err instanceof ApiError && err.status === 400) return false;
      throw err;
    }
  }

  /**
   * One `GET /v1/enrollment` carries BOTH halves (`EnrollmentPayload` is
   * `{voices, faces}`), but `SystemRepo` asks for them through two methods and
   * system-store calls both inside one `Promise.all` -- so this issued the
   * request twice per load, against a 120-per-60s limiter, and a forget landing
   * between the two answers produced a torn read: a voice list from before it
   * beside a face list from after.
   *
   * Coalesced here rather than by collapsing the two repo methods into one,
   * which would change `SystemRepo` and every implementation and caller of it
   * for a problem that is entirely this transport's. Concurrent callers share
   * the in-flight promise and therefore one response; the field clears when it
   * settles, so this caches nothing across loads and a later call still asks
   * again. A rejection propagates to both callers, exactly as two separate
   * failed requests would have.
   */
  private enrollmentInFlight: Promise<EnrollmentPayload> | null = null;

  private enrollment(): Promise<EnrollmentPayload> {
    this.enrollmentInFlight ??= apiGet<EnrollmentPayload>("/v1/enrollment").finally(() => {
      this.enrollmentInFlight = null;
    });
    return this.enrollmentInFlight;
  }

  async listVoices(): Promise<VoiceProfile[]> {
    return (await this.enrollment()).voices.map(toVoiceProfile);
  }

  async listFaces(): Promise<FaceProfile[]> {
    return (await this.enrollment()).faces.map(toFaceProfile);
  }

  async forgetEnrolled(kind: "voice" | "face", itemId: string): Promise<boolean> {
    try {
      const result = await apiSend<ForgetEnrolledPayload>(
        "DELETE",
        `/v1/enrollment/${kind}/${encodeURIComponent(itemId)}`,
      );
      // `ForgetEnrolledPayload.forgotten` is a STRING -- the daemon echoes the
      // id it removed (`ForgetEnrolledPayload(forgotten=item_id, kind=kind)`),
      // it is not a boolean. `Boolean(result.forgotten)` was therefore true for
      // every 2xx including one that removed something else, and was only
      // correct by accident, because the route 404s when there was nothing to
      // remove -- an expression asserting something it did not check. Comparing
      // the echo to what was asked for is the check it was pretending to be.
      return result.forgotten === itemId;
    } catch (err) {
      // The route raises a bare 404 when there was nothing by that id to
      // remove -- a meaningful "no" for a delete, not an unknown failure,
      // so it resolves false rather than throwing. A missing system_control
      // grant (403) or anything else still throws.
      if (err instanceof ApiError && err.status === 404) return false;
      throw err;
    }
  }

  /**
   * `TelemetryPayload`'s keys already match `TelemetrySnapshot` verbatim
   * (delta 6: the socket's `telemetry` frame and this REST route share one
   * vocabulary) -- a pass-through, not a mapping, same shape as
   * `toBackupStatus` would be if it had nothing to rename.
   */
  async getTelemetry(): Promise<TelemetrySnapshot> {
    const payload = await apiGet<TelemetryPayload>("/v1/telemetry");
    return {
      cpuPercent: payload.cpuPercent,
      ramPercent: payload.ramPercent,
      batteryPercent: payload.batteryPercent,
      activeModel: payload.activeModel,
      uptimeSeconds: payload.uptimeSeconds,
    };
  }
}
