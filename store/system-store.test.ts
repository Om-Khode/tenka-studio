import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useSystemStore,
  looksLikeRecoveryPhrase,
  BIP39_WORD_COUNTS,
  RECOVERY_PHRASE_SHAPE_HINT,
  selectTelemetryStale,
  TELEMETRY_STALE_AFTER_MISSES,
} from "./system-store";
import { configureRepos, getRepoMode, resetRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import type { RepoBundle } from "@/services/repos/types";
import type { BackupStatus, FaceProfile, TelemetrySnapshot, VoiceProfile } from "@/types/system";
import { ApiError } from "@/services/http";

/**
 * Twelve words -- the shortest BIP39-legal length, and what
 * `_MNEMONIC_STRENGTH_BITS = 128` yields today. Not a real mnemonic and not
 * anyone's phrase: demo mode's restoreBackup() checks shape only (there is
 * no daemon to ask), so nothing here is a secret.
 */
const A_WELL_FORMED_PHRASE =
  "amber moss steel gold bone quiet signal drift ember lattice harbor vellum";

function reset() {
  useSystemStore.setState(useSystemStore.getInitialState());
}

describe("system-store", () => {
  beforeEach(reset);

  it("seeds a plausible backup status and enrollment set", () => {
    const s = useSystemStore.getState();
    expect(s.backup.lastBackupAt).toBeTruthy();
    expect(s.voices.length).toBeGreaterThan(0);
    expect(s.faces.length).toBeGreaterThan(0);
  });

  it("starts idle, and load() reaches ready without ever going through the network in demo", async () => {
    expect(useSystemStore.getState().status).toBe("idle");
    expect(getRepoMode()).not.toBe("live");
    await useSystemStore.getState().load();
    expect(useSystemStore.getState().status).toBe("ready");
    // Demo's seed, untouched -- DemoSystemRepo's placeholders never ran.
    expect(useSystemStore.getState().backup.sizeBytes).toBe(41_000_000);
  });

  it("runs a backup to completion and clears its progress", async () => {
    vi.useFakeTimers();
    const pending = useSystemStore.getState().runBackup();
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(useSystemStore.getState().backup.progressPct).toBeNull();
    vi.useRealTimers();
  });

  it("reports progress while it runs", async () => {
    vi.useFakeTimers();
    const pending = useSystemStore.getState().runBackup();
    await vi.advanceTimersByTimeAsync(1);
    expect(useSystemStore.getState().backup.progressPct).not.toBeNull();
    await vi.runAllTimersAsync();
    await pending;
    vi.useRealTimers();
  });

  it("resets progressPct on a throw mid-loop, so the single-flight guard does not strand future backups", async () => {
    // Real timers on purpose: tick 1 is let through to a REAL setTimeout so
    // the loop genuinely starts (progressPct becomes non-null) before tick
    // 2's executor throws synchronously and auto-rejects -- the exact point
    // a real network call could fail mid-backup, once this scripted loop
    // becomes one.
    const realSetTimeout = globalThis.setTimeout;
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    timeoutSpy.mockImplementationOnce(((cb: () => void, ms?: number) =>
      realSetTimeout(cb, ms)) as typeof setTimeout);
    timeoutSpy.mockImplementationOnce(() => {
      throw new Error("simulated network failure");
    });

    try {
      await expect(useSystemStore.getState().runBackup()).rejects.toThrow(
        "simulated network failure",
      );
      expect(useSystemStore.getState().backup.progressPct).toBeNull();
    } finally {
      timeoutSpy.mockRestore();
    }

    // The guard must not still think a backup is in flight.
    const result = await useSystemStore.getState().runBackup();
    expect(result.ok).toBe(true);
  });

  it("refuses a second concurrent backup and leaves the first undisturbed", async () => {
    vi.useFakeTimers();
    const first = useSystemStore.getState().runBackup();
    await vi.advanceTimersByTimeAsync(1);
    const second = await useSystemStore.getState().runBackup();
    expect(second.ok).toBe(false);
    await vi.runAllTimersAsync();
    const firstResult = await first;
    expect(firstResult.ok).toBe(true);
    expect(useSystemStore.getState().backup.progressPct).toBeNull();
    vi.useRealTimers();
  });

  it("looksLikeRecoveryPhrase checks word count only, not content", () => {
    expect(looksLikeRecoveryPhrase(A_WELL_FORMED_PHRASE)).toBe(true);
    // Case and surrounding space must not matter; the word count must.
    expect(looksLikeRecoveryPhrase(`  ${A_WELL_FORMED_PHRASE.toUpperCase()}  `)).toBe(true);
    expect(looksLikeRecoveryPhrase("nope")).toBe(false);
    expect(looksLikeRecoveryPhrase("any twelve made up words at all will pass this shape check"))
      .toBe(true);
  });

  /**
   * Critical, milestone 5b fix round. The gate was `=== 8`, and the daemon
   * generates a BIP39 mnemonic (io/backup/crypto.py:17,
   * `_MNEMONIC_STRENGTH_BITS = 128  # -> 12 words`) validated with
   * `Mnemonic().check()`, which accepts 12/15/18/21/24 words plus a
   * checksum and nothing else. So the gate admitted only phrases the daemon
   * was certain to reject, and blocked every phrase it could accept: a user
   * holding their real recovery phrase could not restore at all, and was
   * told their own phrase was the wrong length.
   */
  it("accepts every BIP39-legal length and no other, so a phrase the daemon would take always reaches it", () => {
    for (const count of BIP39_WORD_COUNTS) {
      expect(looksLikeRecoveryPhrase(Array(count).fill("word").join(" "))).toBe(true);
    }
    // The count the pre-fix gate demanded, which BIP39 cannot produce.
    expect(looksLikeRecoveryPhrase(Array(8).fill("word").join(" "))).toBe(false);
    expect(looksLikeRecoveryPhrase("")).toBe(false);
    expect(looksLikeRecoveryPhrase(Array(13).fill("word").join(" "))).toBe(false);
  });

  it("states the format's legal lengths, never a length of hers", () => {
    // Studio has no route that reports how long her phrase is, so any
    // sentence of the form "Her recovery phrase is N words" is a claim it
    // cannot make. The hint the dialog renders talks about the format.
    expect(RECOVERY_PHRASE_SHAPE_HINT).toMatch(/^A recovery phrase is /);
    for (const count of BIP39_WORD_COUNTS) {
      expect(RECOVERY_PHRASE_SHAPE_HINT).toContain(String(count));
    }
  });

  it("demo restoreBackup falls back to the word-count heuristic -- there is no daemon to ask", async () => {
    const wrongShape = await useSystemStore.getState().restoreBackup("nope");
    expect(wrongShape.ok).toBe(false);

    const rightShape = await useSystemStore.getState().restoreBackup(A_WELL_FORMED_PHRASE);
    expect(rightShape.ok).toBe(true);
  });

  it("forgets a voice and a face", async () => {
    const { voices, faces } = useSystemStore.getState();
    const voiceResult = await useSystemStore.getState().forgetVoice(voices[0].id);
    const faceResult = await useSystemStore.getState().forgetFace(faces[0].id);
    expect(voiceResult.ok).toBe(true);
    expect(faceResult.ok).toBe(true);
    expect(useSystemStore.getState().voices).toHaveLength(voices.length - 1);
    expect(useSystemStore.getState().faces).toHaveLength(faces.length - 1);
  });
});

describe("system-store enrollment forget goes through SystemRepo in both modes (follow-up to Milestone-4 blocker 5)", () => {
  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    reset();
  });

  function liveBundleWith(system: Partial<RepoBundle["system"]>): RepoBundle {
    return {
      ...demoRepoBundle,
      system: {
        // Spread the demo repo first so a method added to SystemRepo later
        // does not break every fixture here. These stubs used to enumerate
        // the interface by hand and went stale the moment getTelemetry landed.
        ...demoRepoBundle.system,
        getBackupStatus: async () => ({ enabled: true, lastBackupAt: null, sizeBytes: 0, progressPct: null }),
        runBackup: async () => ({ enabled: true, lastBackupAt: null, sizeBytes: 0, progressPct: null }),
        restoreBackup: async () => false,
        listVoices: async () => [],
        listFaces: async () => [],
        forgetEnrolled: async () => false,
        ...system,
      },
    };
  }

  it("PROOF-OF-FAILURE (enrollment follow-up): forgetVoice() actually calls the repository -- before this fix it never did, live or demo", async () => {
    let calledWith: [string, string] | null = null;
    const stubBundle: RepoBundle = {
      ...demoRepoBundle,
      system: {
        ...liveBundleWith({}).system,
        forgetEnrolled: async (kind, itemId) => {
          calledWith = [kind, itemId];
          return true;
        },
      },
    };
    configureRepos("demo", stubBundle);

    const { voices } = useSystemStore.getState();
    await useSystemStore.getState().forgetVoice(voices[0].id);

    expect(calledWith).toEqual(["voice", voices[0].id]);
  });

  it("a live forget leaves the row gone only when the daemon agreed", async () => {
    configureRepos("live", liveBundleWith({ forgetEnrolled: async () => false }));
    const { faces } = useSystemStore.getState();

    const result = await useSystemStore.getState().forgetFace(faces[0].id);

    expect(result.ok).toBe(false);
    // Refused -- the row must still be there, never optimistically removed.
    expect(useSystemStore.getState().faces).toHaveLength(faces.length);
  });

  it("a live forget removes the row once the daemon confirms it", async () => {
    configureRepos("live", liveBundleWith({ forgetEnrolled: async () => true }));
    const { faces } = useSystemStore.getState();

    const result = await useSystemStore.getState().forgetFace(faces[0].id);

    expect(result.ok).toBe(true);
    expect(useSystemStore.getState().faces).toHaveLength(faces.length - 1);
  });

  it("a 403 (missing system_control) reads as a device-grant message, not a generic failure", async () => {
    configureRepos(
      "live",
      liveBundleWith({
        forgetEnrolled: async () => {
          throw new ApiError(403, "forbidden");
        },
      }),
    );
    const { voices } = useSystemStore.getState();

    const result = await useSystemStore.getState().forgetVoice(voices[0].id);

    expect(result.ok).toBe(false);
    expect(result.title).toMatch(/this device may not do that/i);
    expect(useSystemStore.getState().voices).toHaveLength(voices.length);
  });

  it("a non-403 failure is reported generically, and the row stays", async () => {
    configureRepos(
      "live",
      liveBundleWith({
        forgetEnrolled: async () => {
          throw new Error("simulated network failure");
        },
      }),
    );
    const { voices } = useSystemStore.getState();

    const result = await useSystemStore.getState().forgetVoice(voices[0].id);

    expect(result.ok).toBe(false);
    expect(result.title).not.toMatch(/this device may not do that/i);
    expect(useSystemStore.getState().voices).toHaveLength(voices.length);
  });
});

describe("system-store wired through SystemRepo in live mode (Milestone-4 blocker 1)", () => {
  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    reset();
  });

  function liveBundleWith(system: Partial<RepoBundle["system"]>): RepoBundle {
    return {
      ...demoRepoBundle,
      system: {
        // Spread the demo repo first so a method added to SystemRepo later does
        // not break this fixture. It enumerated the interface by hand and went
        // stale the moment getTelemetry landed.
        ...demoRepoBundle.system,
        getBackupStatus: async () => ({
          enabled: true,
          lastBackupAt: null,
          sizeBytes: 0,
          progressPct: null,
        }),
        runBackup: async () => ({ enabled: true, lastBackupAt: null, sizeBytes: 0, progressPct: null }),
        restoreBackup: async () => false,
        listVoices: async () => [],
        listFaces: async () => [],
        forgetEnrolled: async () => false,
        ...system,
      },
    };
  }

  it("load() resolves with whatever the currently-configured repository returns, not the demo seed", async () => {
    const backup: BackupStatus = { enabled: false, lastBackupAt: "2026-08-01T00:00:00.000Z", sizeBytes: 123, progressPct: null };
    const voices: VoiceProfile[] = [{ id: "live-v1", name: "Real", sampleCount: null, enrolledAt: "2026-08-01T00:00:00.000Z", lastHeardAt: null }];
    const faces: FaceProfile[] = [{ id: "live-f1", name: "Real", encodingCount: null, metAt: "2026-08-01T00:00:00.000Z", lastSeenAt: null }];
    configureRepos("live", liveBundleWith({
      getBackupStatus: async () => backup,
      listVoices: async () => voices,
      listFaces: async () => faces,
    }));

    await useSystemStore.getState().load();

    const s = useSystemStore.getState();
    expect(s.status).toBe("ready");
    expect(s.backup).toEqual(backup);
    expect(s.voices).toEqual(voices);
    expect(s.faces).toEqual(faces);
  });

  it("load() reaches the error branch when the repository rejects", async () => {
    configureRepos("live", liveBundleWith({
      getBackupStatus: async () => {
        throw new Error("simulated daemon failure");
      },
    }));

    await useSystemStore.getState().load();
    expect(useSystemStore.getState().status).toBe("error");
  });

  /**
   * PROOF-OF-FAILURE: this used to set `progressPct: 0` around the live call
   * as an optimistic "something is happening" flag, contradicting
   * SystemRepo.runBackup's own contract ("progressPct stays null ... a caller
   * that wants a running indicator holds its own pending flag") and making
   * BackupPanel draw a progressbar at aria-valuenow=0.
   */
  it("live runBackup() holds its own pending flag and never invents a progressPct", async () => {
    let finish!: (v: BackupStatus) => void;
    configureRepos("live", liveBundleWith({
      runBackup: () => new Promise<BackupStatus>((resolve) => { finish = resolve; }),
    }));

    const pending = useSystemStore.getState().runBackup();
    await Promise.resolve();
    expect(useSystemStore.getState().backupRunning).toBe(true);
    expect(useSystemStore.getState().backup.progressPct).toBeNull();

    // The single-flight guard reads that flag now, not progressPct.
    const refused = await useSystemStore.getState().runBackup();
    expect(refused.ok).toBe(false);

    finish({ enabled: true, lastBackupAt: null, sizeBytes: 0, progressPct: null });
    await pending;
    expect(useSystemStore.getState().backupRunning).toBe(false);
  });

  it("runBackup() catches a rejection and reports failure instead of throwing", async () => {
    configureRepos("live", liveBundleWith({
      runBackup: async () => {
        throw new Error("simulated daemon failure");
      },
    }));

    const result = await useSystemStore.getState().runBackup();
    expect(result.ok).toBe(false);
    expect(useSystemStore.getState().backup.progressPct).toBeNull();
  });

  it("restoreBackup() goes through the daemon, not any client-side secret", async () => {
    configureRepos("live", liveBundleWith({ restoreBackup: async () => true }));
    const result = await useSystemStore.getState().restoreBackup("whatever the user typed");
    expect(result.ok).toBe(true);
  });

  /**
   * The repository resolves `false` for the route's 400, and
   * routes/system.py:99-105 raises that same 400 for a wrong phrase AND for
   * an archive it could not read -- its own comment says so. The store used
   * to resolve that ambiguity into "That phrase is not hers", accusing the
   * user of mistyping a secret that may have been perfectly correct and
   * sending them to hunt for a better copy of it.
   */
  it("restoreBackup() reports a refused restore without blaming the phrase for it", async () => {
    configureRepos("live", liveBundleWith({ restoreBackup: async () => false }));
    const result = await useSystemStore.getState().restoreBackup("wrong");
    expect(result.ok).toBe(false);
    expect(result.title).not.toMatch(/not hers/i);
    // True of both causes the daemon collapses into that one 400.
    expect(result.detail).toMatch(/archive cannot be read/i);
    expect(result.detail).toMatch(/nothing was restored/i);
  });

  it("restoreBackup() surfaces a network failure distinctly from a refused restore", async () => {
    configureRepos("live", liveBundleWith({
      restoreBackup: async () => {
        throw new Error("simulated network failure");
      },
    }));
    const result = await useSystemStore.getState().restoreBackup("shape does not matter here");
    expect(result.ok).toBe(false);
    expect(result.title).toMatch(/could not restore/i);
  });

  // POST /v1/backup/restore is gated on system_control (routes/system.py:98).
  // A device that simply lacks the grant must not read as a broken archive --
  // before this, every throw collapsed into "Could not restore".
  it("restoreBackup() names a 403 as a missing device grant", async () => {
    configureRepos("live", liveBundleWith({
      restoreBackup: async () => {
        throw new ApiError(403, "forbidden");
      },
    }));
    const result = await useSystemStore.getState().restoreBackup(A_WELL_FORMED_PHRASE);
    expect(result.ok).toBe(false);
    expect(result.title).toMatch(/this device may not do that/i);
    expect(result.detail).not.toMatch(/forbidden/i);
  });
});

/**
 * Milestone 5b, Task 12. Both transports write one slice, so staleness lives
 * in the slice too -- neither `hooks/useLiveTelemetry.ts` nor
 * `hooks/useEventStream.ts` needs to know the other exists, and a fix in one
 * would otherwise leave the other still showing a dead machine's numbers.
 */
describe("telemetry staleness", () => {
  const A_READING: TelemetrySnapshot = {
    cpuPercent: 41,
    ramPercent: 62,
    batteryPercent: 87,
    activeModel: "gemini-flash-lite",
    uptimeSeconds: 3600,
  };

  beforeEach(reset);

  it("stamps when a reading landed and starts un-stale", () => {
    const before = Date.now();
    useSystemStore.getState().setTelemetry(A_READING);
    const s = useSystemStore.getState();
    expect(s.telemetryStatus).toBe("ready");
    expect(s.telemetryAt).toBeGreaterThanOrEqual(before);
    expect(s.telemetryMisses).toBe(0);
    expect(selectTelemetryStale(s)).toBe(false);
  });

  it("one dropped tick is not staleness -- the meters keep the last reading", () => {
    useSystemStore.getState().setTelemetry(A_READING);
    useSystemStore.getState().markTelemetryUnavailable();
    const s = useSystemStore.getState();
    expect(s.telemetry).toEqual(A_READING);
    expect(s.telemetryStatus).toBe("ready");
    expect(selectTelemetryStale(s)).toBe(false);
  });

  it("PROOF-OF-FAILURE: a sustained outage stops the reading being presented as current", () => {
    // Before this task the store had no counter at all: markTelemetryUnavailable
    // was a no-op whenever anything had ever landed, so a stopped daemon left
    // telemetryStatus "ready" and "cpu 41%" on screen indefinitely.
    useSystemStore.getState().setTelemetry(A_READING);
    for (let i = 0; i < TELEMETRY_STALE_AFTER_MISSES; i += 1) {
      useSystemStore.getState().markTelemetryUnavailable();
    }
    const s = useSystemStore.getState();
    expect(selectTelemetryStale(s)).toBe(true);
    // Kept, not blanked: the number is still the last true thing she said.
    expect(s.telemetry).toEqual(A_READING);
    expect(s.telemetryAt).not.toBeNull();
  });

  it("a pushed socket frame clears staleness exactly as a fetched one does", () => {
    // useEventStream.ts calls the same setTelemetry as useLiveTelemetry.ts's
    // poll, which is the whole reason there is one slice.
    useSystemStore.getState().setTelemetry(A_READING);
    for (let i = 0; i < TELEMETRY_STALE_AFTER_MISSES; i += 1) {
      useSystemStore.getState().markTelemetryUnavailable();
    }
    expect(selectTelemetryStale(useSystemStore.getState())).toBe(true);

    useSystemStore.getState().setTelemetry({ ...A_READING, cpuPercent: 9 });
    const s = useSystemStore.getState();
    expect(selectTelemetryStale(s)).toBe(false);
    expect(s.telemetryMisses).toBe(0);
    expect(s.telemetry?.cpuPercent).toBe(9);
  });

  it("still reaches the error branch when nothing has ever landed", () => {
    useSystemStore.getState().markTelemetryUnavailable();
    const s = useSystemStore.getState();
    expect(s.telemetryStatus).toBe("error");
    expect(s.telemetry).toBeNull();
  });

  it("every failed attempt is a state change, so a card can redraw its age label", () => {
    // The reason this counts rather than only comparing `telemetryAt` to the
    // clock: nothing re-renders on the passage of time.
    useSystemStore.getState().setTelemetry(A_READING);
    const first = useSystemStore.getState();
    useSystemStore.getState().markTelemetryUnavailable();
    expect(useSystemStore.getState()).not.toBe(first);
    expect(useSystemStore.getState().telemetryMisses).toBe(1);
  });
});

/**
 * Two writers, one slice, two cadences: hooks/useLiveTelemetry.ts polls every
 * 5s and hooks/useEventStream.ts pushes every 2s. `TelemetryPayload` carries no
 * timestamp in either transport (checked against the daemon's payloads.py and
 * openapi.json), so the ONLY thing available to sequence on is when each writer
 * asked -- which is why setTelemetry takes `issuedAt` rather than reading the
 * clock at write time.
 */
describe("telemetry sequencing", () => {
  const A_READING: TelemetrySnapshot = {
    cpuPercent: 41,
    ramPercent: 62,
    batteryPercent: 87,
    activeModel: "gemini-flash-lite",
    uptimeSeconds: 3600,
  };

  beforeEach(reset);

  it("PROOF-OF-FAILURE: a slow poll cannot overwrite a newer socket frame, nor stamp its own sample 'now'", () => {
    const T = Date.now();

    // The socket frames at T+2s and T+4s land while a poll issued at T is
    // still in flight.
    useSystemStore.getState().setTelemetry({ ...A_READING, cpuPercent: 70 }, T + 2000);
    useSystemStore.getState().setTelemetry({ ...A_READING, cpuPercent: 74 }, T + 4000);

    // The poll finally resolves at T+3s with the sample it asked for at T.
    // Before this fix it wrote unconditionally with `telemetryAt: Date.now()`:
    // the meter stepped backwards to a three-second-old number AND presented
    // it as the current one.
    useSystemStore.getState().setTelemetry({ ...A_READING, cpuPercent: 12 }, T);

    const s = useSystemStore.getState();
    expect(s.telemetry?.cpuPercent).toBe(74);
    expect(s.telemetryAt).toBe(T + 4000);
  });

  it("accepts a reading issued after the one on screen, and dates it by when it was asked for", () => {
    const T = Date.now();
    useSystemStore.getState().setTelemetry(A_READING, T);
    useSystemStore.getState().setTelemetry({ ...A_READING, cpuPercent: 12 }, T + 1000);

    const s = useSystemStore.getState();
    expect(s.telemetry?.cpuPercent).toBe(12);
    // Not Date.now(): a reading is as old as the request that produced it.
    expect(s.telemetryAt).toBe(T + 1000);
  });

  it("defaults to now for a caller with nothing older to declare -- the socket keeps calling it with one argument", () => {
    const before = Date.now();
    useSystemStore.getState().setTelemetry(A_READING);
    expect(useSystemStore.getState().telemetryAt).toBeGreaterThanOrEqual(before);
  });

  it("a dropped write changes nothing at all -- not the reading, not the miss count", () => {
    const T = Date.now();
    useSystemStore.getState().setTelemetry(A_READING, T + 4000);
    useSystemStore.getState().markTelemetryUnavailable();
    const misses = useSystemStore.getState().telemetryMisses;

    useSystemStore.getState().setTelemetry({ ...A_READING, cpuPercent: 12 }, T);

    const s = useSystemStore.getState();
    expect(s.telemetry).toEqual(A_READING);
    expect(s.telemetryMisses).toBe(misses);
  });

  it("the first reading is never dropped, whatever it claims about when it was issued", () => {
    // telemetryAt is null until something lands, so there is nothing to
    // regress against -- an old-looking first sample is still the only one.
    useSystemStore.getState().setTelemetry(A_READING, 0);
    expect(useSystemStore.getState().telemetry).toEqual(A_READING);
  });
});

/**
 * Milestone 5b, Task 12. `getRepoMode()` is `RepoMode | null`; null means
 * configureRepos() has not run. Every demo branch here used to be spelled
 * `!== "live"`, which handed that case the demo path -- so an unbound registry
 * would have answered from seed data as if it had asked her. getRepos() fails
 * closed with a throw; these branches now agree with it.
 */
describe("an unconfigured registry takes the live path, not the demo one", () => {
  beforeEach(() => {
    reset();
    resetRepos();
  });

  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    reset();
  });

  it("load() fails rather than resolving the seed", async () => {
    await useSystemStore.getState().load();
    expect(useSystemStore.getState().status).toBe("error");
  });

  it("runBackup() reports a failure rather than animating a scripted one", async () => {
    const result = await useSystemStore.getState().runBackup();
    expect(result.ok).toBe(false);
    expect(useSystemStore.getState().backupRunning).toBe(false);
  });

  it("PROOF-OF-FAILURE: restoreBackup() no longer accepts any eight words with no network call", async () => {
    // The worst of the three: this branch answered "Restored from backup" to
    // a well-formed phrase it had verified against nothing at all.
    const result = await useSystemStore.getState().restoreBackup(A_WELL_FORMED_PHRASE);
    expect(result.ok).toBe(false);
    expect(result.title).not.toMatch(/restored/i);
  });
});

describe("a refresh must not blank an already-loaded panel", () => {
  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
    useSystemStore.setState(useSystemStore.getInitialState());
  });

  it("PROOF-OF-FAILURE: load() keeps status ready while re-reading", async () => {
    // unlockBackup() calls load() to re-read `unlocked` rather than assuming
    // success. When load() flipped to "loading", BackupPanel returned its
    // skeleton, which unmounted the open unlock dialog and destroyed its
    // local state -- the dialog remounted blank, so a successful unlock
    // looked like nothing had happened and the user unlocked twice. Seen live
    // on 2026-08-10.
    const seen: string[] = [];
    useSystemStore.setState({ status: "ready" });
    const unsub = useSystemStore.subscribe((s) => seen.push(s.status));

    await useSystemStore.getState().load();
    unsub();

    expect(seen).not.toContain("loading");
    expect(useSystemStore.getState().status).toBe("ready");
  });

  it("still blanks on a first load, where there is nothing to preserve", async () => {
    const seen: string[] = [];
    expect(useSystemStore.getState().status).toBe("idle");
    const unsub = useSystemStore.subscribe((s) => seen.push(s.status));

    await useSystemStore.getState().load();
    unsub();

    expect(seen).toContain("loading");
  });
});
