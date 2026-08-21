/**
 * "She said no" versus "she isn't answering", as copy.
 *
 * Every failing surface in Studio used to say the same thing -- "She could not
 * reach X." -- whatever went wrong, and several of them offered a TRY AGAIN
 * button underneath it. For a device paired `observe`-only that is wrong twice:
 * the sentence blames the connection for a permissions decision she made
 * deliberately, and the button promises a retry that a 403 will refuse exactly
 * as many times as it is clicked.
 *
 * The signal that tells the two apart is the session, not the error. A 403 is
 * only observable after a request has been made, and most of Studio's loaders
 * throw the error away and keep a bare `status: "error"` -- but `GET /v1/session`
 * has already said what this connection may do, before any of them ran. So the
 * primary test here is `session.effective`, and `isRefusalError` is the backstop
 * for the case the session did not predict (the probe had not landed, or the
 * daemon changed its mind underneath us).
 *
 * Two refusals, not one, because they have different fixes:
 *
 * - **device** -- pairing never issued this capability. Only re-pairing changes
 *   it, and only from the machine itself.
 * - **connection** -- pairing DID issue it, but the listener this request
 *   arrived on is capped lower (funnel's ceiling excludes `execute` and
 *   `system_control`, so a device paired with those genuinely cannot use them
 *   over that URL). The same phone, reconnected over tailnet or loopback,
 *   gets the capability back without touching the pairing at all.
 *
 * Collapsing those into one "not allowed" would throw away the only sentence
 * the user can act on. Pure module on purpose -- store/chat-store.ts needs this
 * outside React, from a `.getState()` read.
 *
 * Milestone 6b adds a third state, and it is not a refusal at all: **raised**.
 * `session.raised` names which of `effective`'s capabilities are only there
 * because someone deliberately, temporarily lifted the ceiling
 * (`policy.py`'s `effective()` already folds a live raise into `effective`
 * before it reaches the wire -- see `SessionPayload`'s own docstring). A
 * control lit up by a raise is not the same story as one always enabled, so
 * `capabilityState()` below extends this file's two-reason refusal model into
 * a three-state read of the whole session -- granted, raised, or refused (for
 * either of the two reasons above) -- rather than a second, parallel mapping
 * living somewhere else. `refusalFor()` itself is unchanged: every existing
 * caller (FileList, EntityList, LoadFailure, chat-store, ...) keeps asking
 * exactly the question it always asked.
 */
import type { Capability, Session } from "@/types/session";

export type RefusalReason = "device" | "connection";

export interface Refusal {
  reason: RefusalReason;
  capability: Capability;
  /** One sentence: what is missing, and what would change it. */
  message: string;
}

/**
 * How each capability reads inside "your device wasn't given ___".
 *
 * Deliberately not `CAPABILITY_LABELS[c].label` lowercased: that set is written
 * to be a checkbox's accessible name ("Recall", "Chat send"), and "wasn't given
 * recall" is not a sentence a person can act on. These are the same permissions
 * described as reach rather than as enum members.
 */
const DENIED: Record<Capability, string> = {
  observe: "access to what she's doing",
  recall: "access to what she remembers",
  chat_send: "permission to message her",
  screen: "access to her screen",
  files: "access to her files",
  system_control: "system control",
  execute: "permission to let her replies act on this machine",
};

/** What a 403 says when nothing more specific is known about it. */
export const GENERIC_REFUSAL_MESSAGE =
  "She refused that -- this connection may not do it. Clicking again will get the same answer.";

function describe(capability: Capability, reason: RefusalReason, policy: string): string {
  const noun = DENIED[capability];
  if (reason === "device") {
    return `Your device wasn't given ${noun} when it paired. Pair it again from her machine to change that.`;
  }
  // The listener name is worth printing: it is the thing the user would change,
  // and they chose it themselves when they started serving Studio that way. A
  // daemon that reports no policy at all still gets a usable sentence.
  const listener = policy ? ` The ${policy} listener is capped lower than the device is.` : "";
  return `Your device has ${noun}, but the connection you're on won't carry it.${listener} Open Studio on her machine to use it.`;
}

/**
 * Why `capability` is unavailable on this session, or `null` if it is available
 * -- or if there is no session to ask, which is not the same as a refusal and
 * must never be rendered as one (the demo tree never probes at all).
 */
export function refusalFor(session: Session | null, capability: Capability): Refusal | null {
  if (!session) return null;
  if (session.effective.includes(capability)) return null;
  const reason: RefusalReason = session.granted.includes(capability) ? "connection" : "device";
  return { reason, capability, message: describe(capability, reason, session.policy) };
}

/**
 * Whether a thrown value is the daemon refusing rather than failing. Duck-typed
 * on `status` instead of `instanceof ApiError` so this module stays free of
 * services/http.ts -- lib/ sits below services/ everywhere else in Studio, and
 * a copy helper is not a reason to invert that.
 */
export function isRefusalError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 403
  );
}

// ─── the three-state session view (Milestone 6b) ─────────────────────────

/** Same shape as `describe()`'s two cases above, but for a capability that
 * currently works only because of a raise -- worded as a fact about NOW, not
 * a promise: it says nothing about what happens when the raise ends, because
 * this file has no opinion on that beyond the countdown the caller already
 * has (`seconds`, converted from `session.raiseExpiresInSeconds`). */
function describeRaised(capability: Capability, seconds: number | null): string {
  const noun = DENIED[capability];
  const countdown =
    seconds === null
      ? ""
      : ` Ends in ${Math.max(0, Math.round(seconds / 60))} minute${Math.round(seconds / 60) === 1 ? "" : "s"}.`;
  return `Your device has ${noun} right now because someone raised it at the keyboard.${countdown}`;
}

export type CapabilityState =
  | { readonly kind: "granted" }
  | { readonly kind: "raised"; readonly message: string }
  | ({ readonly kind: "refused" } & Refusal);

/**
 * The full three-state read of one capability on one session --
 * `SessionPayload`'s own "issued / effective / raised" distinction, turned
 * into the one piece of rendered copy each state needs. Composes
 * `refusalFor()` for the two denial reasons rather than re-deriving them, so
 * the two functions can never disagree about what "refused" means.
 *
 * Requires a real `session` -- unlike `refusalFor`, which treats "no session"
 * as "not refused" for every existing caller's sake (the demo tree never
 * probes). A caller here already has one: this is the session VIEW, and it
 * has nothing to show without a session to read.
 */
export function capabilityState(session: Session, capability: Capability): CapabilityState {
  // `raised` is a subset of `effective` (services/http.ts's `toSession()`
  // -- the daemon folds a live raise into `effective` before it ever reaches
  // the wire), so this check has to come before the refusal check below:
  // `refusalFor` would answer `null` (not refused) for a raised capability,
  // which is true but is not the same sentence as "raised".
  if (session.raised?.includes(capability)) {
    return { kind: "raised", message: describeRaised(capability, session.raiseExpiresInSeconds ?? null) };
  }
  const refusal = refusalFor(session, capability);
  if (refusal) return { kind: "refused", ...refusal };
  return { kind: "granted" };
}
