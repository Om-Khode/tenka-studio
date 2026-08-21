import { create } from "zustand";
import { getRepos, getRepoMode } from "@/services/repo-registry";
import { ApiError } from "@/services/http";
import type { ActionResult } from "@/types/action";
import type { LoadStatus } from "@/types/action";
import type { BackupStatus, FaceProfile, TelemetrySnapshot, VoiceProfile } from "@/types/system";

/** Fixed epoch, as everywhere else in the demo data. */
const EPOCH = Date.UTC(2026, 6, 1);
const DAY = 86_400_000;
const iso = (dayOffset: number) => new Date(EPOCH + dayOffset * DAY).toISOString();

/**
 * The word counts a BIP39 mnemonic can legally have: 128/160/192/224/256 bits
 * of entropy plus its checksum, in 11-bit words.
 *
 * This is the format's own arithmetic, not a guess at what TENKA generates.
 * The constant this replaced said 8 -- a count BIP39 cannot produce at all --
 * so the gate below admitted only phrases `Mnemonic().check()` was certain to
 * reject (io/backup/crypto.py:27-32) and blocked every phrase it could
 * accept. Restoring a real backup was impossible, and the user was told their
 * own recovery phrase was the wrong length.
 *
 * Deliberately NOT `12` (what `_MNEMONIC_STRENGTH_BITS = 128` yields today):
 * that would re-create the same coupling one number over, and the next
 * strength bump would break restore again in exactly this way. The daemon
 * remains the only authority on whether a phrase is hers -- this list is the
 * widest gate that still rejects an empty field or a stray paste.
 */
export const BIP39_WORD_COUNTS: readonly number[] = [12, 15, 18, 21, 24];

/**
 * Said as a fact about the FORMAT, never about her instance. "Her recovery
 * phrase is N words" is a claim only the daemon that generated it can make,
 * and Studio has no route that asks.
 */
export const RECOVERY_PHRASE_SHAPE_HINT = `A recovery phrase is ${BIP39_WORD_COUNTS.slice(0, -1).join(", ")} or ${BIP39_WORD_COUNTS[BIP39_WORD_COUNTS.length - 1]} words.`;

export const BACKUP_TICK_MS = 120;
const BACKUP_TICKS = 10;

/**
 * How many consecutive missed telemetry attempts before the last reading stops
 * being presented as current.
 *
 * Three, against hooks/useLiveTelemetry.ts's 5s poll, is ~15 seconds of
 * silence -- and that arithmetic only became true when that hook was changed to
 * share ONE poll loop across every component that mounts it. Two cards mount it
 * on /app, so before that fix each miss was counted twice per interval and this
 * threshold fired at ~7.5s, with the real meaning of the number shifting every
 * time a card was added. One dropped tick is noise -- a GC pause on her machine, a
 * reconnecting socket -- and blanking the meters for it would be worse than
 * showing a five-second-old number. Three in a row is not noise: the daemon is
 * stopped, the laptop is asleep, or the token was revoked. Keeping "cpu 41%"
 * on screen as fact after that is the failure; the card dims and says when it
 * last heard from her instead.
 */
export const TELEMETRY_STALE_AFTER_MISSES = 3;

/** True once the last reading has gone unrefreshed for that many attempts. */
export function selectTelemetryStale(state: Pick<SystemState, "telemetryMisses">): boolean {
  return state.telemetryMisses >= TELEMETRY_STALE_AFTER_MISSES;
}

/**
 * Word count only -- NOT a security check, and nothing to compare the input
 * against. Milestone-4 blocker 4 deleted `VALID_RECOVERY_PHRASE`, the
 * hardcoded string this used to compare against with `===`: it shipped in
 * the public JS bundle, so ANY live Studio user could have typed it to
 * restore (i.e. overwrite) a real assistant's memory, regardless of that
 * instance's actual recovery phrase. The real check now happens exactly
 * once, server-side, inside restoreBackup()'s one network round trip (or,
 * in demo mode, this same word-count heuristic -- there is no daemon to ask,
 * and nothing here is a secret worth protecting).
 *
 * It accepts EVERY BIP39-legal length rather than one of them, so the gate
 * can never be narrower than what the daemon will take: a client that
 * refuses a phrase the daemon would have accepted has broken restore, and
 * it does so silently, without a request the user could see fail.
 */
export function looksLikeRecoveryPhrase(phrase: string): boolean {
  return BIP39_WORD_COUNTS.includes(phrase.trim().split(/\s+/).filter(Boolean).length);
}

export interface SystemState {
  status: LoadStatus;
  backup: BackupStatus;
  voices: VoiceProfile[];
  faces: FaceProfile[];

  /**
   * The machine's last known telemetry, and ONE slice for it (milestone 5b,
   * Task 10). Two sources write it: hooks/useLiveTelemetry.ts's poll of
   * `GET /v1/telemetry`, which seeds it before any socket frame arrives, and
   * hooks/useEventStream.ts's `telemetry` frames, which keep it moving after.
   * The daemon builds both from the same `telemetry_body()`, so they are the
   * same reading through two transports -- giving the socket its own copy
   * would leave the dashboard rendering whichever one it happened to read,
   * with the other updating invisibly beside it. Null until the first of the
   * two lands; nothing in demo mode writes it (the demo's meters are
   * demo-engine's, store-internal, exactly as before).
   */
  telemetry: TelemetrySnapshot | null;
  /**
   * Tracked separately from `status` above, which covers backup/enrolment:
   * telemetry has its own two sources and its own failure mode, and folding
   * the two would make a failed telemetry poll blank the backup panel.
   */
  telemetryStatus: LoadStatus;
  /**
   * Epoch ms of the last reading, whichever transport delivered it. Null until
   * the first one lands. This is what lets a card say WHEN, rather than
   * presenting a snapshot with no time on it as current fact.
   */
  telemetryAt: number | null;
  /**
   * Consecutive failed telemetry attempts since the last reading, reset to 0
   * by `setTelemetry` from either transport.
   *
   * Why a counter and not just an age check: nothing re-renders on the passage
   * of time. With only `telemetryAt`, a dead daemon would leave the card
   * showing "cpu 41%" with no further state change to redraw it -- the exact
   * bug this fixes. Every failed poll bumps this, which IS a state change, so
   * the card re-renders and its "last seen" label recomputes from
   * `telemetryAt`. It is also the more honest signal: a miss is a detected
   * failure, not merely elapsed time.
   */
  telemetryMisses: number;

  /**
   * The caller-held pending flag `SystemRepo.runBackup()`'s own doc requires:
   * `POST /v1/backup/run` blocks and answers once, so `progressPct` is null
   * for the entire live run and cannot say "something is happening". Live
   * mode used to set `progressPct: 0` as a stand-in, which BackupPanel
   * rendered as a real progressbar stuck at `aria-valuenow=0` -- a
   * measurement of nothing, announced to assistive tech as one. This flag is
   * true for both modes' runs; only demo also has a `progressPct` to draw.
   */
  backupRunning: boolean;

  /**
   * Milestone-4 blocker 1: this store had no LoadStatus at all before this
   * task, so BackupPanel and EnrollmentPanel always assumed their data was
   * present -- fine while it was seeded synchronously, a lie once /app
   * renders the same components over data that has to be fetched and can
   * fail. Demo keeps its data seeded below, store-internal, exactly as
   * before (DemoSystemRepo's methods are placeholders, not a second source
   * of truth -- see services/repos/demo/system.ts); load() only flips
   * status there. Live mode actually fetches through SystemRepo.
   */
  load: () => Promise<void>;
  /**
   * The one writer both transports call. Clears staleness as a side effect,
   * so a pushed socket frame revives the card exactly as a fetched one does --
   * neither transport needs to know the other exists.
   *
   * `issuedAt` is when the reading was ASKED FOR, not when the caller got
   * around to writing it, and it defaults to now for a caller (the socket) that
   * has nothing older to declare. It exists because the two transports run at
   * different cadences over the same slice: a 5s poll issued at T and resolving
   * at T+3s -- a loaded machine, i.e. exactly when CPU telemetry is worth
   * reading -- would otherwise overwrite the T+2s and T+4s socket frames with a
   * three-second-old sample AND stamp it `telemetryAt: Date.now()`, so the
   * meter visibly steps backwards while claiming to be current. Nothing on the
   * wire can settle this for us: `TelemetryPayload` carries cpu/ram/battery/
   * activeModel/uptime and no timestamp, in either transport. A write whose
   * `issuedAt` predates the reading already on screen is dropped.
   */
  setTelemetry: (snapshot: TelemetrySnapshot, issuedAt?: number) => void;
  /**
   * One failed attempt. Deliberately does not clear `telemetry`: a single
   * dropped tick against a reading from five seconds ago is not a reason to
   * blank the meters. It reaches the error branch only when nothing has ever
   * landed; otherwise it counts, and `selectTelemetryStale` decides when the
   * counting has gone on long enough to stop calling the reading current.
   */
  markTelemetryUnavailable: () => void;
  setBackupEnabled: (enabled: boolean) => void;
  runBackup: () => Promise<ActionResult>;
  restoreBackup: (phrase: string) => Promise<ActionResult>;
  /** Arms her backup key for this session. See SystemRepo.unlockBackup: the key
   * dies on every restart, and while it is gone every scheduled backup is
   * skipped. */
  unlockBackup: (phrase: string) => Promise<ActionResult>;
  forgetVoice: (id: string) => Promise<ActionResult>;
  forgetFace: (id: string) => Promise<ActionResult>;
}

/** The three fields backup/enrolment panels render, as one shape. */
type SystemData = Pick<SystemState, "backup" | "voices" | "faces">;

/**
 * The demo tree's backup and enrolment figures. A factory rather than three
 * module-level literals because `load()`'s demo branch now WRITES it, and it
 * had to be writable from `resetLoadGates()`'s side of the fence too.
 *
 * Why that matters: these used to be initial-state literals and nothing ever
 * re-seeded them. `/app/settings` overwrites all three with the daemon's real
 * values, `services/persist.ts`'s `resetLoadGates()` reset the load GATE but
 * not the data, and this store's demo branch flipped straight to
 * `status: "ready"` and returned without writing anything -- so a client-side
 * navigation into `/demo/settings` after using `/app/settings` rendered the
 * real user's enrolled voice and face NAMES and their real backup size under
 * demo chrome. The skeleton gate could not help: the demo path resolves inside
 * the calling tick, with no loading frame to cover.
 */
export function demoSystemSeed(): SystemData {
  return {
    backup: {
      enabled: true,
      lastBackupAt: iso(33),
      sizeBytes: 41_000_000,
      progressPct: null,
    },
    // Invented names, and they must stay invented: enrolled voices and faces
    // are the most personal rows in this seed, and this seed ships in the
    // public demo build. Same fiction as store/memory-scripts.ts's graph.
    voices: [
      { id: "v1", name: "Kirigaya", sampleCount: 8, enrolledAt: iso(0), lastHeardAt: iso(34) },
      { id: "v2", name: "Sakuta", sampleCount: 3, enrolledAt: iso(22), lastHeardAt: iso(26) },
    ],
    faces: [
      { id: "f1", name: "Kirigaya", encodingCount: 5, metAt: iso(0), lastSeenAt: iso(34) },
      { id: "f2", name: "Sakuta", encodingCount: 2, metAt: iso(22), lastSeenAt: null },
    ],
  };
}

/**
 * Everything this store holds ABOUT A MACHINE, back to what it held before
 * anything asked one -- for `services/persist.ts` to write on a mode
 * transition, alongside the `status`/`telemetryStatus` gates that make the
 * panels ask again.
 *
 * backup/voices/faces go back to the demo seed rather than to empty because
 * this store's initial data IS demo's: `/demo`'s `load()` has nothing to fetch
 * and resolves inside its calling tick, so a blank would leave BackupPanel and
 * EnrollmentPanel showing an empty machine with no loading frame to explain it.
 * The live direction is safe for the opposite reason -- both panels render only
 * on `status === "ready"`, and this is written together with `status: "idle"`,
 * so the seed sits behind their skeleton until a real fetch replaces it or the
 * error branch takes over.
 *
 * Telemetry does go blank: its cards render from `data`, and nothing
 * re-renders on the passage of time, so a live -> demo -> live transition
 * otherwise left the pre-switch CPU reading on screen undimmed, with
 * `stale === false`, until three fresh misses had accumulated against it.
 */
export function resetSystemData(): SystemData &
  Pick<SystemState, "telemetry" | "telemetryStatus" | "telemetryAt" | "telemetryMisses"> {
  return {
    ...demoSystemSeed(),
    telemetry: null,
    telemetryStatus: "idle",
    telemetryAt: null,
    telemetryMisses: 0,
  };
}

/**
 * Deliberately NOT persisted. Backup progress and enrollment belong to the
 * machine, not to this browser -- a reload showing "40% done" would be a lie.
 */
export const useSystemStore = create<SystemState>((set, get) => ({
  status: "idle",
  backupRunning: false,

  telemetry: null,
  telemetryStatus: "idle",
  telemetryAt: null,
  telemetryMisses: 0,

  ...demoSystemSeed(),

  load: async () => {
    // Only blank the pane on a FIRST load. A refresh of already-loaded data
    // flipping back to "loading" makes BackupPanel/EnrollmentPanel return
    // their skeleton, which unmounts everything below them -- including an
    // open dialog and its local state. That is not hypothetical: unlocking
    // the backup key calls load() to re-read `unlocked`, and the unlock
    // dialog vanished and remounted blank mid-flow, so a successful unlock
    // looked like a no-op and the user tried again.
    //
    // "error" still blanks: after a failed load there is nothing trustworthy
    // on screen to preserve.
    if (get().status !== "ready") set({ status: "loading" });
    // `=== "demo"`, not `!== "live"` (Task 12). getRepoMode() is
    // `RepoMode | null`, and null means configureRepos() has not run -- an
    // unbound registry, which getRepos() deliberately fails CLOSED on with a
    // throw. Testing for "not live" handed that case the demo path instead,
    // so an unconfigured Studio would have answered from seed data as if it
    // had asked her. Not reachable today (both layouts bind synchronously),
    // but the demo branch should be the one that has to prove itself.
    if (getRepoMode() === "demo") {
      // Demo's backup/voices/faces come from demoSystemSeed() above, not from
      // a second copy behind DemoSystemRepo (whose methods are unwired
      // placeholders -- see that file's own doc comment). Nothing to fetch;
      // just unblock the skeleton branch.
      //
      // This branch does NOT re-seed, deliberately -- `resetSystemData()`,
      // written by services/persist.ts on every mode transition, is what puts
      // the seed back, and it is the only place that knows a transition
      // happened. Re-seeding here as well would overwrite any state a caller
      // set up before mounting a panel, which is how BackupPanel's and
      // EnrollmentPanel's tests inject the cases they are about. Leaving the
      // data alone entirely was the actual bug (real enrolment names under demo
      // chrome); doing it on the transition fixes that without making load() a
      // second writer of the same values.
      //
      // No await before this point, so this resolves synchronously within the
      // calling tick -- BackupPanel/EnrollmentPanel's existing synchronous
      // tests never see a loading frame.
      set({ status: "ready" });
      return;
    }
    try {
      const [backup, voices, faces] = await Promise.all([
        getRepos().system.getBackupStatus(),
        getRepos().system.listVoices(),
        getRepos().system.listFaces(),
      ]);
      set({ backup, voices, faces, status: "ready" });
    } catch {
      // An uncaught rejection would otherwise leave status stuck on
      // "loading" forever instead of reaching the error branch
      // BackupPanel/EnrollmentPanel now render for it.
      set({ status: "error" });
    }
  },

  setTelemetry: (snapshot, issuedAt = Date.now()) =>
    set((s) => {
      // A reading asked for BEFORE the one already on screen is not news, it
      // is a slow answer to an older question -- accepting it would replace a
      // fresher sample and then stamp the older one "now". Dropped entirely
      // rather than merged: the misses counter is already 0 (something newer
      // landed to make it so), so there is nothing here worth a re-render.
      if (s.telemetryAt !== null && issuedAt < s.telemetryAt) return {};
      return {
        telemetry: snapshot,
        telemetryStatus: "ready",
        telemetryAt: issuedAt,
        telemetryMisses: 0,
      };
    }),

  markTelemetryUnavailable: () =>
    set((s) => ({
      telemetryMisses: s.telemetryMisses + 1,
      ...(s.telemetry === null ? { telemetryStatus: "error" as LoadStatus } : {}),
    })),

  /**
   * Demo-only, and BackupPanel disables the control that calls it in live
   * mode. The daemon has no route for it: openapi.json exposes `GET
   * /v1/backup`, `POST /v1/backup/run` and `POST /v1/backup/restore` and
   * nothing that writes `enabled`, and `GET /v1/settings` carries no backup
   * key either (store/settings-registry.ts has none to merge against). Left
   * live, this flipped the Switch, told the daemon nothing, and reverted on
   * the next load() -- a control that looks like it works and doesn't.
   */
  setBackupEnabled: (enabled) => set((s) => ({ backup: { ...s.backup, enabled } })),

  runBackup: async () => {
    // Single-flight: two interleaved runs would fight over progressPct, and
    // the first to finish would clear it while the second still ran. Keyed
    // on backupRunning rather than progressPct now that live has no progress
    // to key on -- one guard covering both modes.
    if (get().backupRunning) {
      return { ok: false, title: "Already backing up", detail: "Let the current one finish." };
    }

    // `=== "demo"`: see load()'s note. An unbound registry falls through to
    // the live path below and fails there, rather than animating a fake
    // progress bar and reporting a backup that never happened.
    if (getRepoMode() === "demo") {
      // Demo's scripted tick loop, unchanged from before this task -- the
      // real backup call (below) has no partial-progress signal to animate,
      // but this loop is tested, working behaviour and stays exactly as it
      // was.
      set((s) => ({ backupRunning: true, backup: { ...s.backup, progressPct: 0 } }));
      try {
        for (let tick = 1; tick <= BACKUP_TICKS; tick += 1) {
          await new Promise((resolve) => setTimeout(resolve, BACKUP_TICK_MS));
          set((s) => ({ backup: { ...s.backup, progressPct: (tick / BACKUP_TICKS) * 100 } }));
        }
        set((s) => ({ backup: { ...s.backup, lastBackupAt: iso(35) } }));
        return { ok: true, title: "Backed up", detail: "Encrypted and uploaded." };
      } finally {
        set((s) => ({ backupRunning: false, backup: { ...s.backup, progressPct: null } }));
      }
    }

    // Live: POST /v1/backup/run blocks until the backup finishes and answers
    // once with the final state -- no partial progress exists on the wire
    // (SystemRepo.runBackup's own doc: "progressPct stays null ... a caller
    // that wants a running indicator holds its own pending flag"). So this
    // holds backupRunning and leaves progressPct alone; setting it to 0 here
    // used to make BackupPanel draw a progressbar pinned at aria-valuenow=0,
    // a measurement of something nobody is measuring.
    set({ backupRunning: true });
    try {
      const backup = await getRepos().system.runBackup();
      set({ backup });
      return { ok: true, title: "Backed up", detail: "Encrypted and uploaded." };
    } catch (err) {
      // A 409 here has exactly one cause worth naming: orchestrator.run_backup
      // raises RuntimeError("Backup key is not unlocked ...") when no recovery
      // phrase has unlocked the key this session, and errors.py maps every
      // RuntimeError to the deliberately generic "precondition failed" so the
      // daemon never leaks its internals. That is the right call server-side
      // and it left the user reading "precondition failed" with no idea what
      // to do. Studio knows this domain, so it can say the actionable thing
      // without the daemon disclosing anything.
      if (err instanceof ApiError && err.status === 409) {
        return {
          ok: false,
          title: "Backup key is locked",
          detail: "She needs the recovery phrase to unlock it before she can back up.",
        };
      }
      if (err instanceof ApiError && err.status === 403) {
        return {
          ok: false,
          title: "This device may not do that",
          detail: "Backing up needs a grant this device doesn't have.",
        };
      }
      // 502 is her reaching the storage provider and failing -- an expired
      // OAuth token, no network, a full quota. Distinct from "she is
      // unreachable" (a thrown network error, below), which is what this
      // looked like before the daemon mapped it: an unhandled 500 skipped the
      // CORS middleware, so the browser reported it as unreachable and Studio
      // blamed the wrong end of the connection.
      if (err instanceof ApiError && err.status === 502) {
        return {
          ok: false,
          title: "She could not reach the backup storage",
          detail:
            "Her provider refused the upload — often an expired sign-in. Check her console for the provider's own error.",
        };
      }
      return {
        ok: false,
        title: "Backup failed",
        detail: err instanceof Error ? err.message : undefined,
      };
    } finally {
      set({ backupRunning: false });
    }
  },

  /**
   * Milestone-4 blocker 4. Demo has no daemon to ask, so it falls back to
   * the same word-count heuristic the dialog already screened the input
   * with -- not a real check, but demo mutates nothing real either way.
   * Live goes through SystemRepo.restoreBackup(), which is the daemon's one
   * real verify-and-restore round trip.
   *
   * `false` is NOT "that phrase is not hers". The repository resolves false
   * for the route's 400, and routes/system.py:99-105 raises that same 400
   * for a wrong phrase AND for a backup it could not read -- its own comment
   * says so ("the phrase was wrong (or the backup unreadable)"). Naming the
   * phrase accuses the user of mistyping a secret they may well have typed
   * correctly, and sends them off to hunt for a better copy of a phrase that
   * was never the problem. The wording below is true of both causes.
   *
   * A thrown 403 is a third thing again -- the route is gated on
   * `system_control` -- and gets memory's and enrolment's wording, so a
   * device that simply lacks the grant does not read as a broken archive.
   */
  restoreBackup: async (phrase) => {
    // `=== "demo"` matters most here of the three: this branch answers
    // "Restored from backup" to any well-shaped phrase with no network call
    // at all. Reached with an unbound registry it would have been a
    // destructive-sounding success that verified nothing against anything.
    if (getRepoMode() === "demo") {
      await new Promise((resolve) => setTimeout(resolve, BACKUP_TICK_MS * 3));
      return looksLikeRecoveryPhrase(phrase)
        ? { ok: true, title: "Restored from backup", detail: "She is back to that snapshot." }
        : {
            // Demo screens shape and nothing else, so it may only report
            // shape. It has no phrase to compare against and no daemon to
            // ask, and claiming otherwise is the same lie one layer down.
            ok: false,
            title: "That is not the shape of a recovery phrase",
            detail: `${RECOVERY_PHRASE_SHAPE_HINT} Nothing was restored.`,
          };
    }

    try {
      const restored = await getRepos().system.restoreBackup(phrase);
      return restored
        ? { ok: true, title: "Restored from backup", detail: "She is back to that snapshot." }
        : {
            ok: false,
            title: "She could not open that backup",
            detail:
              "Either the phrase is not hers or the archive cannot be read. Nothing was restored.",
          };
    } catch (err) {
      const denied = err instanceof ApiError && err.status === 403;
      return {
        ok: false,
        title: denied ? "This device may not do that" : "Could not restore",
        detail: denied
          ? "Restoring a backup needs a grant this device doesn't have."
          : err instanceof Error
            ? err.message
            : undefined,
      };
    }
  },

  unlockBackup: async (phrase) => {
    if (getRepoMode() === "demo") {
      // Demo has no key to arm, so it screens shape and says so -- the same
      // rule restoreBackup's demo branch follows. It must not claim to have
      // unlocked anything, because there is nothing here to unlock.
      return looksLikeRecoveryPhrase(phrase)
        ? { ok: true, title: "Unlocked", detail: "Backups can run again." }
        : {
            ok: false,
            title: "That is not the shape of a recovery phrase",
            detail: `${RECOVERY_PHRASE_SHAPE_HINT} Nothing was unlocked.`,
          };
    }

    try {
      const unlocked = await getRepos().system.unlockBackup(phrase);
      if (!unlocked) {
        return {
          ok: false,
          title: "That is not the shape of a recovery phrase",
          detail: `${RECOVERY_PHRASE_SHAPE_HINT} Nothing was unlocked.`,
        };
      }
      // Re-read rather than assuming: the daemon owns `unlocked`, and the
      // panel's paused banner keys on it. Assuming success here would clear
      // the warning on a machine that is still not backing up, which is the
      // failure this whole feature exists to end.
      await get().load();
      return {
        ok: true,
        title: "Unlocked for this session",
        detail: "Backups can run again until she restarts.",
      };
    } catch (err) {
      const denied = err instanceof ApiError && err.status === 403;
      const throttled = err instanceof ApiError && err.status === 429;
      return {
        ok: false,
        title: denied
          ? "This device may not do that"
          : throttled
            ? "Too many attempts"
            : "Could not unlock",
        detail: denied
          ? "Unlocking backups needs a grant this device doesn't have."
          : throttled
            ? "Wait a minute before trying that phrase again."
            : err instanceof Error
              ? err.message
              : undefined,
      };
    }
  },

  /**
   * Follow-up to Milestone-4 blocker 5: before this fix, forgetting a voice
   * or face never called the repository at all, in either mode -- a live
   * "forget" told the daemon nothing, so the row came right back on the
   * next reload from real data. Unlike memory-store.ts's item-level
   * forgets, EnrollmentPanel.tsx (the only caller) is this task's own file,
   * so this awaits the repository BEFORE mutating -- no optimistic remove,
   * no revert dance, no visible-hidden-visible flicker. DemoSystemRepo's
   * forgetEnrolled() resolves `true` unconditionally, so demo behaves
   * exactly as before this fix: the row disappears immediately, just now
   * behind a real (if inert) repository call rather than none. `system_control`
   * gates the live route (`routes/system.py:195`) while merely LISTING
   * enrolments needs only `recall` (:180), so a caller must be able to tell
   * "this device may not do that" apart from any other failure -- same
   * treatment as memory's forgetAll().
   */
  forgetVoice: async (id) => {
    try {
      const removed = await getRepos().system.forgetEnrolled("voice", id);
      if (!removed) {
        return { ok: false, title: "Could not forget that", detail: "She still recognises that voice." };
      }
      set((s) => ({ voices: s.voices.filter((v) => v.id !== id) }));
      return { ok: true, title: "Forgot" };
    } catch (err) {
      const denied = err instanceof ApiError && err.status === 403;
      return {
        ok: false,
        title: denied ? "This device may not do that" : "Could not forget that",
        detail: denied
          ? "Forgetting enrolment needs a grant this device doesn't have."
          : err instanceof Error
            ? err.message
            : undefined,
      };
    }
  },

  forgetFace: async (id) => {
    try {
      const removed = await getRepos().system.forgetEnrolled("face", id);
      if (!removed) {
        return { ok: false, title: "Could not forget that", detail: "She still recognises that face." };
      }
      set((s) => ({ faces: s.faces.filter((f) => f.id !== id) }));
      return { ok: true, title: "Forgot" };
    } catch (err) {
      const denied = err instanceof ApiError && err.status === 403;
      return {
        ok: false,
        title: denied ? "This device may not do that" : "Could not forget that",
        detail: denied
          ? "Forgetting enrolment needs a grant this device doesn't have."
          : err instanceof Error
            ? err.message
            : undefined,
      };
    }
  },
}));
