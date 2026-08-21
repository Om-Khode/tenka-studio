"use client";

/**
 * Where a phone lands after scanning the pairing QR. The daemon encodes
 * `https://<endpoint>/pair#<code>` -- the URL FRAGMENT, not a query string --
 * because a fragment is never sent to a server: it appears in no access log,
 * not the daemon's and not a tunnel's in front of it (Milestone 6b). Every
 * read of the code below stays inside that boundary on purpose:
 *
 *   - The code is read straight from `window.location.hash`, never from
 *     `useSearchParams()` or any request property a server could see.
 *   - It travels to the daemon exactly once, as the JSON body of
 *     `POST /v1/pair` -- never interpolated into a URL, never logged.
 *   - It is never held in component state and never rendered. The only place
 *     it exists as a string is a local variable inside `exchange()` (and,
 *     briefly, the controlled manual-entry input -- cleared the instant it is
 *     submitted, before the request goes out).
 *   - On success the fragment is scrubbed from session history
 *     (`history.replaceState`, not a navigation) so a screenshot, a shared
 *     screen, or a synced browser history doesn't outlive the code's own
 *     three-minute, single-use window.
 *
 * A refusal deliberately leaves the fragment alone: "unreachable" is the one
 * failure where the code was never actually spent, and a person who starts
 * TENKA and taps the form again should not have to re-scan for it.
 *
 * **This route is a static export (`next.config`'s `output: "export"`), and
 * that forces a one-frame flash on a real fragment landing.** The prerendered
 * HTML is built with no request in hand -- a fragment is never even sent to a
 * server, so there is no server-side rendering pass that could know one
 * exists -- so the shipped markup is always the idle, no-code state. React's
 * hydration contract requires the first CLIENT render to match that exact
 * markup or it logs a mismatch and discards it, so `phase` below starts as a
 * fixed `"idle"` unconditionally; only the effect that runs after mount reads
 * `window.location.hash` and flips to `"exchanging"`. A phone landing with a
 * code genuinely sees "Pair this device" for one frame before "Pairing…"
 * replaces it. That flash is structural, not a bug in this component: a
 * fragment-carrying URL never reaches anything that renders HTML for it, by
 * design, so nothing server-side could ever have produced the "Pairing…"
 * markup up front. The alternative -- sending the code somewhere it could be
 * rendered ahead of time -- is exactly the design this file exists to refuse.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { notFound, useRouter } from "next/navigation";
import { apiSend, ApiError } from "@/services/http";
import { isPublicDemoBuild } from "@/services/deployment";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "exchanging" | "refused" | "unreachable" | "failed";

/**
 * Every refusal the daemon can give for `POST /v1/pair` -- wrong code,
 * expired, already used -- comes back as the identical 401, and deliberately
 * so: a status that told them apart would be a valid-code oracle. Inventing a
 * distinction here would be lying to the one person who can least afford a
 * wrong guess, standing at a laptop holding a phone. "Unreachable" stays its
 * own message because it names a genuinely different fix: start her, don't
 * re-scan.
 */
const MESSAGES: Record<Exclude<Phase, "idle" | "exchanging">, string> = {
  refused: "That didn't work -- the code is wrong, expired or already used. Ask the laptop for a fresh one.",
  unreachable: "Can't reach her at all -- is TENKA running on this network?",
  failed: "Something went wrong pairing this device. Try again.",
};

/**
 * Everything after the leading `#`. `""` when there is none, and also during
 * the server-rendered pass -- this is a static export (see `next build`'s
 * page data collection), so `window` does not exist yet the first time this
 * runs. The client-side render that follows has the real `window` and is
 * what the auto-exchange effect below acts on.
 */
function codeFromFragment(): string {
  if (typeof window === "undefined") return "";
  return window.location.hash.slice(1);
}

/**
 * Scrubs a spent code out of session history. `replaceState`, not a router
 * navigation -- this isn't one, and a navigation would add a "back" entry
 * that still carries the fragment it's meant to erase.
 */
function clearFragment(): void {
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", pathname + search);
}

export default function PairPage() {
  // Same reasoning as app/connect/page.tsx: a public demo build has no
  // daemon on the other end of this exchange, so a page that can only ever
  // fail is worse than a 404.
  if (isPublicDemoBuild()) notFound();

  const router = useRouter();
  // Guards against a duplicate auto-attempt (e.g. a dev-mode double effect
  // invocation) firing the one-time code twice.
  const attemptedFragment = useRef(false);
  // Always "idle" on the first render, deliberately -- see the module
  // docstring. Reading `codeFromFragment()` here (as this line once did)
  // would make the first CLIENT render diverge from the statically exported
  // HTML, which is always "idle" because a fragment never reaches whatever
  // produced that HTML. Only the effect below, which runs after that first
  // render has already committed, is allowed to look at the real fragment.
  const [phase, setPhase] = useState<Phase>("idle");
  const [manualCode, setManualCode] = useState("");
  const [showEmptyError, setShowEmptyError] = useState(false);

  async function exchange(code: string) {
    setPhase("exchanging");
    try {
      await apiSend("POST", "/v1/pair", { code });
      clearFragment();
      router.push("/app");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setPhase("refused");
      } else if (err instanceof ApiError && err.status === 0) {
        setPhase("unreachable");
      } else {
        setPhase("failed");
      }
    }
  }

  useEffect(() => {
    if (attemptedFragment.current) return;
    const code = codeFromFragment();
    if (!code) return;
    attemptedFragment.current = true;
    void exchange(code);
    // exchange() closes over `router`, which next/navigation guarantees
    // stable for the page's lifetime; re-running this per render would
    // re-fire a one-time code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = manualCode.trim();
    if (!code) {
      setShowEmptyError(true);
      return;
    }
    setShowEmptyError(false);
    // Cleared before the request goes out, not after it settles -- the typed
    // code must not still be sitting in this input if the tab is looked at
    // mid-flight, let alone after.
    setManualCode("");
    await exchange(code);
  }

  const busy = phase === "exchanging";
  const message = phase !== "idle" && phase !== "exchanging" ? MESSAGES[phase] : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-bone-ghost">
        TENKA STUDIO
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight text-bone">
          {busy ? "Pairing…" : "Pair this device"}
        </h1>
        <p className="max-w-sm text-sm text-bone-dim">
          {busy
            ? "Checking the code from the QR you scanned."
            : "Scan the QR she showed you, or type the code printed alongside it."}
        </p>
      </div>

      {message && (
        <p role="alert" className="max-w-sm font-mono text-xs text-fail">
          {message}
        </p>
      )}

      {!busy && (
        <form onSubmit={handleManualSubmit} className="flex w-full max-w-sm flex-col gap-3" noValidate>
          <label
            htmlFor="pairing-code"
            className="font-mono text-[10px] uppercase tracking-widest text-bone-ghost"
          >
            pairing code
          </label>
          <input
            id="pairing-code"
            name="pairing-code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={manualCode}
            onChange={(event) => {
              setManualCode(event.target.value);
              setShowEmptyError(false);
            }}
            placeholder="XXXX-XXXX"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-ghost focus:border-border-strong focus:outline-none"
          />

          {showEmptyError && (
            <p role="alert" className="font-mono text-xs text-fail">
              type the code first
            </p>
          )}

          <Button type="submit" variant="primary" size="md">
            pair
          </Button>
        </form>
      )}
    </main>
  );
}
