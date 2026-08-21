"use client";

/**
 * Whether `/connect`'s token form has anywhere to go, asked of the daemon
 * rather than guessed from the URL.
 *
 * `POST /v1/session/cookie` is gated on `policy.allow_bearer` -- loopback
 * only -- so the token form always 401s on a tunnel. The operator's
 * reasonable ask was "only show it where it can work"; the wrong way to
 * answer that is `window.location.hostname === "127.0.0.1"`, because a
 * tunnel can present any hostname it likes -- that is exactly the
 * trust-the-hostname mistake Milestone 6b exists to close everywhere else.
 * So this asks `GET /v1/listener` instead, the same way every other
 * transport-aware surface in Studio asks the daemon rather than reading the
 * page's own address.
 *
 * **This is an affordance, not a security control.** The daemon enforces
 * `allow_bearer` regardless of what this component decides to render, so
 * every failure mode here -- the route 404s because it hasn't shipped yet,
 * the daemon does not answer, the response does not parse -- falls back to
 * today's behaviour (show the form) rather than failing closed. Locking a
 * user out of the only door they have over a probe that could not answer
 * would trade a wrong 401 for a worse, silent dead end.
 */
import { useEffect, useState } from "react";
import { ConnectForm, type ConnectFormProps } from "@/components/live/ConnectForm";
import { getListenerInfo, type ListenerInfo } from "@/services/http";

export function ConnectGate({ onConnected }: ConnectFormProps) {
  // `null` covers three cases the daemon cannot yet be asked to tell apart --
  // not answered yet, 404, unreachable -- and all three want the same
  // fallback, so collapsing them into one "unknown" state is the right
  // amount of detail rather than a gap.
  const [listener, setListener] = useState<ListenerInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getListenerInfo().then((info) => {
      if (!cancelled) setListener(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (listener === null || listener.allowBearer) {
    return (
      <>
        <p className="max-w-sm text-sm text-bone-dim">
          Paste the device token she printed when you started her. Studio checks it once,
          right now, and keeps it only if she answers.
        </p>
        <ConnectForm onConnected={onConnected} />
      </>
    );
  }

  if (listener.canPair) {
    return (
      <p className="max-w-sm text-sm text-bone-dim">
        This connection can&apos;t take a pasted token -- only her own machine
        does that. Pair this device instead: open Settings on her machine and
        scan the code from Devices &amp; pairing.
      </p>
    );
  }

  return (
    <p className="max-w-sm text-sm text-bone-dim">
      This connection can&apos;t take a pasted token, and can&apos;t pair
      either. Sit at her machine, or reach her over Tailscale instead.
    </p>
  );
}
