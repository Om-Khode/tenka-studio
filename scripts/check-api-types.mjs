#!/usr/bin/env node
/**
 * Drift check for types/api.d.ts.
 *
 * Regenerates the types from openapi.json into a *temp* file using the exact
 * same CLI `npm run api:types` uses (same binary, same default flags, same
 * COMMENT_HEADER), then diffs that temp file byte-for-byte against the
 * committed types/api.d.ts. Non-zero exit means the committed file is stale
 * — someone changed openapi.json (e.g. re-copied a regenerated daemon
 * contract) without re-running `npm run api:types`.
 *
 * Deliberately shells out to the real CLI rather than calling the
 * openapi-typescript library functions directly: the CLI applies its own
 * default flags (and a COMMENT_HEADER) that do not necessarily match the
 * library's bare defaults, so anything other than "run the same command
 * twice" risks a false-positive drift report.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const schemaPath = join(repoRoot, "openapi.json");
const committedPath = join(repoRoot, "types", "api.d.ts");
const cliPath = join(repoRoot, "node_modules", "openapi-typescript", "bin", "cli.js");

function firstDiffLine(a, b) {
  const linesA = a.split(/\r?\n/);
  const linesB = b.split(/\r?\n/);
  const max = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < max; i++) {
    if (linesA[i] !== linesB[i]) {
      return { line: i + 1, committed: linesA[i] ?? "<eof>", fresh: linesB[i] ?? "<eof>" };
    }
  }
  return null;
}

function main() {
  if (!existsSync(committedPath)) {
    console.error(`[api:check] ${committedPath} does not exist. Run: npm run api:types`);
    process.exit(1);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "tenka-studio-api-types-"));
  const freshPath = join(tmpDir, "api.d.ts");

  try {
    execFileSync(process.execPath, [cliPath, schemaPath, "-o", freshPath], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Normalise line endings before comparing. .gitattributes pins both
    // artefacts to LF, but a working copy checked out before that landed --
    // or on a machine with a different core.autocrlf -- carries CRLF while
    // the generator always emits LF. Comparing raw bytes then reports drift
    // that does not exist, and a check that can never pass is one people
    // learn to ignore. Real content drift is still caught: only \r is stripped.
    const normalise = (s) => s.replace(/\r\n/g, "\n");
    const committed = normalise(readFileSync(committedPath, "utf8"));
    const fresh = normalise(readFileSync(freshPath, "utf8"));

    if (fresh === committed) {
      console.log("[api:check] types/api.d.ts matches openapi.json.");
      rmSync(tmpDir, { recursive: true, force: true });
      return;
    }

    const diff = firstDiffLine(committed, fresh);
    console.error("[api:check] types/api.d.ts is STALE relative to openapi.json.");
    if (diff) {
      console.error(`[api:check] first difference at line ${diff.line}:`);
      console.error(`[api:check]   committed: ${diff.committed}`);
      console.error(`[api:check]   fresh:     ${diff.fresh}`);
    }
    console.error(`[api:check] full regenerated output kept at: ${freshPath}`);
    console.error("[api:check] run `npm run api:types` and commit the result.");
    process.exit(1);
  } catch (err) {
    if (err.status !== undefined) {
      // execFileSync failure (non-zero exit from the generator itself).
      console.error("[api:check] failed to regenerate types:", err.stderr?.toString() ?? err.message);
      process.exit(1);
    }
    throw err;
  }
}

main();
