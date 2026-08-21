import type { BackupStatus, FaceProfile, TelemetrySnapshot, VoiceProfile } from "@/types/system";
import type { SystemRepo } from "../types";

/**
 * system-store.ts does NOT call getBackupStatus/runBackup/restoreBackup/
 * listVoices/listFaces -- the backup ticker and the seeded enrollment lists
 * are working, tested behaviour that stays store-internal in demo mode
 * (same reasoning as services/repos/demo/chat.ts). Those five exist for
 * RepoBundle completeness and as a reference for the real `HttpSystemRepo`
 * (services/repos/http/system.ts); their values are placeholders, not a
 * second source of truth for the demo UI.
 *
 * `forgetEnrolled` is the one method system-store.ts DOES call, in both
 * modes (Milestone-4 blocker 5's enrollment follow-up): a live "forget"
 * that never told the daemon anything was the same silent lie blocker 5
 * fixed for memory, so the store now awaits this before removing a row, in
 * demo too, not just live. It resolves `true` unconditionally -- there is
 * no real enrollment behind this stub to fail to remove, and returning
 * `false` here (as this used to) would have made every demo forget refuse
 * forever once the store started awaiting it.
 */
export class DemoSystemRepo implements SystemRepo {
  async getBackupStatus(): Promise<BackupStatus> {
    return { enabled: true, lastBackupAt: null, sizeBytes: 0, progressPct: null };
  }

  async runBackup(): Promise<BackupStatus> {
    return { enabled: true, lastBackupAt: null, sizeBytes: 0, progressPct: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match SystemRepo; this stub never reads the argument
  async restoreBackup(_phrase: string): Promise<boolean> {
    return false;
  }

  /**
   * True, unlike restoreBackup's false above. There is no key to arm in demo
   * mode and nothing to get wrong, so refusing would make the demo rehearse a
   * failure the real thing does not have -- the same reasoning that made
   * `forgetEnrolled` resolve true here rather than a hardcoded false.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match SystemRepo; this stub never reads the argument
  async unlockBackup(_phrase: string): Promise<boolean> {
    return true;
  }

  async listVoices(): Promise<VoiceProfile[]> {
    return [];
  }

  async listFaces(): Promise<FaceProfile[]> {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match SystemRepo; this stub never reads the arguments
  async forgetEnrolled(_kind: "voice" | "face", _itemId: string): Promise<boolean> {
    return true;
  }

  /**
   * Nothing calls this in demo mode -- the Dashboard's SystemMetersCard
   * stays on store/demo-engine.ts's jittered `systemStats`, which is
   * working, tested behaviour (same reasoning as every other method on this
   * class). Exists so this class satisfies SystemRepo.
   */
  async getTelemetry(): Promise<TelemetrySnapshot> {
    return { cpuPercent: 0, ramPercent: 0, batteryPercent: null, activeModel: "", uptimeSeconds: 0 };
  }
}
