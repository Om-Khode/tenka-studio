import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { setDevToken, clearDevToken } from "@/services/token";
import { apiBase } from "@/services/http";
import { HttpSettingsRepo } from "./settings";
import { findSetting } from "@/store/settings-registry";

const BASE = apiBase();
const envelope = <T>(data: T) => ({ data, meta: { requestId: "r1", generatedAt: "2026-08-09T00:00:00Z" } });

describe("HttpSettingsRepo.load()", () => {
  beforeEach(() => clearDevToken());

  it("merges a registry-known key: daemon owns value/kind/default/source, registry owns label and bounds", async () => {
    // tts_speed is a real registry row: kind "slider", bounds 0.5-2, min/max/step 0.5/2/0.05.
    server.use(
      http.get(`${BASE}/v1/settings`, () =>
        HttpResponse.json(
          envelope({
            rows: [
              {
                key: "tts_speed", group: "Tts", description: "daemon's own description",
                kind: "slider", value: 1.4, default: 1, needsRestart: false, source: "db", options: [],
              },
            ],
          }),
        ),
      ),
    );

    const [def] = await new HttpSettingsRepo().load();
    const registryDef = findSetting("tts_speed")!;

    expect(def.value).toBe(1.4); // the daemon's stated current value
    expect(def.default).toBe(1); // daemon-owned even though the registry agrees
    expect(def.source).toBe("db");
    expect(def.description).toBe("daemon's own description"); // daemon-owned
    expect(def.label).toBe(registryDef.label); // registry-owned presentation
    expect(def.min).toBe(registryDef.min);
    expect(def.max).toBe(registryDef.max);
    expect(def.step).toBe(registryDef.step);
  });

  it("still renders a key the registry has never seen, with a humanised label and no bounds", async () => {
    server.use(
      http.get(`${BASE}/v1/settings`, () =>
        HttpResponse.json(
          envelope({
            rows: [
              {
                key: "brand_new_daemon_flag", group: "Brand", description: "not in any Studio build yet",
                kind: "toggle", value: true, default: false, needsRestart: false, source: "default", options: [],
              },
            ],
          }),
        ),
      ),
    );

    const [def] = await new HttpSettingsRepo().load();
    expect(findSetting("brand_new_daemon_flag")).toBeUndefined(); // confirms this key really is unknown locally
    expect(def.label).toBe("brand new daemon flag");
    expect(def.min).toBeUndefined();
    expect(def.max).toBeUndefined();
  });

  it("drops a key the registry has but the daemon no longer reports", async () => {
    // A row set that simply never mentions "tts_speed" -- the merge must not
    // fall back to the registry to fill the gap.
    server.use(
      http.get(`${BASE}/v1/settings`, () =>
        HttpResponse.json(
          envelope({
            rows: [
              {
                key: "wake_word_enabled", group: "Wake Word", description: "d",
                kind: "toggle", value: true, default: true, needsRestart: true, source: "default", options: [],
              },
            ],
          }),
        ),
      ),
    );

    const defs = await new HttpSettingsRepo().load();
    expect(defs.map((d) => d.key)).toEqual(["wake_word_enabled"]);
    expect(defs.find((d) => d.key === "tts_speed")).toBeUndefined();
  });

  // Fix round: `personality` genuinely IS in runtime_config.REGISTRY (see
  // config.py's _runtime_setting("personality", ...)), so a realistic
  // GET /v1/settings payload includes it -- kind "text", same as any other
  // string setting. This row is semantically dead (PATCHing it through the
  // generic settings route never reaches switch_personality()), so it must
  // never survive the merge regardless of what else is in the payload.
  it("never lets the daemon's dead `personality` row reach the rendered defs", async () => {
    server.use(
      http.get(`${BASE}/v1/settings`, () =>
        HttpResponse.json(
          envelope({
            rows: [
              {
                key: "personality", group: "Personality", description: "Active personality base.",
                kind: "text", value: "tsundere", default: "warm_honest", needsRestart: false,
                source: "db", options: [],
              },
              {
                key: "tts_speed", group: "Tts", description: "d",
                kind: "slider", value: 1.2, default: 1, needsRestart: false, source: "db", options: [],
              },
            ],
          }),
        ),
      ),
    );

    const defs = await new HttpSettingsRepo().load();
    expect(defs.map((d) => d.key)).toEqual(["tts_speed"]);
    expect(defs.find((d) => d.key === "personality")).toBeUndefined();
  });

  it("humanises a select option value it has no registry text for", async () => {
    server.use(
      http.get(`${BASE}/v1/settings`, () =>
        HttpResponse.json(
          envelope({
            rows: [
              {
                key: "unmapped_choice", group: "X", description: "d",
                kind: "select", value: "idle_only", default: "always", needsRestart: false,
                source: "default", options: ["always", "idle_only"],
              },
            ],
          }),
        ),
      ),
    );

    const [def] = await new HttpSettingsRepo().load();
    expect(def.options).toEqual([
      { value: "always", label: "always" },
      { value: "idle_only", label: "idle only" },
    ]);
  });
});

describe("HttpSettingsRepo.save()", () => {
  beforeEach(() => clearDevToken());

  it("maps the daemon's saved/rejected/restartRequired shape onto applied/failed/needsRestart", async () => {
    server.use(
      http.patch(`${BASE}/v1/settings`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ changes: { tts_speed: 1.8, camera_enabled: true } });
        return HttpResponse.json(
          envelope({
            saved: ["tts_speed"],
            rejected: { camera_enabled: "camera is in use by another process" },
            restartRequired: [],
          }),
        );
      }),
    );

    const outcome = await new HttpSettingsRepo().save({ tts_speed: 1.8, camera_enabled: true });
    expect(outcome).toEqual({
      applied: ["tts_speed"],
      failed: [{ key: "camera_enabled", reason: "camera is in use by another process" }],
      needsRestart: [],
    });
  });

  it("rejects rather than resolving when a device without system_control hits the system_control-gated PATCH", async () => {
    setDevToken("chat-send-only-token");
    server.use(
      http.patch(`${BASE}/v1/settings`, () =>
        HttpResponse.json({ detail: "capability not granted" }, { status: 403 }),
      ),
    );

    await expect(new HttpSettingsRepo().save({ tts_speed: 1.8 })).rejects.toMatchObject({
      status: 403,
    });
  });
});
