import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase } from "@/services/http";
import { clearDevToken } from "@/services/token";
import { HttpSystemRepo } from "./system";

const BASE = apiBase();
const PHRASE = "amber moss steel gold bone quiet signal drift alpha beta gamma delta";
const envelope = <T>(data: T) => ({ data, meta: { requestId: "r1", generatedAt: "2026-08-09T00:00:00Z" } });

const backupPayload = (overrides: Partial<Record<string, unknown>> = {}) => ({
  enabled: true,
  provider: "cloud",
  lastBackupAt: "2026-08-08T12:00:00Z",
  lastResult: "ok",
  sizeBytes: 41_000_000,
  ...overrides,
});

describe("HttpSystemRepo", () => {
  beforeEach(() => {
    clearDevToken();
  });

  it("getBackupStatus maps a real lastBackupAt through untouched", async () => {
    server.use(http.get(`${BASE}/v1/backup`, () => HttpResponse.json(envelope(backupPayload()))));
    const repo = new HttpSystemRepo();
    const status = await repo.getBackupStatus();
    expect(status.lastBackupAt).toBe("2026-08-08T12:00:00Z");
    expect(status.provider).toBe("cloud");
    expect(status.lastResult).toBe("ok");
    // No live progress signal exists on this route -- never a fabricated percentage.
    expect(status.progressPct).toBeNull();
  });

  it('getBackupStatus maps the daemon\'s "" sentinel to null -- she has never backed up', async () => {
    server.use(
      http.get(`${BASE}/v1/backup`, () => HttpResponse.json(envelope(backupPayload({ lastBackupAt: "" })))),
    );
    const repo = new HttpSystemRepo();
    const status = await repo.getBackupStatus();
    expect(status.lastBackupAt).toBeNull();
  });

  it("runBackup blocks and resolves the final state, still with a null progressPct -- no ticking percentage is invented", async () => {
    server.use(
      http.post(`${BASE}/v1/backup/run`, () =>
        HttpResponse.json(envelope(backupPayload({ lastBackupAt: "2026-08-09T00:00:00Z" }))),
      ),
    );
    const repo = new HttpSystemRepo();
    const status = await repo.runBackup();
    expect(status.lastBackupAt).toBe("2026-08-09T00:00:00Z");
    expect(status.progressPct).toBeNull();
  });

  it("restoreBackup resolves true on a real restore", async () => {
    server.use(
      http.post(`${BASE}/v1/backup/restore`, () => HttpResponse.json(envelope({ restored: true }))),
    );
    const repo = new HttpSystemRepo();
    await expect(repo.restoreBackup("amber moss steel gold bone quiet signal drift")).resolves.toBe(true);
  });

  it("restoreBackup resolves false for a wrong phrase -- not an exception", async () => {
    server.use(
      http.post(`${BASE}/v1/backup/restore`, () => HttpResponse.json({ detail: "restore failed" }, { status: 400 })),
    );
    const repo = new HttpSystemRepo();
    await expect(repo.restoreBackup("wrong words entirely")).resolves.toBe(false);
  });

  it("restoreBackup rethrows a missing system_control grant -- a different kind of no", async () => {
    server.use(
      http.post(`${BASE}/v1/backup/restore`, () =>
        HttpResponse.json({ detail: "capability not granted" }, { status: 403 }),
      ),
    );
    const repo = new HttpSystemRepo();
    await expect(repo.restoreBackup("anything")).rejects.toMatchObject({ status: 403 });
  });

  it("listVoices/listFaces keep a null count as null, never coerced to 0", async () => {
    server.use(
      http.get(`${BASE}/v1/enrollment`, () =>
        HttpResponse.json(
          envelope({
            voices: [{ itemId: "v1", name: "Kirigaya", enrolledAt: "2026-08-01T00:00:00Z", count: null, lastSeenAt: "" }],
            faces: [{ itemId: "f1", name: "Kirigaya", enrolledAt: "2026-08-01T00:00:00Z", count: 5, lastSeenAt: "2026-08-08T00:00:00Z" }],
          }),
        ),
      ),
    );
    const repo = new HttpSystemRepo();
    const voices = await repo.listVoices();
    const faces = await repo.listFaces();
    expect(voices[0].sampleCount).toBeNull();
    expect(voices[0].lastHeardAt).toBeNull();
    expect(faces[0].encodingCount).toBe(5);
    expect(faces[0].lastSeenAt).toBe("2026-08-08T00:00:00Z");
  });

  /**
   * One response carries both halves, and system-store asks for them in a
   * single `Promise.all` -- so two requests were being spent on one answer
   * against a 120-per-60s limiter, and a forget landing between them yielded a
   * torn read (voices from before, faces from after).
   */
  it("listVoices and listFaces called together spend ONE request, and read the same response", async () => {
    let hits = 0;
    server.use(
      http.get(`${BASE}/v1/enrollment`, () => {
        hits += 1;
        return HttpResponse.json(
          envelope({
            voices: [{ itemId: "v1", name: "Kirigaya", enrolledAt: "2026-08-01T00:00:00Z", count: 8, lastSeenAt: "" }],
            faces: [{ itemId: "f1", name: "Kirigaya", enrolledAt: "2026-08-01T00:00:00Z", count: 5, lastSeenAt: "" }],
          }),
        );
      }),
    );

    const repo = new HttpSystemRepo();
    const [voices, faces] = await Promise.all([repo.listVoices(), repo.listFaces()]);

    expect(hits).toBe(1);
    expect(voices[0].name).toBe("Kirigaya");
    expect(faces[0].name).toBe("Kirigaya");

    // Coalescing an in-flight request is not caching: a later load must ask
    // again, or a forget would never disappear from the panel.
    await repo.listVoices();
    expect(hits).toBe(2);
  });

  it("a failed enrolment fetch rejects both callers and leaves nothing cached behind it", async () => {
    let hits = 0;
    server.use(
      http.get(`${BASE}/v1/enrollment`, () => {
        hits += 1;
        return HttpResponse.json({ detail: "busy" }, { status: 503 });
      }),
    );

    const repo = new HttpSystemRepo();
    await expect(Promise.all([repo.listVoices(), repo.listFaces()])).rejects.toMatchObject({
      status: 503,
    });
    expect(hits).toBe(1);

    // The failed promise must not be held: the retry has to reach the daemon.
    await expect(repo.listVoices()).rejects.toMatchObject({ status: 503 });
    expect(hits).toBe(2);
  });

  it("forgetEnrolled resolves true when the daemon reports a real removal", async () => {
    server.use(
      http.delete(`${BASE}/v1/enrollment/voice/v1`, () =>
        HttpResponse.json(envelope({ forgotten: "v1", kind: "voice" })),
      ),
    );
    const repo = new HttpSystemRepo();
    await expect(repo.forgetEnrolled("voice", "v1")).resolves.toBe(true);
  });

  /**
   * `ForgetEnrolledPayload.forgotten` is a string -- the daemon echoes the id
   * it removed. The old `Boolean(result.forgotten)` was true for any non-empty
   * echo, i.e. for every 2xx, and was correct only because the route happens to
   * 404 when there is nothing to remove. It asserted something it never
   * checked; this is the check.
   */
  it("forgetEnrolled checks the daemon's echo against what was asked for, rather than that an echo exists", async () => {
    server.use(
      http.delete(`${BASE}/v1/enrollment/voice/v1`, () =>
        HttpResponse.json(envelope({ forgotten: "v2", kind: "voice" })),
      ),
    );
    const repo = new HttpSystemRepo();
    await expect(repo.forgetEnrolled("voice", "v1")).resolves.toBe(false);
  });

  it("forgetEnrolled resolves false on a 404 -- nothing there to remove, not an unknown failure", async () => {
    server.use(
      http.delete(`${BASE}/v1/enrollment/voice/ghost`, () =>
        HttpResponse.json({ error: "not found" }, { status: 404 }),
      ),
    );
    const repo = new HttpSystemRepo();
    await expect(repo.forgetEnrolled("voice", "ghost")).resolves.toBe(false);
  });

  it("forgetEnrolled rethrows a missing system_control grant", async () => {
    server.use(
      http.delete(`${BASE}/v1/enrollment/voice/v1`, () =>
        HttpResponse.json({ detail: "capability not granted" }, { status: 403 }),
      ),
    );
    const repo = new HttpSystemRepo();
    await expect(repo.forgetEnrolled("voice", "v1")).rejects.toMatchObject({ status: 403 });
  });

  it("getTelemetry passes the wire's keys through untouched -- one vocabulary, HTTP and socket alike", async () => {
    server.use(
      http.get(`${BASE}/v1/telemetry`, () =>
        HttpResponse.json(
          envelope({
            cpuPercent: 41,
            ramPercent: 62,
            batteryPercent: 87,
            activeModel: "gemini-flash-lite",
            uptimeSeconds: 3600,
          }),
        ),
      ),
    );
    const repo = new HttpSystemRepo();
    const snapshot = await repo.getTelemetry();
    expect(snapshot).toEqual({
      cpuPercent: 41,
      ramPercent: 62,
      batteryPercent: 87,
      activeModel: "gemini-flash-lite",
      uptimeSeconds: 3600,
    });
  });

  it("getTelemetry leaves batteryPercent null when the daemon has no battery to report", async () => {
    server.use(
      http.get(`${BASE}/v1/telemetry`, () =>
        HttpResponse.json(
          envelope({
            cpuPercent: 10,
            ramPercent: 20,
            batteryPercent: null,
            activeModel: "gemini-flash-lite",
            uptimeSeconds: 100,
          }),
        ),
      ),
    );
    const repo = new HttpSystemRepo();
    expect((await repo.getTelemetry()).batteryPercent).toBeNull();
  });
});

describe("unlockBackup", () => {
  it("POSTs the phrase and resolves what the daemon says", async () => {
    let sent: unknown = null;
    server.use(
      http.post(`${BASE}/v1/backup/unlock`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(envelope({ unlocked: true }));
      }),
    );

    await expect(new HttpSystemRepo().unlockBackup(PHRASE)).resolves.toBe(true);
    expect(sent).toEqual({ recoveryPhrase: PHRASE });
  });

  it("resolves false on the route's own 400, which means a malformed phrase", async () => {
    server.use(
      http.post(`${BASE}/v1/backup/unlock`, () =>
        HttpResponse.json({ detail: "unlock failed" }, { status: 400 }),
      ),
    );
    await expect(new HttpSystemRepo().unlockBackup("nope")).resolves.toBe(false);
  });

  it("still throws on 403 and 429 — those are not 'your phrase was wrong'", async () => {
    // Flattening these to false would tell the user their recovery phrase was
    // rejected when the daemon never even evaluated it.
    for (const status of [403, 429]) {
      server.use(
        http.post(`${BASE}/v1/backup/unlock`, () =>
          HttpResponse.json({ detail: "no" }, { status }),
        ),
      );
      await expect(new HttpSystemRepo().unlockBackup(PHRASE)).rejects.toMatchObject({ status });
    }
  });

  it("reports whether the key is armed on the backup status", async () => {
    server.use(
      http.get(`${BASE}/v1/backup`, () =>
        HttpResponse.json(
          envelope({
            enabled: true,
            provider: "google_drive",
            lastBackupAt: "2026-08-03T16:40:10Z",
            lastResult: "success",
            sizeBytes: 41_000_000,
            unlocked: false,
          }),
        ),
      ),
    );

    const status = await new HttpSystemRepo().getBackupStatus();
    // enabled AND not unlocked is the exact state that went unnoticed for a
    // week: she intends to back up and cannot.
    expect(status.enabled).toBe(true);
    expect(status.unlocked).toBe(false);
  });
});
