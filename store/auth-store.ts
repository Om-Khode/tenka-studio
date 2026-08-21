/**
 * Whether this browser is authorised, and what its connection may carry.
 *
 * Before Milestone 6a this was a `localStorage` read in `app/app/layout.tsx`:
 * a token was present, therefore the shell rendered. That was wrong twice
 * over. Presence was never validity -- a token the daemon had stopped
 * accepting still rendered the whole live tree, with every pane failing on its
 * own -- and since the credential became an `httpOnly` cookie it is not even
 * readable, so the check could not be made at all. The daemon answers instead,
 * via `GET /v1/session`, and this store is where that answer lives.
 *
 * Not persisted, deliberately. The only durable record of a session is the
 * cookie, on the daemon's side; a cached copy here would be a second opinion
 * that could disagree with it, which is the class of bug the probe exists to
 * end. A reload re-asks.
 */
import { create } from "zustand";
import { discardUnusableDevToken, probeSession } from "@/services/http";
import { clearLegacyTokens } from "@/services/token";
import type { Capability, Session } from "@/types/session";

/**
 * `unknown` is not a synonym for `unauthorized`, and the gate must not treat
 * it as one: the probe is a round trip, so there is a real window where the
 * answer is not in yet. Rendering the shell during it would fire requests
 * certain to 401; redirecting to the connect screen during it would bounce a
 * perfectly authorised user out on every page load.
 */
export type AuthPhase = "unknown" | "authorized" | "unauthorized";

/**
 * Why the probe said no. Both end up at the connect screen, but they are
 * different sentences to a user -- "she doesn't know this device" versus "she
 * isn't running" -- and only one of them is fixed by pairing again.
 */
export type AuthRefusal = "unauthorized" | "unreachable";

export interface AuthState {
  phase: AuthPhase;
  session: Session | null;
  refusal: AuthRefusal | null;
  /** Ask the daemon. Safe to call more than once; the last answer wins. */
  probe: () => Promise<void>;
  /** What a revocation does to this store. Never a network call. */
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  phase: "unknown",
  session: null,
  refusal: null,

  probe: async () => {
    try {
      const session = await probeSession();
      if (session) {
        set({ phase: "authorized", session, refusal: null });
      } else {
        set({ phase: "unauthorized", session: null, refusal: "unauthorized" });
      }
    } catch {
      // probeSession() resolves null for the one failure that is an answer
      // (401). Anything reaching here is the daemon not answering at all, or
      // answering something this client cannot read -- neither is authorisation
      // and neither may render the shell, but the distinction is kept so the
      // screen the user lands on can say which happened.
      set({ phase: "unauthorized", session: null, refusal: "unreachable" });
    }
  },

  clear: () => set({ phase: "unauthorized", session: null, refusal: "unauthorized" }),
}));

/**
 * Startup housekeeping, called once by the live tree's layout before it
 * probes. Everything here is synchronous and local -- it must not depend on
 * the daemon being reachable.
 *
 * Two jobs, and they are the same job twice: get every credential this build
 * can no longer legitimately use out of `localStorage`, rather than leaving it
 * there to be read. "Useless to us" is not "useless to an attacker".
 *
 * 1. The device token a pre-6a build wrote. The daemon stopped accepting those
 *    the moment pairing moved to a cookie.
 * 2. A dev token held while `apiBase()` does not point at this machine. Bearer
 *    is loopback-only on the daemon's side, so against any other base that
 *    token can only ever be refused -- after crossing whatever is in between.
 */
export function initAuth(): void {
  clearLegacyTokens();
  discardUnusableDevToken();
}

/**
 * Whether this connection may do `capability` -- reads `effective`, never
 * `granted`. A device issued `execute` at pairing that is currently reaching
 * her over funnel (ceiling excludes `execute`) genuinely cannot run code
 * right now, and a control that claims otherwise fails at the daemon instead
 * of at the button.
 *
 * A hook, so a component re-renders when the probe lands rather than reading
 * `unknown` once at mount and staying grey forever.
 */
export function useCanUse(capability: Capability): boolean {
  return useAuthStore((s) => s.session?.canUse(capability) ?? false);
}
