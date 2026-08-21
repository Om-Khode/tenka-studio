"use client";

/**
 * The desktop prints a device token once; the user pastes it here. This is
 * deliberately the same shape Milestone 6's QR pairing takes -- a secret the
 * desktop displays, carried across out of band -- so only the input method
 * differs, not the verify/report flow below.
 *
 * **What this screen does with the token is the whole point of it.** It used
 * to `setDevToken(token)` -- a real, live device credential written into
 * `localStorage`, where any injected script can read it. Milestone 6a moved
 * every other credential out of exactly that place and into an `httpOnly`
 * cookie the page cannot read; this screen was the one path that still
 * preserved the weakness the milestone removed everywhere else. Worse, it did
 * not even work: the event socket authenticates by cookie alone (a browser
 * cannot put a header on a WebSocket handshake, and the query-string
 * exception was deliberately deleted), so a session connected this way had
 * working HTTP and a socket that closed 1008 on every attempt -- LIVE ·
 * RECONNECTING forever, with every chat reply stranded on the socket that
 * never opened.
 *
 * So the token is now handed to `POST /v1/session/cookie`, which verifies it
 * and hands the same credential back as the cookie. One round trip does both
 * jobs: a 401 is "she didn't recognize that", and a 204 means the browser now
 * holds a credential this page cannot read and the socket can use.
 */
import { useState, type FormEvent } from "react";
import { apiSend, ApiError, isSameOriginBase } from "@/services/http";
import { clearDevToken, setDevToken } from "@/services/token";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "checking" | "rejected" | "unreachable" | "failed";

/**
 * "Rejected" (401 -- check the token) and "not answering" (network, status
 * 0 -- start the daemon) are different problems with different fixes.
 * Collapsing them into one "could not connect" message would leave the most
 * common case -- she simply isn't running -- with no hint of what to do.
 * Anything else (a 403, a 500, a malformed envelope) gets a generic message
 * rather than inventing a taxonomy this screen has no way to act on.
 */
const MESSAGES: Record<Exclude<Phase, "idle" | "checking">, string> = {
  rejected: "She didn't recognize that token. Copy it again from her window and try once more.",
  unreachable: "Can't reach her at all -- is TENKA running on this machine?",
  failed: "Something went wrong checking that token. Try again.",
};

export interface ConnectFormProps {
  /** Fired once the pasted token has been exchanged for a session cookie. */
  onConnected?: () => void;
}

export function ConnectForm({ onConnected }: ConnectFormProps) {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [showEmptyError, setShowEmptyError] = useState(false);

  const busy = phase === "checking";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // People paste with trailing whitespace -- a token that is otherwise
    // correct must not be rejected over it.
    const token = value.trim();
    if (!token) {
      setShowEmptyError(true);
      return;
    }
    setShowEmptyError(false);
    setPhase("checking");

    // Verify and exchange in one request. The candidate rides it as an
    // explicit `Authorization` header -- `services/http.ts` lets a
    // caller-supplied header win over the stored token, and marks the request
    // as not spending the current session, precisely so this screen can offer
    // a token it has no reason to trust yet without a mistyped one tearing
    // down a session that was working.
    //
    // The route refuses anything that is not a loopback listener, which is the
    // same rule the daemon already applies to bearer itself: the exchange only
    // means anything where the two credential channels can disagree, and the
    // only listener that accepts a header at all is this machine's own.
    try {
      await apiSend("POST", "/v1/session/cookie", undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Where the cookie can actually land -- the bundle the daemon serves
      // herself, which is same-origin by construction -- this screen keeps
      // nothing. That is the entire fix: the credential now lives somewhere
      // script cannot read, and `clearDevToken()` makes sure an older build's
      // dev token is not left sitting beside it.
      //
      // Under `next dev` the page is :3000 and the daemon is :8787, so the
      // browser discards the `Set-Cookie` it just received (`credentials:
      // "same-origin"` here, `allow_credentials=False` there) and no cookie
      // will ever be attached to a request or a handshake. The bearer is not a
      // convenience in that configuration, it is the only channel that exists
      // -- and the daemon offers it there and nowhere else, deliberately. So
      // the token is written in exactly that case, on a developer's own
      // loopback, and never in anything a user runs.
      if (isSameOriginBase()) {
        clearDevToken();
      } else {
        setDevToken(token);
      }
      setPhase("idle");
      onConnected?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setPhase("rejected");
      } else if (err instanceof ApiError && err.status === 0) {
        setPhase("unreachable");
      } else {
        setPhase("failed");
      }
    }
  }

  const errorMessage = showEmptyError
    ? "paste the token she printed first"
    : phase !== "idle" && phase !== "checking"
      ? MESSAGES[phase]
      : null;

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3" noValidate>
      <label
        htmlFor="device-token"
        className="font-mono text-[10px] uppercase tracking-widest text-bone-ghost"
      >
        device token
      </label>
      <input
        id="device-token"
        name="device-token"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={busy}
        onChange={(event) => {
          setValue(event.target.value);
          setShowEmptyError(false);
        }}
        placeholder="paste what she printed"
        className="w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-ghost focus:border-border-strong focus:outline-none disabled:opacity-40"
      />

      {errorMessage && (
        <p role="alert" className="font-mono text-xs text-fail">
          {errorMessage}
        </p>
      )}

      <Button type="submit" variant="primary" size="md" disabled={busy}>
        {busy ? "checking…" : "connect"}
      </Button>
    </form>
  );
}
