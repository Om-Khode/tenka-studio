/**
 * What this connection is, and what it may do.
 *
 * The daemon's `Capability` enum, spelled once here so a stale member cannot
 * hide in a string comparison. That is not a hypothetical: the set changed in
 * Milestone 6a -- `chat` split into `observe` (status, telemetry, the live
 * stream) and `recall` (transcripts, the knowledge graph), while `chat_send`
 * stayed as it was -- and a component still comparing against `"chat"` would
 * not have errored. It would have quietly returned false, disabled a control,
 * and cost somebody an afternoon working out why the button was grey. A union
 * type turns that into a compile error instead.
 *
 * `execute` (Milestone 6b) is the seventh member. It is never ticked by
 * default in the pairing UI (see PairDeviceDialog) -- see its own comment for
 * why that default is a deliberate, argued decision and not a mechanical
 * consequence of the enum growing.
 *
 * Wire payloads still arrive as `string[]` (openapi.json types `grants` and
 * `effective` as free strings, deliberately -- the daemon must be able to add
 * a capability without a client refusing to parse the response). `isCapability`
 * is the one sanctioned crossing from that to this.
 */

export const CAPABILITIES = [
  "observe",
  "recall",
  "chat_send",
  "screen",
  "files",
  "system_control",
  "execute",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITIES);

/** Narrows a wire string to a `Capability`, or reports that this build has never heard of it. */
export function isCapability(value: string): value is Capability {
  return CAPABILITY_SET.has(value);
}

/**
 * `GET /v1/session`, as the rest of Studio should read it.
 *
 * `granted` and `effective` are two lists on purpose, and the UI needs both.
 * `granted` is what this device was issued when it paired; `effective` is what
 * survives the listener's ceiling on *this* connection (funnel's ceiling
 * excludes `execute` and `system_control`, so a device paired with those
 * genuinely cannot use them over that URL). A control greyed out because
 * the device never held the capability is a different sentence to the user
 * than one greyed out because the tunnel it is on refuses to carry it, and
 * collapsing the two into one list makes that difference unsayable.
 *
 * `canUse()` therefore reads `effective`, never `granted` -- what the device
 * holds somewhere else is not what this connection can do right now.
 *
 * `raised` (Milestone 6b) is a third story again, and a subset of `effective`
 * rather than something beside it -- the daemon already folds a live raise
 * into `effective` before it ever reaches the wire (`policy.py`'s `effective()`
 * takes the raise into account, and `SessionPayload.effective` is read straight
 * off that). `raised` names WHICH of the currently-effective capabilities are
 * only there because someone deliberately, temporarily lifted the ceiling --
 * so a control lit up by a raise can be told apart from one that was simply
 * always on. Optional here (unlike the wire shape, which never omits it)
 * because most of Studio's own tests build a `Session` by hand for a scenario
 * that has nothing to do with raising anything; every real session -- built by
 * `toSession()` in services/http.ts -- always carries both.
 */
export interface Session {
  readonly deviceId: string;
  readonly label: string;
  /** What pairing issued this device. Explanatory only -- never the gate. */
  readonly granted: readonly string[];
  /** What this connection can actually carry. The gate. */
  readonly effective: readonly string[];
  /** The listener policy that produced `effective` (e.g. "local", "tailnet", "funnel"). */
  readonly policy: string;
  /**
   * Which of `effective`'s capabilities are live only because of a raise.
   * Empty (not omitted) when no raise is live -- see `toSession()`.
   */
  readonly raised?: readonly string[];
  /** Seconds until the raise named in `raised` expires, or `null` when it's empty. */
  readonly raiseExpiresInSeconds?: number | null;
  canUse(capability: Capability): boolean;
}
