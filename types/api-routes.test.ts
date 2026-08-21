import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PAGE_ROUTES } from "./api-routes";

// Read openapi.json directly rather than importing generated types/api.d.ts:
// this test is guarding the *schema* (the thing api:types generates from),
// so it must fail independently of whether types/api.d.ts happens to be
// regenerated yet. Vitest runs with cwd at the repo root, and openapi.json
// lives there.
const schemaPath = join(process.cwd(), "openapi.json");
const spec = JSON.parse(readFileSync(schemaPath, "utf8")) as {
  paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> }>>;
};

const SUCCESS_CODES = ["200", "201", "202"];

function successResponseSchema(operation: { responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> }) {
  if (!operation.responses) return undefined;
  for (const code of SUCCESS_CODES) {
    const response = operation.responses[code];
    const schema = response?.content?.["application/json"]?.schema;
    if (schema) return schema;
  }
  return undefined;
}

describe("openapi.json still describes every route the six pages call", () => {
  it("has exactly the 33 paths the shipped contract was verified against", () => {
    // Guards the coarse case: a wholesale schema regeneration that drops or
    // adds paths should fail loudly here, not surface as a silent 404 three
    // tasks from now.
    //
    // 26 -> 27 on 2026-08-10: POST /v1/backup/unlock. Her backup key is
    // derived from the recovery phrase and held in memory only, so it dies on
    // every restart -- and while it is gone her scheduler skips every backup
    // and a manual run 409s. Studio had no way to re-arm it, so the only route
    // back to working backups was RESTORE, which unlocks as a side effect of
    // overwriting everything she remembers. This count moving is the intended
    // consequence of adding that route, not drift.
    //
    // 27 -> 32 on 2026-08-15, Milestone 6a: GET /v1/session, POST
    // /v1/pair/code, POST /v1/pair, GET /v1/devices and DELETE
    // /v1/devices/{device_id}. The session probe exists because the device
    // credential moved into an httpOnly cookie that JavaScript cannot read,
    // so the live tree can no longer decide from storage whether it is
    // authorised; the other four are pairing and revocation. Note POST
    // /v1/pair is the one route in this contract reachable with no
    // credential at all -- it is how a device gets one.
    //
    // 32 -> 33 on 2026-08-15: POST /v1/session/cookie. A session that
    // authenticated with `Authorization: Bearer` -- which is what `/connect`
    // produces -- had working HTTP and an event socket that could never
    // authenticate, because a browser cannot put a header on a WebSocket
    // handshake and the socket reads the cookie alone. The header showed LIVE
    // · RECONNECTING forever and no chat reply ever rendered. This route hands
    // the same verified credential back as the `httpOnly` cookie, so both
    // channels carry it; `/connect` calls it instead of writing a live device
    // token into `localStorage`, which is what it used to do.
    //
    // 33 -> 36 on 2026-08-19, Milestone 6b: GET /v1/transports, POST/DELETE
    // /v1/transports/{name}, and POST/DELETE /v1/devices/{device_id}/raise --
    // three new paths (five new operations; `paths` counts distinct paths,
    // not methods). The transports screen and the raise control on the
    // device list are new settings-page network calls, not a schema
    // regeneration that happened to drop or gain something incidentally.
    //
    // 36 -> 37 on 2026-08-20, Milestone 6b (quick removal follow-up): GET
    // /v1/listener. Studio's /connect screen had no way to learn which
    // listener served it -- and specifically whether that listener's policy
    // even allows pairing (`canPair`) -- before deciding whether to offer the
    // bearer-token exchange at all. The one other unauthenticated route in
    // this contract is POST /v1/pair itself; this is the one unauthenticated
    // *read*.
    //
    // This test failing on a regeneration is the test working. The only
    // correct response is to name the routes that moved it, here, as above.
    expect(Object.keys(spec.paths)).toHaveLength(37);
  });

  for (const [page, routes] of Object.entries(PAGE_ROUTES)) {
    describe(page, () => {
      for (const { path, methods } of routes) {
        for (const method of methods) {
          it(`${method.toUpperCase()} ${path} exists and resolves to a named response schema`, () => {
            const operations = spec.paths[path];
            expect(operations, `missing path ${path} in openapi.json`).toBeDefined();

            const operation = operations[method];
            expect(operation, `missing ${method.toUpperCase()} ${path} in openapi.json`).toBeDefined();

            const schema = successResponseSchema(operation);
            expect(schema, `${method.toUpperCase()} ${path} has no success response schema`).toBeDefined();

            // A named $ref (e.g. #/components/schemas/Envelope_StatusPayload_)
            // is what makes openapi-typescript emit a concrete `data` type.
            // A bare inline object here is exactly the case the plan calls
            // out: "If any operation's `data` comes out as `unknown`
            // anywhere, stop and report."
            expect(
              schema,
              `${method.toUpperCase()} ${path}'s response is a bare schema, not a $ref — ` +
                "generated types would resolve `data` to `unknown` here",
            ).toHaveProperty("$ref");
          });
        }
      }
    });
  }
});
