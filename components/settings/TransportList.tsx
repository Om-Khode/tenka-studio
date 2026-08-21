"use client";

/**
 * One card per transport: `GET /v1/transports`'s doors, in the daemon's own
 * words. Same placement and shape as DeviceList/PairDeviceDialog -- a Card
 * per concern, loopback-admin-gated the same way, no separate "open" step to
 * test around.
 *
 * `ceiling` and `raisable` are rendered straight off each `TransportPayload`,
 * never hand-copied here (see the payload's own doc in payloads.py) --
 * this list would otherwise carry a second table of what each transport may
 * carry that could silently drift from what the daemon actually enforces.
 *
 * The three transports read very differently to a person deciding whether to
 * start one, and that difference is written here as fixed, per-name copy
 * rather than derived from `ceiling`/`raisable` -- those sets say WHAT each
 * transport carries, not WHO can reach it or who else can read it, which is
 * a fact about the transport's own nature (WireGuard vs. a public URL vs. a
 * third party terminating TLS) that no API response states directly. This is
 * the one place in the four Milestone 6b surfaces that names a transport by
 * string rather than reading everything off the wire -- see the file's own
 * `TRANSPORT_COPY` for why that is a description of software TENKA ships,
 * not app-specific policy: a fourth adapter lands with its own row here as
 * plainly as it lands its own module in transports/.
 *
 * **Hostnames are untrusted text** (spec §8's XSS row). `url` comes from
 * whatever the tunnel provider printed to a subprocess's own stdout
 * (transports/*.py's hostname parsing), so it is rendered as plain text and
 * used only as an `<a href>` -- never `dangerouslySetInnerHTML`, and never
 * built into a template string that reaches innerHTML. React escapes text
 * content by default; the one sink worth guarding by hand is the `href`
 * itself, which is why it is only ever the literal `url` string, untouched.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CAPABILITY_LABELS } from "@/lib/capability-labels";
import { isCapability } from "@/types/session";
import type { components } from "@/types/api";

type TransportPayload = components["schemas"]["TransportPayload"];

function grantLabel(grant: string): string {
  return isCapability(grant) ? CAPABILITY_LABELS[grant].label : grant;
}

interface TransportCopy {
  /** Who can even reach a URL on this transport. */
  reach: string;
  /** Who else, besides a device Studio paired, can read what crosses it. */
  reads: string;
}

/**
 * Fixed per-name copy for the three transports TENKA ships today
 * (transports/tailscale.py, transports/cloudflare.py). A fourth adapter that
 * registers under a name not listed here still renders a full card -- start,
 * stop, URL, ceiling and raisable straight off the wire -- just without this
 * one paragraph of prose, which is a real gap and the honest one: this file
 * cannot know what a transport nobody has written yet is trusted with. It
 * gets a one-line honest fallback instead of nothing (see the render below),
 * so a name this table has never heard of never reads as blank.
 *
 * Whether a transport can be paired over is `TransportPayload.pairable`
 * itself (`policy.pairable` on the daemon), read straight off the wire below
 * rather than duplicated in this table -- a hand-maintained copy of a value
 * the daemon already sends is exactly the drift this milestone kept finding.
 */
const TRANSPORT_COPY: Record<string, TransportCopy> = {
  tailnet: {
    reach: "Only devices signed into your own Tailscale account.",
    reads: "Nobody else -- WireGuard carries it end to end.",
  },
  funnel: {
    reach: "Anyone who has the URL, from the open internet.",
    reads: "Nobody else -- TLS is still terminated on this machine.",
  },
};

export interface TransportListProps {
  transports: TransportPayload[];
  /** Whether starting/stopping is available on this session -- the same
   * loopback + system_control precondition DeviceList's revoke uses. */
  refused: boolean;
  refusedMessage: string | null;
  onStart: (name: string) => Promise<void>;
  onStop: (name: string) => Promise<void>;
}

export function TransportList({
  transports,
  refused,
  refusedMessage,
  onStart,
  onStop,
}: TransportListProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function toggle(t: TransportPayload) {
    setBusy(t.name);
    try {
      if (t.running) await onStop(t.name);
      else await onStart(t.name);
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Nothing to report beyond the button simply not flipping to "copied" --
      // the URL is still on screen as plain text to select by hand.
    }
  }

  return (
    // Item 4: no heading here -- `AppSettingsPage`'s `TransportsPanel` wrapper
    // (app/app/settings/page.tsx) already renders the "transports" <h2> above
    // this Card, the same shape `DevicesPanel` uses over `PairDeviceDialog`/
    // `DeviceList` below it. This component used to render its own, identical
    // heading a second time immediately under that wrapper's.
    <Card className="flex flex-col gap-3 p-4">
      {refused && refusedMessage && <p className="text-xs text-amber">{refusedMessage}</p>}

      <ul className="flex flex-col gap-3">
        {transports.map((t) => {
          const copy = TRANSPORT_COPY[t.name];
          return (
            <li key={t.name} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs uppercase tracking-wide text-bone">
                  {t.name}
                </span>
                <span
                  className={
                    t.running
                      ? "font-mono text-[10px] uppercase tracking-wide text-moss"
                      : "font-mono text-[10px] uppercase tracking-wide text-bone-ghost"
                  }
                >
                  {t.running ? "running" : "stopped"}
                </span>
              </div>

              {copy ? (
                <p className="text-xs text-bone-dim">
                  <span className="text-bone">Reach:</span> {copy.reach}
                  <br />
                  <span className="text-bone">Reads:</span> {copy.reads}
                </p>
              ) : (
                <p className="text-xs text-bone-dim">
                  No reach/read description shipped for this transport yet --
                  ceiling and raisable below still reflect what the daemon
                  actually enforces.
                </p>
              )}

              {!t.pairable && (
                <p className="text-xs text-bone-dim">
                  Watch-only -- no device can ever be paired over it.
                </p>
              )}

              {t.running && t.url && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* `t.url` is untrusted text off a subprocess's stdout
                      (spec §8) -- rendered as plain text, and used as an
                      `href` and nothing else. Never innerHTML. */}
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="truncate font-mono text-[11px] text-bone-dim underline decoration-border hover:text-bone"
                  >
                    {t.url}
                  </a>
                  <button
                    type="button"
                    onClick={() => void copyUrl(t.url!)}
                    className="font-mono text-[10px] uppercase tracking-wide text-bone-ghost hover:text-bone"
                  >
                    {copied === t.url ? "copied" : "copy"}
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-bone-ghost">
                <span>
                  ceiling:{" "}
                  {t.ceiling.length > 0 ? t.ceiling.map(grantLabel).join(", ") : "none"}
                </span>
                <span>
                  raisable:{" "}
                  {t.raisable.length > 0 ? t.raisable.map(grantLabel).join(", ") : "never"}
                </span>
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                disabled={refused || busy === t.name}
                title={refused ? (refusedMessage ?? undefined) : undefined}
                onClick={() => void toggle(t)}
              >
                {busy === t.name ? "working…" : t.running ? "stop" : "start"}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
