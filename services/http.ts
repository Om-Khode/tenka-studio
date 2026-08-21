/**
 * The one seam every `Http*Repo` (Batch 2) talks through. Nothing here knows
 * about memory, settings, files or chat — it only knows the daemon's
 * envelope, its auth scheme and its error contract, verified against the
 * daemon's own `assistant/io/api/*` route sources.
 */
import { clearDevToken, readDevToken, revokeSession } from "./token";
import type { Capability, Session } from "@/types/session";
import type { components } from "@/types/api";

/**
 * Where the daemon is when nothing said otherwise: `next dev` on this machine.
 *
 * It is a *development* default and must never reach a shipped bundle. The
 * bundle TENKA vendors and serves herself is built with
 * `NEXT_PUBLIC_STUDIO_API_BASE=/` (see `npm run build:bundled`), which the
 * trailing-slash strip below turns into `""` -- a relative base, so every
 * request goes to whatever origin served the page. Bake this absolute loopback
 * default into that bundle instead and every call becomes cross-origin the
 * moment the page is served from a tunnel, which the daemon's own
 * `connect-src 'self'` blocks before mixed content or Private Network Access
 * are even consulted. TENKA's packager (`tools/package_studio_ui.py`) refuses
 * an export that still contains this string, so the mistake cannot ship.
 */
const DEFAULT_BASE = "http://127.0.0.1:8787";

/**
 * The daemon refuses a cookie-authenticated write that does not carry this.
 * A cross-site form post cannot set a custom header, so its presence is what
 * separates "the user's own tab did this" from "some other page did this with
 * the user's cookie riding along". Reads do not need it and must not send it --
 * requiring it on a GET would only make the header meaningless by making it
 * universal.
 */
const CSRF_HEADER = "X-TENKA-Request";

/** The one route that is a WebSocket. See `eventSocketUrl()`. */
const EVENTS_PATH = "/v1/events";

type SessionWire = components["schemas"]["SessionPayload"];

/**
 * Distinguishes the three things a caller needs told apart: "she said no"
 * (403), "she is busy" (409) and "she is not answering" (network — status
 * 0). `code` carries the daemon's own detail string when the body supplied
 * one (e.g. "busy", "precondition failed", "protected path"), so a caller
 * that needs finer grain than the status code alone — the composer telling
 * "busy" apart from some other 409 — has it, without this client inventing
 * an app-specific taxonomy on top of the daemon's.
 */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** A stable, generic label for a status the body didn't name explicitly. */
function defaultCodeFor(status: number): string {
  switch (status) {
    case 400:
      return "invalid_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation_failed";
    case 429:
      return "too_many_requests";
    default:
      return "unknown_error";
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * The daemon's error bodies are not uniform on purpose (see the contract
 * table): a 404 carries `{ error: "not found" }` — a fixed body, unrelated
 * to whatever `detail=` a route passed — while every other mapped error
 * carries `{ detail: "<string>" }`, and a 422 carries `{ detail: [...] }`,
 * an array of `{ loc, type }` pairs with no top-level string at all and,
 * deliberately, never the value that was submitted. Only the string shapes
 * become an `ApiError.code`; the 422 array is dropped entirely, not stashed
 * anywhere on `ApiError` (it carries only `status` and `code` — there is no
 * `.detail`). That was a real gap for a save that fails per-key... except
 * settings' own PATCH never needs it: a rejected settings key comes back on
 * a 200 as `SaveOutcomePayload.rejected` (see HttpSettingsRepo, milestone
 * 5b Task 5), not as a 422 at all — 422 here means "the request body itself
 * was malformed," which the client's own typing mostly prevents already. No
 * caller in this codebase currently needs field-level 422 detail; if one
 * ever does, add a typed `detail` array to `ApiError` deliberately then,
 * rather than reaching for a property that does not exist.
 */
function detailFrom(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (typeof record.detail === "string") return record.detail;
  return undefined;
}

function isAbort(err: unknown): boolean {
  // Not `instanceof DOMException` — jsdom, undici and the browser disagree
  // on exactly what class an aborted `fetch` rejects with, but all three
  // agree on `.name`.
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

/**
 * The origin every request in this module is built against, decided at build
 * time because Next inlines `process.env.NEXT_PUBLIC_*` into the client bundle.
 *
 * Three answers are possible and all three are wanted somewhere:
 * an absolute origin (`next dev` against a daemon, the demo deploy), the
 * loopback default (`next dev` with nothing configured), and the empty string
 * -- same origin as the page -- which is what `/` normalises to here and what
 * a daemon-served bundle must have. There is no way to say "same origin" with
 * an empty env var: an unset and an empty variable are indistinguishable in
 * `process.env`, so blank has to mean "unconfigured" and `/` is the spelling
 * that means "here".
 */
export function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_STUDIO_API_BASE;
  // Two literal comparisons and no method call, deliberately. Next inlines the
  // variable, so in a configured build this whole condition is
  // `"/" === undefined || "/" === ""` -- which the minifier folds, taking the
  // `DEFAULT_BASE` branch out of the bundle with it. The previous
  // `configured.trim().length > 0` could not be folded (a method call is not a
  // constant), so the absolute loopback origin survived verbatim in the
  // shipped JS even when it was unreachable, and TENKA's packager could not
  // tell a correctly built bundle from a wrongly built one by looking. The
  // cost is that a whitespace-only value is now taken at face value instead of
  // being treated as unset; that is a misconfiguration either way, and it is
  // worth it to make the packaging check evidence rather than paperwork.
  if (configured === undefined || configured === "") return DEFAULT_BASE;
  return configured.replace(/\/+$/, "");
}

/**
 * `apiBase() + path` as an absolute URL, or null if it cannot be resolved to
 * one.
 *
 * The concatenation happens *before* the resolution, not after, and that order
 * is the whole point. On a relative base `new URL(apiBase(), pageHref)` is the
 * page's own URL -- `https://host/app/chat` -- so joining a path onto that
 * afterwards would produce `https://host/app/chat/v1/events`. Resolving the
 * concatenated string instead gives `https://host/v1/events`, which is exactly
 * what the browser does with the same relative string in `fetch`.
 *
 * An unparseable base, or a relative one with no page to resolve it against
 * (server render), is `null` rather than a guess.
 */
function resolvedApiUrl(path: string): URL | null {
  const pageHref = typeof window !== "undefined" ? window.location?.href : undefined;
  try {
    return new URL(`${apiBase()}${path}`, pageHref);
  } catch {
    return null;
  }
}

/**
 * `apiBase()` as an absolute URL, or null if it cannot be resolved to one.
 *
 * A relative base -- what a daemon-served build wants -- resolves against the
 * page. An unparseable base, or a relative one with no page to resolve it
 * against, is `null` rather than a guess.
 */
function resolvedBase(): URL | null {
  return resolvedApiUrl("");
}

/** The whole 127.0.0.0/8 block, `localhost`, and IPv6 `::1` -- nothing else. */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (host === "localhost" || host === "::1") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * Whether the daemon this build talks to is reachable only from this machine.
 *
 * The bearer fallback is gated on this, and that gating is the point. The
 * daemon accepts `Authorization: Bearer` on loopback listeners alone -- but
 * until this existed, nothing on *this* side checked where the request was
 * going before attaching one. A browser that had ever held a dev token would
 * keep presenting it to whatever `apiBase()` resolved to afterwards, including
 * a Cloudflare tunnel that terminates TLS and reads the plaintext. That the
 * daemon would have refused it is no comfort: the credential still left the
 * browser and still crossed the wire, and the only thing preventing exposure
 * was the far end declining to look. A credential must never travel further
 * than the channel that carries it, and the near end has to enforce that too.
 *
 * **Fails closed.** A base this cannot resolve is not loopback. Nothing is
 * attached to a destination that cannot be identified.
 */
export function isLoopbackBase(): boolean {
  const url = resolvedBase();
  return url !== null && isLoopbackHost(url.hostname);
}

/**
 * Whether the daemon is the page's own origin -- which is exactly the question
 * "can a cookie the daemon sets ever reach it again?"
 *
 * Two independent mechanisms make that equivalence hold, and both are
 * deliberate rather than incidental. This module sends `credentials:
 * "same-origin"`, so a cross-origin response's `Set-Cookie` is discarded by
 * the browser and no cookie is attached to a cross-origin request. And the
 * daemon's CORS layer sets `allow_credentials=False` for the same reason
 * (see `create_app` in `assistant/io/api/app.py`), so a browser would refuse
 * to carry one even if this module asked it to.
 *
 * That makes the cookie channel usable in exactly one configuration: the
 * bundle the daemon serves herself, built with `NEXT_PUBLIC_STUDIO_API_BASE=/`
 * -- a relative base, which resolves to the page's own origin here. Under
 * `next dev` the page is `:3000` and the daemon is `:8787`; the cookie cannot
 * land there no matter what either side does, which is why the bearer
 * fallback above still exists and why `/connect` still writes one in that one
 * case.
 *
 * **Fails closed**, same as `isLoopbackBase()`: no window, or a base that
 * cannot be resolved, is not same-origin. The consequence of being wrong in
 * that direction is a dev token kept where none was needed, which the startup
 * sweep then has to clear; being wrong in the other direction would be a
 * session with no working credential at all.
 */
export function isSameOriginBase(): boolean {
  if (typeof window === "undefined") return false;
  const url = resolvedBase();
  return url !== null && url.origin === window.location?.origin;
}

/**
 * Drops a stored dev token that this build can never legitimately use.
 *
 * Called from startup (`initAuth()`) and again before any attach decision, so
 * the window between a base change and the next reload is not one where a live
 * credential sits in storage waiting for a regression in the check above to
 * send it. Refusing to attach and refusing to keep are two separate defences
 * on purpose: the first stops the send, the second removes the thing to send.
 *
 * Discarded rather than kept, for the same reason `clearLegacyTokens()`
 * discards rather than ignores. A credential that cannot be used is not
 * harmless -- it is a readable secret with no remaining utility, so keeping it
 * preserves only the risk. The cost is that a developer who re-points
 * `NEXT_PUBLIC_STUDIO_API_BASE` at a remote daemon and back re-pastes their dev
 * token; that is seconds of inconvenience against a credential crossing an
 * untrusted wire.
 */
export function discardUnusableDevToken(): void {
  if (!isLoopbackBase()) clearDevToken();
}

/**
 * The events socket's URL, and nothing else in it.
 *
 * This used to append `?access_token=<token>` -- the sanctioned exception to
 * "never a credential in a URL", because a browser `WebSocket` constructor
 * cannot set `Authorization`. Milestone 6a removed the need and therefore the
 * exception: the credential is now an `httpOnly` cookie, and the browser
 * attaches a cookie to the WebSocket handshake by itself. The daemon deleted
 * its side of the query-string read in Task 5, so a client still appending it
 * would achieve exactly one thing -- putting a live credential into every
 * proxy, tunnel and reverse-proxy access log between here and the daemon,
 * where URLs are logged in full and headers are not.
 *
 * Takes no path argument on purpose. There is one socket route; a parameter
 * would invite a second caller to build a URL with a query string on it and
 * quietly reopen what this function exists to have closed.
 *
 * **Resolved, not string-replaced.** This used to be
 * `apiBase().replace(/^http/, "ws")`, which is a no-op on the relative base a
 * daemon-served build carries -- leaving `/v1/events`, which `new WebSocket()`
 * rejects outright with a `SyntaxError` because the constructor requires an
 * already-resolved `ws`/`wss` scheme. `fetch` is forgiving about a relative URL
 * and `WebSocket` is not, so the two cannot share one string; the base is
 * resolved against the page here and the scheme swapped on the result.
 */
export function eventSocketUrl(): string {
  const url = resolvedApiUrl(EVENTS_PATH);
  if (url === null) {
    // No page to resolve against, i.e. no `window` -- so no `WebSocket` either.
    // Whatever this returns is never opened; it is the old string form so a
    // server render still gets a string rather than a throw.
    return `${apiBase().replace(/^http/, "ws")}${EVENTS_PATH}`;
  }
  // Built rather than mutated: assigning `url.protocol` relies on the URL
  // spec's special-scheme table permitting an http:->ws: swap, which is true
  // but is trivia to depend on. `search` and `hash` are deliberately dropped --
  // see above for why nothing may ride along on this URL.
  const scheme = url.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${url.host}${url.pathname}`;
}

async function unwrap<T>(res: Response): Promise<T> {
  // A 204 is "No Content" by definition -- there is no body to envelope, and
  // there never will be one. `POST /v1/pair` is the first route this client
  // calls that answers this way (204 + Set-Cookie, no JSON at all): parsing
  // its empty body produces `null` via safeJson()'s catch, and the envelope
  // check below would then reject a genuine success as `invalid_envelope`.
  // Handled before that parse, not folded into the check, so a route that
  // legitimately has nothing to report is never forced to invent a body just
  // to satisfy this function.
  if (res.status === 204) return undefined as T;

  const body = await safeJson(res);

  if (!res.ok) {
    const detail = detailFrom(body);
    throw new ApiError(res.status, detail ?? defaultCodeFor(res.status), detail);
  }

  // A 2xx with a body that isn't `{ data, meta }` is a broken contract, not
  // an absent value — returning `body.data` unchecked would hand every
  // caller `undefined` on a malformed response and let three components
  // downstream render a blank pane with no error branch to catch it.
  if (body === null || typeof body !== "object" || !("data" in body)) {
    throw new ApiError(res.status, "invalid_envelope", "response was not enveloped");
  }

  return (body as { data: T }).data;
}

interface SendOptions {
  /**
   * Whether a 401 means "this session is over". True everywhere except the
   * session probe, whose entire job is to ask the question a 401 answers --
   * see `probeSession()`.
   */
  revokeOn401?: boolean;
}

async function send<T>(
  method: string,
  path: string,
  body: unknown,
  init?: RequestInit,
  options?: SendOptions,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");

  // An `Authorization` the caller supplied wins over the dev token, and
  // marks this request as NOT spending the current session. Exactly one
  // caller does it -- the connect screen, verifying a candidate token it has
  // deliberately not written yet -- and the distinction is what keeps the
  // 401 handling below from tearing down a perfectly good session because
  // someone mistyped a new token into the connect form.
  const usingCurrentSession = !headers.has("Authorization");
  if (usingCurrentSession) {
    // Nothing on the shipped path. The credential is an `httpOnly` cookie the
    // browser attaches itself (see `credentials` below); a bearer appears only
    // when `next dev` put one there deliberately.
    //
    // And only ever towards this machine. The daemon honours bearer on
    // loopback listeners alone, so a token attached to anything else could
    // only be refused -- after crossing whatever tunnel sits in between. The
    // check is on this side because "the far end will decline to look at it"
    // is not a reason to have sent it.
    if (isLoopbackBase()) {
      const devToken = readDevToken();
      if (devToken) headers.set("Authorization", `Bearer ${devToken}`);
    } else {
      // Not merely skipped: a token held against a base it can never be used
      // against is dropped on the spot rather than left for the next reload.
      discardUnusableDevToken();
    }
  }
  // Reads deliberately excluded -- see CSRF_HEADER. GET is the only read verb
  // this client uses; HEAD/OPTIONS never reach here.
  if (method !== "GET") headers.set(CSRF_HEADER, "1");
  if (body !== undefined) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...init,
      method,
      headers,
      // The whole point of the cookie migration: nothing in this module knows
      // the credential, so nothing can attach it -- the browser does, and only
      // when the daemon is the page's own origin. A build served from anywhere
      // else attaches nothing and falls back to the bearer above, which is
      // precisely the `next dev` case and precisely why that path survives.
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    // An aborted request is the caller's own doing, not the daemon's — it
    // must not read as "she is not answering". Anything else here is
    // `fetch` throwing before a response ever arrived: DNS failure,
    // connection refused, CORS rejection. That is genuinely
    // indistinguishable from "she is not answering", hence status 0 rather
    // than guessing a code the daemon never sent.
    if (isAbort(err)) throw err;
    throw new ApiError(0, "unreachable", "could not reach the daemon");
  }

  // A 401 against the current session is the daemon saying this credential is
  // no longer one of hers -- her secret file was regenerated, the vault was
  // reset, `~/TENKA` was rebuilt, the device was revoked from the desktop. It
  // cannot come good on its own, and until this existed nothing anywhere acted
  // on it: the shell kept rendering, every pane showed "she could not reach
  // her X", and the only way back in was editing localStorage by hand.
  // Revoking is the whole recovery path, and it belongs here rather than in
  // each of the thirteen repositories, none of which should have to know what
  // a session is.
  //
  // The error still throws below exactly as before -- the caller's own error
  // branch is not this function's to skip.
  if (res.status === 401 && usingCurrentSession && options?.revokeOn401 !== false) {
    revokeSession();
  }

  return unwrap<T>(res);
}

export function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return send<T>("GET", path, undefined, init);
}

export function apiSend<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  return send<T>(method, path, body, init);
}

/**
 * `effective` as a lookup, `granted` kept whole for the explanation.
 *
 * The wire types both as `string[]` and this keeps them that way rather than
 * narrowing to `Capability[]`: a daemon that grows a seventh capability must
 * not make this client refuse to parse its own session. `canUse` takes the
 * narrow type instead, so a stale literal at a *call site* -- the place the
 * mistake actually gets made -- is a compile error.
 */
function toSession(wire: SessionWire): Session {
  const effective = [...wire.effective];
  const usable: ReadonlySet<string> = new Set(effective);
  return {
    deviceId: wire.deviceId,
    label: wire.label,
    granted: [...wire.grants],
    effective,
    policy: wire.policy,
    // Milestone 6b. Empty (never omitted, matching SessionPayload's own
    // promise) rather than undefined, so a raise banner reading `raised`
    // directly need not guard against it being absent on a real session.
    raised: [...wire.raised],
    raiseExpiresInSeconds: wire.raiseExpiresInSeconds,
    canUse: (capability: Capability) => usable.has(capability),
  };
}

/**
 * Who is calling, and what may this connection carry. `GET /v1/session`.
 *
 * This replaced a `localStorage` read. Studio used to decide it was authorised
 * by finding a token in storage -- presence was never validity, and since 6a
 * it is not even possible: the credential is an `httpOnly` cookie and script
 * cannot see it. Asking the daemon is now the only way to know, which is
 * strictly better, because the daemon is the only thing that ever knew.
 *
 * **A 401 here is an answer, not a failure.** It means "not authorised" -- the
 * ordinary state of a browser that has never paired -- so it resolves `null`
 * rather than throwing, and deliberately does not fire the revocation signal:
 * there is no session to tear down, and routing a first-time visitor through a
 * "your session ended" path would be a lie. Every other failure still throws,
 * because "the daemon is not answering" is genuinely not the same as "the
 * daemon says no" and the caller has to be able to tell them apart.
 */
export async function probeSession(): Promise<Session | null> {
  try {
    const wire = await send<SessionWire>("GET", "/v1/session", undefined, undefined, {
      revokeOn401: false,
    });
    return toSession(wire);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

/**
 * What `GET /v1/listener` says about the listener this connection landed on
 * -- an unauthenticated read, so `/connect` can ask it before there is any
 * session to hold an opinion. Not in `types/api.d.ts`: the route is a
 * Milestone 6b affordance built in parallel with this client, so there is no
 * generated contract for it yet (see Defect D's own note). Hand-rolled here,
 * the same way `types/session.ts` hand-rolls `Session` on top of a generated
 * wire type -- except this wire type does not exist to hand-roll on top of.
 *
 * Field names are camelCase and the body is envelope-wrapped
 * (`{"data": {...}}`), confirmed against the daemon side once it shipped --
 * the same convention as every other schema in `types/api.d.ts` (`deviceId`,
 * `raiseExpiresInSeconds`, `qrSvg`, ...) and the same `unwrap()` every other
 * read already goes through. Still hand-rolled rather than generated (no
 * entry in `types/api.d.ts` -- this route has no OpenAPI contract for
 * `openapi-typescript` to run against yet), so `getListenerInfo()` below
 * verifies the shape at runtime rather than trusting a cast.
 */
export interface ListenerInfo {
  /** The listener policy name (`"local"`, `"tailnet"`, `"funnel"`). */
  readonly policy: string;
  /** Whether this listener honours `Authorization: Bearer` at all -- what
   * `/connect`'s token form needs to be worth showing. */
  readonly allowBearer: boolean;
  /** Whether a device can pair (`POST /v1/pair`) over this listener. All
   * three of TENKA's own transports are pairable today; this stays its own
   * wire field because a future transport need not be (policy.py's
   * `pairable`). */
  readonly canPair: boolean;
}

function isListenerInfo(value: unknown): value is ListenerInfo {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).policy === "string" &&
    typeof (value as Record<string, unknown>).allowBearer === "boolean" &&
    typeof (value as Record<string, unknown>).canPair === "boolean"
  );
}

/**
 * One in-flight/settled call, for the page's whole lifetime.
 *
 * The route is rate-limited on the same anonymous per-listener budget
 * `POST /v1/pair/code` spends -- a caller that re-asked on every mount
 * would compete with pairing itself for that budget, over a route whose
 * entire value is answered once before anyone has typed anything. So this
 * is asked exactly once per page load and cached (success OR "unknown"
 * alike -- a 429 here must not become a retry loop), never re-fetched for
 * a later remount of the same page. `__resetListenerInfoCacheForTests`
 * exists only so test files can start each case from "not yet asked",
 * the same shape as `hooks/useLiveTelemetry.ts`'s own test reset.
 */
let listenerInfoOnce: Promise<ListenerInfo | null> | null = null;

/**
 * `null` means "unknown" -- the route 404'd (not shipped yet), answered 401
 * (a listener whose port resolves to no policy -- an anomaly about the
 * connection, not this browser's credential), the daemon did not answer at
 * all, or it answered with a shape this build does not recognise.
 * **Never thrown, never a reason to lock a caller out**: this is an
 * affordance for `/connect` to pick better copy, not a security control, so
 * every failure mode collapses to the one answer that keeps today's
 * behaviour (show the token form) available.
 *
 * Calls `send()` directly rather than the exported `apiGet()`, with
 * `revokeOn401: false` -- exactly `probeSession()`'s own reason. This route
 * is unauthenticated, so its 401 says nothing about whether this browser's
 * credential is still good; `apiGet()`'s default would revoke the current
 * session over an anomaly that has nothing to do with it.
 */
export function getListenerInfo(): Promise<ListenerInfo | null> {
  if (listenerInfoOnce) return listenerInfoOnce;
  listenerInfoOnce = (async () => {
    try {
      const wire = await send<unknown>("GET", "/v1/listener", undefined, undefined, {
        revokeOn401: false,
      });
      return isListenerInfo(wire) ? wire : null;
    } catch {
      return null;
    }
  })();
  return listenerInfoOnce;
}

/** Test-only: starts the next `getListenerInfo()` call fresh, the same
 * shape as `hooks/useLiveTelemetry.ts`'s own `__reset*ForTests`. */
export function __resetListenerInfoCacheForTests(): void {
  listenerInfoOnce = null;
}
