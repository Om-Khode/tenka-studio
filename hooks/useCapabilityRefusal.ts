"use client";

/**
 * The React half of lib/refusal.ts.
 *
 * `useLoadFailure` is what almost every caller wants, and it exists rather than
 * leaving each surface to compose the pieces because composing them wrongly is
 * the bug this whole fix is about: a shared helper that returns a sentence, and
 * nine call sites that each still decide on their own whether to draw a retry
 * button, would have fixed nothing. So the hook returns the sentence AND the
 * `refused` flag that governs the button, from one place, and every caller
 * either renders <LoadFailure/> or reads both fields.
 *
 * Neither hook returns anything until the probe has landed. "Unknown" is not
 * "refused" -- the same stance store/auth-store.ts takes for `phase`, and the
 * reason a component's own unit test (which mounts it with no probe run) still
 * sees the plain unreachable copy.
 */
import { useAuthStore } from "@/store/auth-store";
import { refusalFor, isRefusalError, GENERIC_REFUSAL_MESSAGE, type Refusal } from "@/lib/refusal";
import type { Capability } from "@/types/session";

/** Why this connection may not use `capability`, or null if it may (or if we don't know yet). */
export function useCapabilityRefusal(capability: Capability): Refusal | null {
  const phase = useAuthStore((s) => s.phase);
  const session = useAuthStore((s) => s.session);
  // Computed outside the selector deliberately: `refusalFor` allocates, and a
  // selector returning a fresh object on every store read is how zustand v5
  // gets talked into an infinite re-render.
  return phase === "authorized" ? refusalFor(session, capability) : null;
}

export interface LoadFailure {
  /** True when nothing about clicking again would help. Governs the retry control. */
  refused: boolean;
  /** The one sentence to render. Never blames the connection for a refusal. */
  message: string;
}

/**
 * What a failed load should say, and whether it may offer a retry.
 *
 * @param capability  what the failed request needed -- see the daemon's own
 *                    `require(...)` on the route (files -> FILES, memory and
 *                    enrollment -> RECALL, audit -> SYSTEM_CONTROL, telemetry,
 *                    settings, personality and the command list -> OBSERVE).
 * @param unreachable what to say when this really was the daemon not answering.
 * @param error       the thrown value, where the caller still has it. A 403 the
 *                    session did not predict still reads as a refusal.
 */
export function useLoadFailure(
  capability: Capability,
  unreachable: string,
  error?: unknown,
): LoadFailure {
  const refusal = useCapabilityRefusal(capability);
  if (refusal) return { refused: true, message: refusal.message };
  if (isRefusalError(error)) return { refused: true, message: GENERIC_REFUSAL_MESSAGE };
  return { refused: false, message: unreachable };
}
