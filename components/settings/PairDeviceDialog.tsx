"use client";

/**
 * Mints a pair code: label, seven grant checkboxes, then the QR and a
 * typeable code with a countdown. Not a modal -- it renders inline as its
 * own card, the same shape as the other settings panels (BackupPanel,
 * EnrollmentPanel), so there is no separate "open" step to test around.
 *
 * Four security decisions this file exists to keep visible, not just
 * implement:
 *
 * 1. **The checkboxes are the real boundary.** What is ticked here is what
 *    the daemon binds into the code; a phone that redeems it cannot widen
 *    it afterwards. See lib/capability-labels.ts for why the copy names what
 *    each capability reaches instead of prettifying the enum.
 * 2. **The QR is an `<img src="data:...">`, never inlined markup.** The
 *    daemon's `qrSvg` is SVG -- an active document format that admits
 *    `<script>` and event handlers -- so `dangerouslySetInnerHTML` here
 *    would be an XSS sink the day anything but our own daemon can influence
 *    it. Base64-encoding it into an `<img>` source means the browser never
 *    parses it as a document at all.
 * 3. **Minting, listing, and revoking are loopback-admin-only on the
 *    daemon's side** -- refused unless the request arrives on the loopback
 *    listener AND this device holds `system_control` (`session.policy`
 *    and `useCanUse` are the two client-side signals for that, and neither
 *    is authoritative -- the daemon still enforces it). That is only
 *    known for certain once the session probe has actually landed
 *    (`phase === "authorized"`); before that (as in this component's own
 *    tests, which render it standalone with no probe run) this dialog
 *    assumes it is usable rather than showing a dead form for a question
 *    it cannot yet answer -- the same "unknown is not unauthorized" stance
 *    store/auth-store.ts already takes.
 * 4. **`execute` is off by default and rendered apart from the other six**
 *    (Milestone 6b). Every other capability starts ticked -- a person unticks
 *    down from "everything" -- but `execute` is what turns her reply into a
 *    subprocess, a keystroke, a click or a scheduled job on this machine
 *    rather than a description of one, and a raise (spec §3.1) can only ever
 *    lift a ceiling for a capability the device was ALREADY issued at pairing.
 *    So ticking it here is one of exactly two deliberate acts required before
 *    `execute` can ever be raised on tailnet; the other is minting the raise
 *    itself, physically at the keyboard. Reaching "everything, including
 *    execute" for a new device now takes one extra, visually distinct click
 *    instead of arriving for free inside "tick everything".
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/Checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { apiSend, ApiError } from "@/services/http";
import { useAuthStore } from "@/store/auth-store";
import { useLoopbackAdminGate } from "@/hooks/useLoopbackAdminGate";
import { CAPABILITIES, type Capability } from "@/types/session";
import { CAPABILITY_LABELS } from "@/lib/capability-labels";
import { cn } from "@/lib/utils";
import type { components } from "@/types/api";

type PairCodePayload = components["schemas"]["PairCodePayload"];
type TransportPayload = components["schemas"]["TransportPayload"];

/** The one transport name this file may say without reading it off the wire
 * -- it is the daemon's own default when `PairCodeRequest.transport` is
 * omitted (openapi.json's `PairCodeRequest`), not a name Studio invented, and
 * `GET /v1/transports` never lists it as a row (TransportList.tsx never has
 * to, either -- it is the listener the admin request itself always arrives
 * on). Every OTHER option below comes straight off `transports`, so a fourth
 * adapter appears here without a frontend change. */
const LOCAL_TRANSPORT = "local";

interface TransportOption {
  name: string;
  /** Null when selectable. Set when picking it can only ever 409/never work. */
  disabledReason: string | null;
}

/** The reason shown when a transport is running but its policy refuses
 * pairing outright (`TransportPayload.pairable === false`). Deliberately
 * transport-agnostic -- the daemon no longer says which transport it is
 * (`policy.pairable` replaced the old `policy.name == "quick"` check), so
 * this file cannot name one either. */
const UNPAIRABLE_REASON = "This transport can't carry a pairing. Pair over another one.";

/** `local` first, always selectable, then whatever `GET /v1/transports`
 * reports -- running or not, named or unknown to this build. A transport
 * that isn't running is shown, not hidden (the daemon's own 409 message
 * points at starting it). A transport that IS running but whose policy sets
 * `pairable: false` is shown disabled too, with `UNPAIRABLE_REASON` -- read
 * straight off the payload, never off the transport's name, so a future
 * transport with `pairable: false` is disabled here without a frontend
 * change (TransportList.tsx already reads the same field the same way). */
function transportOptions(transports: TransportPayload[]): TransportOption[] {
  return [
    { name: LOCAL_TRANSPORT, disabledReason: null },
    ...transports.map((t) => ({
      name: t.name,
      disabledReason: !t.running
        ? // Fix round 2, Defect 1: this used to say "start it on the
          // Transports screen first" -- wrong twice over once this panel
          // and TransportsPanel landed on the SAME settings page. "Start
          // it above" points at where the control actually is, on this
          // screen, rather than implying a navigation the reader has
          // already done.
          "Not running -- start it in Transports, above."
        : !t.pairable
          ? UNPAIRABLE_REASON
          : null,
    })),
  ];
}

/**
 * What the SELECTED transport does with a given capability, straight off
 * `TransportPayload.ceiling`/`raisable` -- the wire fields the daemon itself
 * intersects a redeemed code's grants against at issue time (spec §3.1).
 * Three states, matching what a person minting a code needs to know:
 *
 * - `"ceiling"`: issued and usable immediately.
 * - `"raisable"`: issued, but unusable on this transport until a raise is
 *   minted later, at the keyboard. Still worth ticking now -- a device never
 *   issued a capability at pairing can never be raised into it afterwards,
 *   so this is the ONLY way `execute` ever becomes raisable on tailnet.
 * - `"unavailable"`: in neither set. Ticking this would be silently stripped
 *   by the daemon, which is the defect this file exists to close -- the
 *   checkbox must refuse to lie about it instead.
 *
 * `local` is never a row in `transports` (see `LOCAL_TRANSPORT`'s own doc) --
 * its ceiling holds everything, so every capability reads `"ceiling"` there,
 * unconditionally, rather than looked up against a payload that doesn't
 * exist for it.
 */
type CarryState = "ceiling" | "raisable" | "unavailable";

function carryState(
  cap: Capability,
  transportName: string,
  transports: TransportPayload[],
): CarryState {
  if (transportName === LOCAL_TRANSPORT) return "ceiling";
  const t = transports.find((x) => x.name === transportName);
  if (!t) return "unavailable";
  if (t.ceiling.includes(cap)) return "ceiling";
  if (t.raisable.includes(cap)) return "raisable";
  return "unavailable";
}

const DEFAULT_LABEL = "New device";

/**
 * The dialog's opening state: every capability ticked EXCEPT `execute` -- a
 * person unticks down from "everything" for six of the seven, but `execute`
 * is the one capability nobody should get by forgetting to think about it.
 * See the file's own doc, point 4.
 */
function defaultGrants(): Record<Capability, boolean> {
  return Object.fromEntries(CAPABILITIES.map((c) => [c, c !== "execute"])) as Record<
    Capability,
    boolean
  >;
}

/** The six ordinary checkboxes, rendered together and above the divider. */
const ORDINARY_CAPABILITIES = CAPABILITIES.filter((c) => c !== "execute");

function toBase64(svg: string): string {
  // btoa is Latin1-only; the daemon's QR SVG is ASCII path/viewBox data, so
  // this never sees a code point it can't encode. Anything unexpected
  // throwing here is preferable to silently mis-encoding a rendered image.
  return btoa(svg);
}

/**
 * One capability checkbox, shared by the ordinary six and `execute`'s own
 * tinted box below the divider -- so the two never drift into disagreeing
 * about what "not held"/"not carried" look like or how the label is wired to
 * the control. `tone="warning"` only changes colour; the markup, the
 * disabled logic and the `aria-describedby` wiring are identical either way.
 *
 * Two independent reasons can make this uncheckable, and they read as two
 * different sentences on purpose (never collapsed into one):
 *
 * - `notHeld` -- the MINTING DEVICE doesn't hold this capability at all.
 * - `transportBlocked` -- the SELECTED TRANSPORT's ceiling/raisable can never
 *   carry it (`carryState(...) === "unavailable"`), regardless of what the
 *   minting device holds.
 *
 * `needsRaise` is not a disabled state -- it is the `"raisable"` carry state,
 * where the box stays tickable, ticked, and enabled, with a note that a
 * raise (minted later, at the keyboard) is what makes it usable on this
 * transport. See this file's own `carryState` doc for why unticking or
 * hiding it here would be its own regression.
 */
function GrantRow({
  cap,
  checked,
  notHeld,
  transportBlocked,
  needsRaise,
  onChange,
  tone = "default",
}: {
  cap: Capability;
  checked: boolean;
  notHeld: boolean;
  transportBlocked: boolean;
  needsRaise: boolean;
  onChange: (checked: boolean) => void;
  tone?: "default" | "warning";
}) {
  const copy = CAPABILITY_LABELS[cap];
  const disabled = notHeld || transportBlocked;
  return (
    <li className="flex items-start gap-2">
      <Checkbox
        id={`grant-${cap}`}
        aria-label={copy.label}
        aria-describedby={`grant-${cap}-reach`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
        className="mt-0.5"
      />
      <label htmlFor={`grant-${cap}`} className="flex flex-col text-xs">
        <span
          className={cn(
            "font-mono uppercase tracking-wide",
            tone === "warning" ? "text-fail" : "text-bone",
          )}
        >
          {copy.label}
          {tone === "warning" && " -- off by default"}
        </span>
        <span id={`grant-${cap}-reach`} className="text-bone-dim">
          {copy.reach}
          {notHeld && " -- this device doesn't hold it, so it can't hand it off."}
          {!notHeld &&
            transportBlocked &&
            " -- this transport can't carry it, so it's disabled here."}
          {!notHeld &&
            !transportBlocked &&
            needsRaise &&
            " -- issued now, but needs a raise on this transport before it's usable."}
        </span>
      </label>
    </li>
  );
}

/** One radio in the transport picker, shared shape with GrantRow -- an
 * accessible name, a reason line reused as `aria-describedby`, and a
 * `disabled` state that actually stops the click rather than only greying
 * out the label. Selection itself (`checked`) is owned by the enclosing
 * `RadioGroup`'s own `value`, not re-derived here. */
function TransportRow({
  name,
  disabledReason,
}: {
  name: string;
  disabledReason: string | null;
}) {
  return (
    <li className="flex items-start gap-2">
      <RadioGroupItem
        id={`pair-transport-${name}`}
        value={name}
        aria-label={name}
        aria-describedby={disabledReason ? `pair-transport-${name}-reason` : undefined}
        disabled={disabledReason !== null}
        className="mt-0.5"
      />
      <label htmlFor={`pair-transport-${name}`} className="flex flex-col text-xs">
        <span className="font-mono uppercase tracking-wide text-bone">{name}</span>
        {disabledReason && (
          <span id={`pair-transport-${name}-reason`} className="text-bone-dim">
            {disabledReason}
          </span>
        )}
      </label>
    </li>
  );
}

export interface PairDeviceDialogProps {
  /** `GET /v1/transports`'s own list, lifted from the settings page the same
   * way DeviceList's raise dialog already receives it -- never fetched a
   * second time here, and never a hardcoded name. Defaults to empty, which
   * still offers `local` alone: the existing behaviour for any caller that
   * hasn't been updated to pass it. */
  transports?: TransportPayload[];
}

export function PairDeviceDialog({ transports = [] }: PairDeviceDialogProps) {
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [grants, setGrants] = useState<Record<Capability, boolean>>(defaultGrants);
  const [transport, setTransport] = useState(LOCAL_TRANSPORT);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<PairCodePayload | null>(null);
  const [expired, setExpired] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  const options = transportOptions(transports);
  const chosen = options.find((o) => o.name === transport);
  // Defense in depth alongside `disabled` on the radio itself: if the prop
  // ever hands this a name that isn't selectable (stale state from a
  // transport that stopped, or a name this render never saw), mint() must
  // still fall back to `local` rather than sending a name the daemon will
  // 409 on when the picker so far never let a person select it.
  const effectiveTransport = chosen && chosen.disabledReason === null ? transport : LOCAL_TRANSPORT;

  const authPhase = useAuthStore((s) => s.phase);
  const session = useAuthStore((s) => s.session);
  // Shared with DeviceList and the devices panel -- see the hook's own doc
  // for why mint/list/revoke must never answer "can I use this?" three
  // different ways.
  const { refused: knownRefused, message: refusedMessage } = useLoopbackAdminGate();

  const anySelected = CAPABILITIES.some((c) => grants[c]);
  // Only restrict once the probe has actually told us what this connection
  // can use -- see knownRefused's own note above GrantRow's disabled check.
  const known = authPhase === "authorized" && session !== null;

  // Only ever narrows, and only once the probe has actually told us what
  // this connection can use -- `session.effective` (via `canUse()`), never
  // `session.granted`. `granted` is explanatory-only (what the device was
  // issued); `effective` is the gate, the same list `useCanUse` itself
  // reads. Reading `granted` here was the bug review caught: it happened to
  // agree with `effective` under the `policy === "local"` precondition this
  // dialog already requires, which is exactly why it went unnoticed.
  //
  // This flips the checkbox itself, not just its disabled state -- a
  // capability the device cannot mint must not still read as "checked" a
  // moment before the request strips it. `mint()` below also filters the
  // outgoing payload directly, so the two can never disagree even if a
  // future edit changes one of them without the other.
  //
  // The SAME effect also unchecks whatever the SELECTED TRANSPORT cannot
  // carry at all (`carryState(...) === "unavailable"`) -- item 1's fix. Two
  // independent axes, one uncheck mechanism, rather than a second effect that
  // could disagree with this one about what "unselectable" means. Unlike the
  // device-held axis, the transport axis is never gated behind `known`:
  // ceiling/raisable come straight off `transports`, not off the session
  // probe, so it applies immediately regardless of auth phase -- and
  // `effectiveTransport === LOCAL_TRANSPORT` always reads `"ceiling"` (see
  // `carryState`), so switching to `local` never unchecks anything here.
  useEffect(() => {
    setGrants((g) => {
      let changed = false;
      const next = { ...g };
      for (const cap of CAPABILITIES) {
        const deviceCannotHold = known && !session!.canUse(cap);
        const transportCannotCarry = carryState(cap, effectiveTransport, transports) === "unavailable";
        if (next[cap] && (deviceCannotHold || transportCannotCarry)) {
          next[cap] = false;
          changed = true;
        }
      }
      return changed ? next : g;
    });
  }, [authPhase, session, known, effectiveTransport, transports]);

  useEffect(() => {
    if (!pairCode) return;
    const expiresAtMs = new Date(pairCode.expiresAt).getTime();
    // Two different jobs, on purpose. The visible "expires in Ns" only needs
    // to be roughly live, so a 250ms poll is plenty -- but "expired" is the
    // one fact this dialog cannot afford to report late (a person keeps
    // scanning a dead code), so it gets its own setTimeout scheduled for the
    // exact remaining budget, fired once, independent of the poll's own
    // cadence and any jitter in when that poll happens to land.
    const updateRemaining = () => setRemainingMs(Math.max(0, expiresAtMs - Date.now()));
    updateRemaining();
    const interval = setInterval(updateRemaining, 250);
    const timeout = setTimeout(() => setExpired(true), Math.max(0, expiresAtMs - Date.now()));
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [pairCode]);

  async function mint() {
    setMinting(true);
    setMintError(null);
    try {
      // Defense in depth alongside the uncheck effect above: never send a
      // capability this device is known not to hold, or one the selected
      // transport can never carry, even if `grants` state somehow still has
      // it ticked (e.g. a session that lands, or a transport switch that
      // resolves, between this click and the effect's own commit).
      const selected = CAPABILITIES.filter(
        (c) =>
          grants[c] &&
          (!known || session!.canUse(c)) &&
          carryState(c, effectiveTransport, transports) !== "unavailable",
      );
      const result = await apiSend<PairCodePayload>("POST", "/v1/pair/code", {
        label: label.trim() || DEFAULT_LABEL,
        grants: selected,
        transport: effectiveTransport,
      });
      setExpired(false);
      setPairCode(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setMintError("This device may not do that -- pairing needs system control, at the keyboard.");
      } else if (err instanceof ApiError && err.status === 422) {
        // "Minting narrows to what your own device holds" -- reaching this
        // means every ticked capability this device could actually offer
        // was empty after that intersection, not that the request was
        // malformed.
        setMintError(
          "None of the ticked permissions are ones this device holds to hand off. Untick something already granted here, or pair from a device that holds it.",
        );
      } else if (err instanceof ApiError && err.status === 409) {
        // The daemon's own precondition for a *named* transport: not running,
        // or running but its hostname hasn't published yet (routes/pairing.py).
        // Both are "pick again in a moment, or start it" -- never a reason to
        // retry the identical request.
        setMintError(
          "That transport is not running, or hasn't published a hostname yet. Start it in Transports, above, or pick another.",
        );
      } else {
        setMintError(err instanceof Error ? err.message : "Could not mint a pair code.");
      }
    } finally {
      setMinting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-widest text-bone-subtle">
        pair a device
      </h2>

      {knownRefused && refusedMessage && (
        <p className="text-xs text-amber">{refusedMessage}</p>
      )}

      {!pairCode ? (
        <>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="pair-device-label"
              className="font-mono text-[10px] uppercase tracking-widest text-bone-ghost"
            >
              label
            </label>
            <input
              id="pair-device-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-bone focus:border-border-strong focus:outline-none"
            />
          </div>

          <fieldset className="flex flex-col gap-1">
            <legend className="font-mono text-[10px] uppercase tracking-widest text-bone-ghost">
              reach the QR over
            </legend>
            <RadioGroup value={transport} onValueChange={setTransport} asChild>
              <ul className="flex flex-col gap-2">
                {options.map((o) => (
                  <TransportRow key={o.name} name={o.name} disabledReason={o.disabledReason} />
                ))}
              </ul>
            </RadioGroup>
          </fieldset>

          <ul className="flex flex-col gap-2">
            {ORDINARY_CAPABILITIES.map((cap) => {
              const carry = carryState(cap, effectiveTransport, transports);
              return (
                <GrantRow
                  key={cap}
                  cap={cap}
                  checked={grants[cap]}
                  notHeld={known && !session!.canUse(cap)}
                  transportBlocked={carry === "unavailable"}
                  needsRaise={carry === "raisable"}
                  onChange={(checked) => setGrants((g) => ({ ...g, [cap]: checked }))}
                />
              );
            })}
          </ul>

          {/*
            `execute` sits below a divider, in its own tinted box -- the
            visual separation the file's doc (point 4) argues for. It is a
            checkbox like the other six, never a second control, so it stays
            inside the one `grants` state and the one `mint()` filter below;
            what sets it apart is presentation only.
          */}
          <div className="mt-1 flex flex-col gap-2 rounded-md border border-fail/30 bg-fail/5 p-2">
            <GrantRow
              cap="execute"
              checked={grants.execute}
              notHeld={known && !session!.canUse("execute")}
              transportBlocked={carryState("execute", effectiveTransport, transports) === "unavailable"}
              needsRaise={carryState("execute", effectiveTransport, transports) === "raisable"}
              onChange={(checked) => setGrants((g) => ({ ...g, execute: checked }))}
              tone="warning"
            />
          </div>

          {mintError && (
            <p role="alert" className="text-xs text-fail">
              {mintError}
            </p>
          )}

          <Button
            variant="primary"
            size="sm"
            className="self-start"
            disabled={!anySelected || minting || knownRefused}
            onClick={() => void mint()}
          >
            {minting ? "minting…" : "show qr"}
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI has no remote origin for next/image to optimize, and Image demands width/height */}
          <img
            src={`data:image/svg+xml;base64,${toBase64(pairCode.qrSvg)}`}
            alt="Scan with the phone you're pairing"
            className="h-40 w-40 rounded-md bg-bone p-2"
          />
          <p className="font-mono text-xl tracking-[0.3em] text-bone">{pairCode.code}</p>
          <p className="text-xs text-bone-dim">
            {expired
              ? "This code has expired -- mint a new one."
              : `expires in ${Math.max(1, Math.ceil(remainingMs / 1000))}s`}
          </p>
          <Button variant="secondary" size="sm" onClick={() => setPairCode(null)}>
            mint another
          </Button>
        </div>
      )}
    </Card>
  );
}
