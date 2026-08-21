/**
 * Two things live here, and they are deliberately not one thing.
 *
 * **1. The dev token.** Since Milestone 6a the device credential is an
 * `httpOnly` cookie the daemon sets when a device pairs. JavaScript cannot
 * read it, cannot write it, and does not need to -- the browser attaches it to
 * every same-origin request and to the WebSocket handshake on its own. That is
 * the whole point of moving off `localStorage`: a credential the page can read
 * is a credential an XSS can steal.
 *
 * The one case a cookie cannot cover is `next dev`, where Studio is served
 * from :3000 while the daemon listens on :8787 -- a genuinely different
 * origin, so `credentials: "same-origin"` attaches nothing. The daemon accepts
 * `Authorization: Bearer` on loopback alone for exactly that reason, and this
 * module is that path: opt-in via `setDevToken()`, never a default, and never
 * what a shipped build takes.
 *
 * `setDevToken()` kept its one honest caller and lost its dangerous one.
 * `/connect` used to write the pasted device token here unconditionally -- a
 * live credential in `localStorage`, readable by any injected script, which is
 * the precise weakness 6a removed everywhere else. It now exchanges that token
 * for the cookie (`POST /v1/session/cookie`) and stores nothing at all
 * whenever the cookie can reach the daemon, i.e. whenever the daemon is the
 * page's own origin. What survives is the case where a cookie provably cannot
 * work: the dev server, on this machine, where the daemon's bearer allowance
 * is the only channel there is. That is not a leftover convenience -- delete
 * it and `next dev` cannot authenticate at all.
 *
 * Storing a token here does NOT mean it will be sent. `services/http.ts`
 * attaches it only when `isLoopbackBase()` -- the near end enforcing the same
 * loopback rule the far end does, because "the daemon would have refused it"
 * is no comfort once the credential has already crossed the tunnel. Against
 * any other base the token is discarded rather than merely skipped
 * (`discardUnusableDevToken()`).
 *
 * **2. Session revocation** -- the app-wide statement that whatever credential
 * this browser was using is no longer one of hers. Cookie or bearer, the
 * discovery is the same (a 401 in `services/http.ts`, a 1008 close in
 * `hooks/useEventStream.ts`) and so is the recovery.
 *
 * A pre-6a build stored the real device token in `localStorage`. After the
 * cookie migration that value is dead weight -- but a dead credential an XSS
 * can still read is still a credential, so `clearLegacyTokens()` removes it at
 * startup rather than ignoring it and letting it sit there forever.
 */

/**
 * Loopback dev-server use only. A separate key from the legacy one below on
 * purpose: startup wipes the legacy keys unconditionally, so reusing one of
 * them would delete the dev token on every reload.
 */
const DEV_TOKEN_KEY = "tenka-studio-dev-token";

/**
 * Every key a build before 6a is known to have written a device credential
 * to. Both are cleared, not just this repo's own: `tenka.token` is the key
 * named in the 6a brief, and removing a key that was never written costs
 * nothing while missing one leaves a live secret readable.
 */
const LEGACY_TOKEN_KEYS = ["tenka-studio-device-token", "tenka.token"] as const;

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readDevToken(): string | null {
  if (!hasStorage()) return null;
  try {
    return window.localStorage.getItem(DEV_TOKEN_KEY);
  } catch {
    // Private-mode Safari throws on access rather than returning null;
    // treated the same as "no token" rather than crashing the caller.
    return null;
  }
}

export function setDevToken(token: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(DEV_TOKEN_KEY, token);
  } catch {
    // Storage unavailable or full -- the caller already verified the token
    // against the daemon, so failing to persist it just means the next reload
    // asks again, not a broken connection now.
  }
}

export function clearDevToken(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(DEV_TOKEN_KEY);
  } catch {
    // Nothing to do if storage itself is unreachable.
  }
}

/**
 * Removes any device token a pre-6a build left in storage. Called once at
 * startup (`initAuth()` in `store/auth-store.ts`).
 *
 * Actively cleared rather than merely unread: the daemon stopped accepting
 * these the moment pairing moved to a cookie, so the value can never be
 * useful again -- but it can still be read by injected script, and "dead" is
 * not a property a stolen string advertises.
 */
export function clearLegacyTokens(): void {
  if (!hasStorage()) return;
  for (const key of LEGACY_TOKEN_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Same as above -- an unreachable storage has nothing to leak either.
    }
  }
}

type RevocationListener = () => void;

const revocationListeners = new Set<RevocationListener>();

/**
 * Subscribe to "the daemon refused this credential". Returns its own
 * unsubscribe, so an effect can `return onSessionRevoked(...)` directly.
 *
 * The signal lives here rather than in a store because this module is the one
 * thing both discoverers of a revocation already import: `services/http.ts` (a
 * 401) and `hooks/useEventStream.ts` (a 1008 close) are on opposite sides of
 * the app and neither may reach for a React router. A listener set rather than
 * a `revoked: boolean` slice for the same reason `clearDevToken()` is not one:
 * revocation is an event, and a flag would have to be un-set again by hand --
 * a stale `true` would bounce the next successfully paired session straight
 * back out.
 */
export function onSessionRevoked(listener: RevocationListener): () => void {
  revocationListeners.add(listener);
  return () => {
    revocationListeners.delete(listener);
  };
}

/**
 * What to call when the daemon itself rejects this browser's credential, as
 * opposed to the user replacing it. Distinct from `clearDevToken()`: that one
 * is a storage operation and stays silent (the connect screen uses it), while
 * this one is the app-wide statement that the current session is over.
 *
 * The cookie is `httpOnly`, so this cannot delete it -- the daemon expires it
 * on its own side, and a request carrying a dead cookie 401s again anyway.
 * What this can do is stop the app from acting as though it were still signed
 * in, and drop the bearer fallback so the dev path cannot re-present a
 * credential she just refused.
 *
 * Cleared before the listeners run, for that reason.
 */
export function revokeSession(): void {
  clearDevToken();
  // Copied first: a listener is free to unsubscribe itself while running.
  for (const listener of [...revocationListeners]) listener();
}
