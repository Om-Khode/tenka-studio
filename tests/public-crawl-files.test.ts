import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * public/sitemap.xml and public/robots.txt are hand-maintained, because Next
 * compiles app/sitemap.ts into a route handler and the public build forbids
 * those (docs/deploy.md). Hand-maintained means it can drift, so this is the
 * thing that goes red when it does.
 *
 * What it pins: the sitemap lists exactly the routes that answer on a public
 * build, discovered from the filesystem rather than restated. Add
 * app/demo/foo/page.tsx without touching the sitemap and the first assertion
 * fails; list a route that no longer exists and the second one does.
 */
const ROOT = resolve(__dirname, "..");
const ORIGIN = "https://tenka-studio.vercel.app";

function demoRoutesOnDisk(): string[] {
  const demoDir = join(ROOT, "app", "demo");
  const routes = existsSync(join(demoDir, "page.tsx")) ? ["/demo"] : [];
  for (const entry of readdirSync(demoDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (existsSync(join(demoDir, entry.name, "page.tsx"))) routes.push(`/demo/${entry.name}`);
  }
  return routes.sort();
}

function sitemapPaths(): string[] {
  const xml = readFileSync(join(ROOT, "public", "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs.length).toBeGreaterThan(0); // a regex that matched nothing must not pass silently
  return locs
    .map((url) => {
      expect(url.startsWith(ORIGIN)).toBe(true);
      const path = url.slice(ORIGIN.length);
      return path === "" ? "/" : path;
    })
    .sort();
}

describe("public/sitemap.xml", () => {
  it("lists the landing page and every demo route that exists on disk", () => {
    const expected = ["/", ...demoRoutesOnDisk()].sort();
    expect(sitemapPaths()).toEqual(expected);
  });

  it("never lists a route the public build walls off", () => {
    for (const path of sitemapPaths()) {
      expect(path.startsWith("/app")).toBe(false);
      expect(path).not.toBe("/connect");
      expect(path).not.toBe("/pair");
    }
  });
});

describe("public/robots.txt", () => {
  const txt = readFileSync(join(ROOT, "public", "robots.txt"), "utf8");

  it("disallows each route the public build walls off", () => {
    for (const rule of ["Disallow: /app/", "Disallow: /connect", "Disallow: /pair"]) {
      expect(txt).toContain(rule);
    }
  });

  it("points at the sitemap that actually exists", () => {
    expect(txt).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(existsSync(join(ROOT, "public", "sitemap.xml"))).toBe(true);
  });

  it("still allows the demo tree", () => {
    expect(txt).toContain("Allow: /");
    expect(txt).not.toContain("Disallow: /demo");
  });
});
