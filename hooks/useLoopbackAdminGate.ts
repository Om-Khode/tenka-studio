"use client";

/**
 * Whether THIS connection is known, right now, to be refused by every
 * pairing/device-management route -- mint (`POST /v1/pair/code`), list
 * (`GET /v1/devices`), revoke (`DELETE /v1/devices/{id}`). All three share
 * one daemon-side precondition: the request must arrive on the loopback
 * listener AND this device must hold `system_control`. `session.policy`
 * and `useCanUse("system_control")` are the two client-side signals for
 * that -- neither is authoritative on its own, the daemon still enforces
 * it -- but together they're enough to explain a refusal proactively
 * instead of only after a 403 that a person had to click a button to
 * discover.
 *
 * One hook rather than three copies of this check (PairDeviceDialog,
 * DeviceList, and the devices panel in app/app/settings/page.tsx all use
 * it), so the three pairing surfaces can never drift into answering "can I
 * use this?" three different ways.
 *
 * `known` is false until the session probe has actually landed
 * (`phase === "authorized"`). Before that -- true of every render in a
 * component's own unit tests, which mount it standalone with no probe run
 * -- `refused` stays false too: "unknown" must not be read as "refused",
 * the same stance store/auth-store.ts itself takes for `phase`.
 */
import { useAuthStore, useCanUse } from "@/store/auth-store";
import { refusalFor } from "@/lib/refusal";
import type { Session } from "@/types/session";

export interface LoopbackAdminGate {
  /** Whether the probe has actually landed, so `refused` means something. */
  known: boolean;
  /** Only meaningful when `known` is true. */
  refused: boolean;
  /**
   * Why -- naming the half of the precondition that actually failed. Null
   * unless `refused`.
   */
  message: string | null;
}

export function useLoopbackAdminGate(): LoopbackAdminGate {
  const phase = useAuthStore((s) => s.phase);
  const session = useAuthStore((s) => s.session);
  const hasSystemControl = useCanUse("system_control");

  const known = phase === "authorized" && session !== null;
  const refused = known && (session!.policy !== "local" || !hasSystemControl);

  return { known, refused, message: refused ? explain(session!) : null };
}

/**
 * This gate has TWO conditions -- loopback listener AND `system_control` --
 * and for a while it only ever named the first. A person on `127.0.0.1` with
 * an `observe`-only device read "she refuses it from anywhere else, including
 * a tunnel", which was not merely unhelpful: it was false about where they
 * were standing, and sent them looking for a networking problem that did not
 * exist. Whichever condition actually failed is the one that gets said.
 *
 * The listener is checked first because it subsumes the other: an off-loopback
 * connection has `system_control` stripped from `effective` by the ceiling
 * anyway, so reporting the missing capability there would describe a symptom
 * and hide the cause.
 */
function explain(session: Session): string {
  if (session.policy !== "local") return LOOPBACK_ADMIN_REFUSED_MESSAGE;
  return refusalFor(session, "system_control")?.message ?? LOOPBACK_ADMIN_REFUSED_MESSAGE;
}

/**
 * The one sentence for the listener half of the refusal -- shared so mint,
 * list, and revoke never phrase the same daemon precondition three different
 * ways. Prefer `useLoopbackAdminGate().message`, which picks between this and
 * the capability sentence; this is exported for the callers that need the
 * listener wording on its own.
 */
export const LOOPBACK_ADMIN_REFUSED_MESSAGE =
  "This only works from Settings on this machine itself, over her local address -- she refuses it from anywhere else, including a tunnel, by design.";
