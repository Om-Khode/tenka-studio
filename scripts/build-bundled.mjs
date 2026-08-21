#!/usr/bin/env node
/**
 * The export TENKA vendors and serves herself.
 *
 * `npm run build` is the deploy build: it takes its API base from the
 * environment (the demo deploy sets an absolute one). This is the *bundled*
 * build, and the one thing that makes it different is the one thing nobody
 * would think to check afterwards -- the API base is relative, so every
 * request goes back to whatever origin served the page.
 *
 * Why that matters enough to earn its own script: Next inlines
 * `process.env.NEXT_PUBLIC_*` into the client JS at build time, so the base is
 * frozen into the bundle and cannot be corrected later by configuration. A
 * bundle carrying `services/http.ts`'s absolute loopback `DEFAULT_BASE` is
 * fine on `next dev` and broken the instant the daemon serves it from a
 * tunnel: every call becomes cross-origin, and the daemon's own
 * `connect-src 'self'` refuses it before mixed content or Private Network
 * Access get a say. The symptom is a dead WebSocket and a wall of CSP
 * violations, which reads as a socket bug and is not one.
 *
 * A script rather than an inline `VAR=value next build` in package.json,
 * because that form is a syntax error in cmd.exe and this repo is developed on
 * Windows. `/` rather than `""` because `process.env` cannot tell an empty
 * variable from an unset one -- see `apiBase()`.
 *
 * The counterpart check lives on TENKA's side: `tools/package_studio_ui.py`
 * refuses an export whose JS still contains an absolute loopback origin, so
 * running plain `npm run build` by mistake fails at packaging rather than in
 * production.
 *
 *     npm run build:bundled
 *     py -3.11 tools/package_studio_ui.py <this repo>/out   # in TENKA
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Relative, i.e. same origin as the page. `apiBase()` strips the slash. */
const BUNDLED_API_BASE = "/";

const result = spawnSync(
  process.execPath,
  [join(repoRoot, "node_modules", "next", "dist", "bin", "next"), "build"],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_STUDIO_API_BASE: BUNDLED_API_BASE,
      // The bundled build is the live app, never the public demo's stub tree.
      // Inherited from a shell that happened to have it set, this one flag
      // would ship a UI that cannot talk to the daemon at all.
      NEXT_PUBLIC_DEMO_ONLY: "0",
    },
  },
);

if (result.error) {
  console.error("[build:bundled] could not start next build:", result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`[build:bundled] out/ built with NEXT_PUBLIC_STUDIO_API_BASE=${BUNDLED_API_BASE}`);
