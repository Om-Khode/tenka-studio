"use client";

/**
 * The live settings page, not a bare re-export of demo's any more: milestone
 * 6a's devices/pairing section is a live-only concept -- there is no demo
 * device vault to back it with synthetic data -- so it is supplied here as
 * `extra`, rendered inside the shared page's own scroll column, rather than
 * duplicating that ~140-line layout or teaching demo/settings/page.tsx about
 * a daemon route it has no data for. Milestone 6b adds a second, sibling
 * live-only section the same way: `transportsExtra`.
 *
 * `AppSettingsPage` owns the transports list itself, above both panels, so it
 * can be fetched once and read by three different consumers -- TransportsPanel's
 * own cards, PairDeviceDialog's transport picker, and DeviceList's raise
 * dialog (which needs each transport's `raisable` to know what it may ever
 * offer). `TransportsPanel` fetches it (the one network call) but never holds
 * its own copy -- every success, the initial `GET /v1/transports` AND every
 * start/stop, is written back through `onTransportsChange` rather than into
 * local state, so there is exactly one array in memory and every consumer
 * reads the same one. Fix round 2, Defect 1: a second, local copy inside
 * TransportsPanel used to go stale the moment start/stop updated only it --
 * a device could be paired against a transport the pair dialog, one panel
 * down, still called "not running", on the SAME page, until a reload re-ran
 * the fetch.
 */
import { useEffect, useState } from "react";
import { SettingsPageBody } from "@/components/settings/SettingsPageBody";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PairDeviceDialog } from "@/components/settings/PairDeviceDialog";
import { DeviceList } from "@/components/settings/DeviceList";
import { TransportList } from "@/components/settings/TransportList";
import { SessionCapabilities } from "@/components/live/SessionCapabilities";
import { apiGet, apiSend, ApiError } from "@/services/http";
import { useLoopbackAdminGate, LOOPBACK_ADMIN_REFUSED_MESSAGE } from "@/hooks/useLoopbackAdminGate";
import { useToastStore } from "@/store/toast-store";
import { onInvalidate } from "@/lib/invalidate";
import type { components } from "@/types/api";

type DevicePayload = components["schemas"]["DevicePayload"];
type TransportPayload = components["schemas"]["TransportPayload"];
type Status = "idle" | "loading" | "ready" | "error";
/**
 * "She said no" and "she isn't answering" are different sentences with
 * different fixes -- exactly the distinction Task 14 made for the pairing
 * flow and PairDeviceDialog already makes for minting. Collapsing both into
 * one "could not reach her paired devices" message here would answer the
 * same question a third way in the same milestone.
 */
type ErrorKind = "refused" | "unreachable";

function DevicesPanel({ transports }: { transports: TransportPayload[] }) {
  const { known, refused, message } = useLoopbackAdminGate();
  const [status, setStatus] = useState<Status>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [devices, setDevices] = useState<DevicePayload[]>([]);
  /**
   * The retry counter, and the ONLY thing about this fetch that belongs in the
   * dependency array.
   *
   * This effect used to depend on `status` and guard with
   * `if (status !== "idle") return`. Setting `status` to "loading" is therefore
   * a dependency change, so React tore the effect down -- running the cleanup,
   * which sets `cancelled = true` -- and re-ran it, where the guard bailed
   * immediately. The fetch it had just started then resolved into a closure
   * that had already been told to ignore itself, so nothing ever wrote `ready`
   * and the skeleton below the pair card sat there forever. In the admin
   * session, the one path that actually reaches the request, it never resolved
   * at all.
   *
   * A counter the retry button increments has none of that: it changes only
   * when a person asks for another attempt, never as a side effect of the
   * effect's own writes.
   */
  const [attempt, setAttempt] = useState(0);

  // GET /v1/devices shares mint and revoke's own precondition: loopback
  // listener AND system_control. When that is already KNOWN to be refused
  // (the session probe has landed and said so), this skips the network call
  // entirely rather than firing a request certain to 403 just to show the
  // same explanation PairDeviceDialog/DeviceList already give proactively.
  // A 403 can still arrive here for real (the probe hasn't landed yet, or
  // the session changed underneath this page) -- that branch is what tells
  // `refused` apart from every other failure (`unreachable`), instead of
  // reporting both as one generic "could not reach her".
  useEffect(() => {
    if (known && refused) {
      setErrorKind("refused");
      setStatus("error");
      return;
    }
    let cancelled = false;
    setErrorKind(null);
    setStatus("loading");
    apiGet<{ devices: DevicePayload[] }>("/v1/devices")
      .then((result) => {
        if (cancelled) return;
        setDevices(result.devices);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorKind(err instanceof ApiError && err.status === 403 ? "refused" : "unreachable");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, known, refused]);

  const retry = () => setAttempt((n) => n + 1);

  // Milestone 6b, live-test item 1: a device paired or revoked elsewhere
  // (another tab, the pairing dialog, the keyboard) invalidates `devices` on
  // the event socket. This reuses the SAME `GET /v1/devices` fetch above --
  // bumping `attempt` -- rather than a second network call living here too.
  // `[]`: `retry` only calls `setAttempt`, whose identity from `useState` is
  // stable for the component's lifetime, so the closure captured at mount
  // stays correct for as long as this effect is subscribed.
  useEffect(() => onInvalidate("devices", retry), []);

  return (
    <div className="flex flex-col gap-4">
      {/*
        Milestone 6b fix round 2, Defect 2a: `SessionCapabilities` used to
        render in the Topbar, one of three controls (badge / capabilities /
        reconnect) competing for a row that does not fit at 720 CSS px --
        `RECONNECT` clipped mid-word and the page gained a horizontal
        scrollbar. It moves here rather than shrinking the row further: "what
        THIS session may do" is session information, and this heading is
        already where session information lives -- one Card's worth above
        `PairDeviceDialog`, next to the devices list it explains alongside.
        The Topbar keeps the badge and the reconnect link, which is all that
        needs to be glanced at on every route; capabilities is read
        occasionally ("am I raised right now?"), which is exactly the
        component's own doc's argument for why it opens a dialog rather than
        rendering inline in the first place.
      */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-bone-subtle">
          devices &amp; pairing
        </h2>
        <SessionCapabilities />
      </div>

      <PairDeviceDialog transports={transports} />

      {status === "error" ? (
        <Card className="flex flex-col items-center gap-3 p-4 text-center">
          <p className="text-sm text-bone-dim">
            {errorKind === "refused"
              ? // `message` names whichever half of the precondition actually
                // failed. It is null only when the probe has not landed, which
                // is the one way to reach "refused" without the gate agreeing
                // -- a bare 403 -- and there the listener wording is the best
                // available guess.
                (message ?? LOOPBACK_ADMIN_REFUSED_MESSAGE)
              : "She could not reach her paired devices."}
          </p>
          {/* Retrying a known refusal is pointless -- it only stops being
              true if this connection changes (back on loopback, holding
              system_control), not by clicking again -- so only a genuine
              "not answering" gets a retry. */}
          {errorKind !== "refused" && (
            <Button variant="secondary" size="sm" onClick={retry}>
              try again
            </Button>
          )}
        </Card>
      ) : status !== "ready" ? (
        <Card className="flex flex-col gap-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : (
        <DeviceList devices={devices} transports={transports} onRaiseMaybeExpired={retry} />
      )}
    </div>
  );
}

/**
 * Milestone 6b fix round 2, Defect 1: `transports` used to be state local to
 * this component, mirrored up to `AppSettingsPage` only once, via `onLoaded`,
 * at the end of the initial `GET /v1/transports`. `start()`/`stop()` below
 * then updated ONLY this component's own copy -- so a device paired from the
 * SAME page kept reading the pre-mutation list until a full reload re-ran the
 * fetch effect. Two independent copies of the same daemon state is exactly
 * how they drift; the fix removes the second copy rather than remembering to
 * re-sync it. `transports` is now owned by `AppSettingsPage` alone --
 * fetched once here, written back through `onTransportsChange` on every
 * success (the initial load AND every start/stop), and read by both this
 * panel and `DevicesPanel` from the same lifted value. No second network
 * call was added; this is the same "lift and hand down" pattern the initial
 * load already used, just applied to the mutations too.
 */
function TransportsPanel({
  transports,
  onTransportsChange,
}: {
  transports: TransportPayload[];
  onTransportsChange: (transports: TransportPayload[]) => void;
}) {
  const { known, refused, message } = useLoopbackAdminGate();
  const [status, setStatus] = useState<Status>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  // Same shape as DevicesPanel's own `attempt` -- see that component's doc
  // for why the retry counter is the only thing this effect may depend on.
  const [attempt, setAttempt] = useState(0);

  // `GET /v1/transports` shares the same loopback + system_control
  // precondition as devices (routes/transports.py: `require_admin`), so this
  // skips the request the same way once it is already known to be refused.
  useEffect(() => {
    if (known && refused) {
      setErrorKind("refused");
      setStatus("error");
      return;
    }
    let cancelled = false;
    setErrorKind(null);
    setStatus("loading");
    apiGet<{ transports: TransportPayload[] }>("/v1/transports")
      .then((result) => {
        if (cancelled) return;
        onTransportsChange(result.transports);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorKind(err instanceof ApiError && err.status === 403 ? "refused" : "unreachable");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // `onTransportsChange` is a setState setter from the parent, stable
    // across renders; omitting it here matches DevicesPanel's own dependency
    // list and avoids a fresh inline arrow from re-triggering this fetch
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, known, refused]);

  const retry = () => setAttempt((n) => n + 1);

  // Milestone 6b, live-test item 1: a transport started or stopped elsewhere
  // invalidates `transports` on the event socket. Same reuse as
  // DevicesPanel's own subscription just above -- bumps `attempt`, no second
  // fetch, and `onTransportsChange` is still the one place the array is
  // written (this file's own doc on why that setter is lifted at all).
  useEffect(() => onInvalidate("transports", retry), []);

  async function start(name: string) {
    try {
      const result = await apiSend<TransportPayload>("POST", `/v1/transports/${name}`);
      onTransportsChange(transports.map((t) => (t.name === name ? result : t)));
    } catch (err) {
      const denied = err instanceof ApiError && err.status === 403;
      useToastStore.getState().push({
        ok: false,
        title: denied ? "This device may not do that" : "Could not start that transport",
        detail: denied
          ? "Starting a transport needs system control, at the keyboard."
          : err instanceof Error
            ? err.message
            : undefined,
      });
    }
  }

  async function stop(name: string) {
    try {
      const result = await apiSend<TransportPayload>("DELETE", `/v1/transports/${name}`);
      onTransportsChange(transports.map((t) => (t.name === name ? result : t)));
    } catch (err) {
      const denied = err instanceof ApiError && err.status === 403;
      useToastStore.getState().push({
        ok: false,
        title: denied ? "This device may not do that" : "Could not stop that transport",
        detail: denied
          ? "Stopping a transport needs system control, at the keyboard."
          : err instanceof Error
            ? err.message
            : undefined,
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-mono text-[10px] uppercase tracking-widest text-bone-subtle">
        transports
      </h2>

      {status === "error" ? (
        <Card className="flex flex-col items-center gap-3 p-4 text-center">
          <p className="text-sm text-bone-dim">
            {errorKind === "refused"
              ? (message ?? LOOPBACK_ADMIN_REFUSED_MESSAGE)
              : "She could not reach her transports."}
          </p>
          {errorKind !== "refused" && (
            <Button variant="secondary" size="sm" onClick={retry}>
              try again
            </Button>
          )}
        </Card>
      ) : status !== "ready" ? (
        <Card className="flex flex-col gap-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
        </Card>
      ) : (
        <TransportList
          transports={transports}
          refused={refused}
          refusedMessage={message}
          onStart={start}
          onStop={stop}
        />
      )}
    </div>
  );
}

export default function AppSettingsPage() {
  const [transports, setTransports] = useState<TransportPayload[]>([]);
  return (
    <SettingsPageBody
      transportsExtra={
        <TransportsPanel transports={transports} onTransportsChange={setTransports} />
      }
      extra={<DevicesPanel transports={transports} />}
    />
  );
}
