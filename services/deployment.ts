/**
 * The shape of the build, not of the session. Next inlines
 * `process.env.NEXT_PUBLIC_*` into the client bundle at build time, so this
 * answer is fixed for a deployment and cannot change while a page is open.
 *
 * It is a function rather than an exported constant for the same two reasons
 * `apiBase()` in services/http.ts is: the variable is named in exactly one
 * place in the repo, and a test can stub the env before calling it.
 */
export function isPublicDemoBuild(): boolean {
  // Strict "1", never truthiness. `NEXT_PUBLIC_DEMO_ONLY=false` is a plausible
  // env row, and under truthiness it would exclude the live tree from a build
  // whose dashboard says the flag is off.
  return process.env.NEXT_PUBLIC_DEMO_ONLY === "1";
}

/**
 * The origin the public demo is served from, used to build the absolute URLs
 * that robots.txt and sitemap.xml are required to carry. Both are generated at
 * build time and only ever read by crawlers, which reach this project at
 * exactly one address; the bundle the daemon serves from loopback also carries
 * them, harmlessly, because nothing crawls a loopback listener.
 *
 * A constant and not an env row on purpose: an origin that can be misconfigured
 * is an origin that can point a sitemap at somebody else's site.
 */
export const SITE_ORIGIN = "https://tenka-studio.vercel.app";
