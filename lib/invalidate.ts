/**
 * The `invalidate` frame's dispatch, decoupled from the socket that receives
 * it (`hooks/useEventStream.ts`) and from the components that act on it.
 *
 * The daemon's own contract (`assistant/io/api/events.py`): three fields,
 * `{ type: "invalidate", resource: "session" | "devices" | "transports" }`,
 * no payload -- the frame says only that something changed, never what. The
 * client's only job is to refetch the named resource through its normal
 * authenticated route, which already enforces every capability. Reading data
 * out of the frame itself would be reading data that was never sent.
 *
 * A tiny module-level pub/sub rather than a zustand store: `devices` and
 * `transports` are fetched by component-local state in
 * `app/app/settings/page.tsx` (see that file's own doc on why the transports
 * list is lifted rather than duplicated), and there is no store for either to
 * write into. `session` has one (`store/auth-store.ts`) and could dispatch
 * directly, but routing it through the same bus keeps `useEventStream.ts`'s
 * frame handler one shape for all three resources instead of two.
 *
 * **Unknown resource names are dropped silently, not thrown on.** The daemon
 * may start invalidating a resource this build has never heard of before
 * Studio is redeployed to know about it, and a hard failure here would take
 * the whole socket down for every OTHER frame it carries -- the same
 * reasoning `useEventStream.ts` already applies to unknown frame `type`s.
 *
 * **Debounced per resource, trailing-edge, so a burst never drops the last
 * signal.** A raise mint emits both `session` and `devices` in the same tick;
 * two `devices` frames landing close together (a second device paired right
 * after the first) must not fire two overlapping fetches. The timer always
 * resets to the newest frame and always fires eventually -- nothing here can
 * coalesce a signal away to zero.
 */

export type InvalidateResource = "session" | "devices" | "transports";

const KNOWN_RESOURCES: ReadonlySet<string> = new Set<InvalidateResource>([
  "session",
  "devices",
  "transports",
]);

function isInvalidateResource(value: string): value is InvalidateResource {
  return KNOWN_RESOURCES.has(value);
}

/** Exported for the test that pins the debounce window itself; callers
 * outside this file have no reason to read it. */
export const INVALIDATE_DEBOUNCE_MS = 200;

type Listener = () => void;

function emptyListenerMap(): Record<InvalidateResource, Set<Listener>> {
  return { session: new Set(), devices: new Set(), transports: new Set() };
}

let listenersByResource = emptyListenerMap();
const pendingTimers = new Map<InvalidateResource, ReturnType<typeof setTimeout>>();

function notify(resource: InvalidateResource): void {
  pendingTimers.delete(resource);
  for (const listener of listenersByResource[resource]) listener();
}

/**
 * Called by the event socket on every `invalidate` frame's raw `resource`
 * string. Silently a no-op for anything this build does not recognise.
 */
export function emitInvalidate(resource: string): void {
  if (!isInvalidateResource(resource)) return;

  const existing = pendingTimers.get(resource);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    resource,
    setTimeout(() => notify(resource), INVALIDATE_DEBOUNCE_MS),
  );
}

/** Subscribes to one resource's invalidation. Returns the unsubscribe. */
export function onInvalidate(resource: InvalidateResource, listener: Listener): () => void {
  listenersByResource[resource].add(listener);
  return () => listenersByResource[resource].delete(listener);
}

/** Test-only: drops every listener and pending timer so one test's debounce
 * cannot fire into the next. */
export function __resetInvalidateForTests(): void {
  for (const timer of pendingTimers.values()) clearTimeout(timer);
  pendingTimers.clear();
  listenersByResource = emptyListenerMap();
}
