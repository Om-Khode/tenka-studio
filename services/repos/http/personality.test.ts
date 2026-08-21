import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { clearDevToken } from "@/services/token";
import { apiBase } from "@/services/http";
import { HttpPersonalityRepo } from "./personality";

const BASE = apiBase();
const envelope = <T>(data: T) => ({ data, meta: { requestId: "r1", generatedAt: "2026-08-09T00:00:00Z" } });

/**
 * The daemon's own shape: traits are 0.0-1.0 floats, exactly as every
 * personality's traits.json declares them. This fixture used to carry 0-100
 * numbers and assert they arrived "straight through" -- a wire shape the
 * daemon has never sent, which is why the scale mismatch reached a user's
 * screen with a green suite behind it.
 */
const WIRE_PAYLOAD = {
  base: "warm_honest",
  available: ["warm_honest", "tsundere", "minimal"],
  traits: {
    warmth: 0.72,
    curiosity: 0.6,
    directness: 0.65,
    playfulness: 0.45,
    discipline: 0.55,
    patience: 0.7,
  },
  sampleLine: "That will break on the second run.",
};

/** The same payload in Studio's vocabulary, which is 0-100 everywhere. */
const PAYLOAD = {
  ...WIRE_PAYLOAD,
  traits: { warmth: 72, curiosity: 60, directness: 65, playfulness: 45, discipline: 55, patience: 70 },
};

describe("HttpPersonalityRepo", () => {
  beforeEach(() => clearDevToken());

  it("load() maps GET /v1/personality straight through", async () => {
    server.use(http.get(`${BASE}/v1/personality`, () => HttpResponse.json(envelope(WIRE_PAYLOAD))));
    const payload = await new HttpPersonalityRepo().load();
    expect(payload).toEqual(PAYLOAD);
  });

  it("setBase() PATCHes { base } and returns the new resolved state", async () => {
    server.use(
      http.patch(`${BASE}/v1/personality`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ base: "tsundere" });
        return HttpResponse.json(envelope({ ...WIRE_PAYLOAD, base: "tsundere" }));
      }),
    );
    const payload = await new HttpPersonalityRepo().setBase("tsundere");
    expect(payload.base).toBe("tsundere");
  });

  it("setBase() rejects rather than resolving on an unknown base (400)", async () => {
    server.use(
      http.patch(`${BASE}/v1/personality`, () =>
        HttpResponse.json({ detail: "unknown personality" }, { status: 400 }),
      ),
    );
    await expect(new HttpPersonalityRepo().setBase("does-not-exist")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("reset() POSTs with no body and returns the reset state", async () => {
    server.use(
      http.post(`${BASE}/v1/personality/reset`, () => HttpResponse.json(envelope(WIRE_PAYLOAD))),
    );
    const payload = await new HttpPersonalityRepo().reset();
    expect(payload).toEqual(PAYLOAD);
  });

  it("rejects rather than resolving when the daemon is unreachable", async () => {
    server.use(http.get(`${BASE}/v1/personality`, () => HttpResponse.error()));
    await expect(new HttpPersonalityRepo().load()).rejects.toMatchObject({ status: 0 });
  });
});

describe("trait scale", () => {
  it("scales the daemon's 0..1 floats into Studio's 0..100 vocabulary", async () => {
    // Real values from assistant/personalities/warm_honest/traits.json.
    // Unscaled, Math.round() rendered these as 1/1/0/1 above bars 0.5% wide
    // -- an assistant at 70% warmth displayed as having almost no personality.
    server.use(
      http.get(`${BASE}/v1/personality`, () =>
        HttpResponse.json(
          envelope({
            base: "warm_honest",
            available: ["warm_honest"],
            traits: { warmth: 0.7, sass: 0.3, openness: 0.5 },
            sampleLine: "…",
          }),
        ),
      ),
    );

    const payload = await new HttpPersonalityRepo().load();

    expect(payload.traits).toEqual({ warmth: 70, sass: 30, openness: 50 });
    // The exact failure the user saw: nothing may round to 0 or 1 here.
    expect(Math.round(payload.traits.sass)).toBe(30);
  });
});
