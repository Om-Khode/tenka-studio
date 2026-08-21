import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SETTLE_QUIET_MS,
  retryDelay,
  useEventStream,
  useEventStreamStore,
} from "./useEventStream";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import { liveRepoBundle } from "@/services/repos/http";
import { clearDevToken, onSessionRevoked, readDevToken, setDevToken } from "@/services/token";
import { useChatStore } from "@/store/chat-store";
import { useSystemStore } from "@/store/system-store";
import { useAuthStore } from "@/store/auth-store";
import { INVALIDATE_DEBOUNCE_MS, onInvalidate, __resetInvalidateForTests } from "@/lib/invalidate";

/**
 * Stands in for the browser's WebSocket. jsdom ships a real one, and letting
 * it run would have every test in this file open a TCP connection to a daemon
 * that is not running -- the reconnect loop would then be driven by whatever
 * a refused connection happens to time out at, which is exactly the thing
 * these tests are supposed to pin.
 */
class FakeSocket {
  static instances: FakeSocket[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closedByClient = false;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  close() {
    this.closedByClient = true;
    // Fires onclose with a normal-closure code, exactly as a browser does.
    // The hook is expected to have detached the handler before calling
    // close(), so this is the stronger fake: if teardown ever stops
    // detaching, the handler runs and reconnects against an unmounted tree
    // instead of the fake quietly covering for it. (This comment previously
    // claimed the opposite of what the line below does.)
    this.onclose?.({ code: 1000 } as CloseEvent);
  }

  /** The daemon accepting the connection. */
  open() {
    this.onopen?.();
  }

  /**
   * The daemon going away, or the connection being refused, or her closing it
   * on purpose with a code that says why. 1006 is the default because that is
   * what a browser reports for a connection that dropped without a close
   * handshake -- the case every test here used before close codes were read
   * at all.
   */
  drop(code = 1006) {
    this.onclose?.({ code } as CloseEvent);
  }

  emit(payload: string) {
    this.onmessage?.({ data: payload } as MessageEvent);
  }
}

function socketCount(): number {
  return FakeSocket.instances.length;
}

function latestSocket(): FakeSocket {
  const socket = FakeSocket.instances.at(-1);
  if (!socket) throw new Error("no socket was opened");
  return socket;
}

function statusFrame(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    v: 2,
    type: "status",
    phase: "THINKING",
    detail: "",
    cursorFollows: false,
    step: null,
    tier: null,
    ts: 1_754_000_000,
    ...overrides,
  });
}

function telemetryFrame(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "telemetry",
    cpuPercent: 41,
    ramPercent: 62,
    batteryPercent: 87,
    activeModel: "gemini-flash-lite",
    uptimeSeconds: 3600,
    ...overrides,
  });
}

/** Lets the microtask queue drain while fake timers are installed. */
function flush() {
  return vi.advanceTimersByTimeAsync(0);
}

describe("useEventStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    // stubGlobal, not a plain assignment: jsdom installs WebSocket as a
    // read-only property on the global object.
    vi.stubGlobal("WebSocket", FakeSocket);
    localStorage.clear();
    setDevToken("device-token");
    useEventStreamStore.setState(useEventStreamStore.getInitialState(), true);
    useSystemStore.setState({ telemetry: null, telemetryStatus: "idle" });
    useChatStore.setState({ conversations: [], activeConversationId: null, liveTurn: null });
    __resetInvalidateForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    configureRepos("demo", demoRepoBundle);
    clearDevToken();
    vi.restoreAllMocks();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    __resetInvalidateForTests();
  });

  it("opens one socket on /v1/events and reports the connection open", () => {
    const { unmount } = renderHook(() => useEventStream(true));

    expect(socketCount()).toBe(1);
    expect(latestSocket().url).toContain("/v1/events");
    // And nothing else. The credential is an httpOnly cookie the browser
    // attaches to the handshake itself -- `?access_token=` is gone from both
    // sides as of 6a, so a url with a query string on it is a regression.
    expect(latestSocket().url).not.toContain("access_token");
    expect(latestSocket().url).not.toContain("device-token");

    latestSocket().open();
    expect(useEventStreamStore.getState().connection).toBe("open");

    unmount();
  });

  it("does not connect at all while disabled", () => {
    renderHook(() => useEventStream(false));
    expect(socketCount()).toBe(0);
  });

  it("a telemetry frame updates the same system-store slice the HTTP snapshot seeds", () => {
    const { unmount } = renderHook(() => useEventStream(true));
    latestSocket().open();

    latestSocket().emit(telemetryFrame({ cpuPercent: 12, batteryPercent: null }));

    expect(useSystemStore.getState().telemetry).toEqual({
      cpuPercent: 12,
      ramPercent: 62,
      batteryPercent: null,
      activeModel: "gemini-flash-lite",
      uptimeSeconds: 3600,
    });
    expect(useSystemStore.getState().telemetryStatus).toBe("ready");

    unmount();
  });

  it("drops a malformed frame and keeps the socket", () => {
    const { unmount } = renderHook(() => useEventStream(true));
    latestSocket().open();
    latestSocket().emit(telemetryFrame());

    // Unparseable, then well-formed JSON that is missing a required field,
    // then a status frame whose `step` is not [n, total].
    latestSocket().emit("{not json");
    latestSocket().emit(JSON.stringify({ type: "telemetry", cpuPercent: 3 }));
    latestSocket().emit(statusFrame({ phase: "CLICKING", step: [1] }));

    // The first good reading is untouched -- a partial frame never lands as a
    // zero -- and no frame took the socket down or forced a reconnect.
    expect(useSystemStore.getState().telemetry?.cpuPercent).toBe(41);
    expect(useEventStreamStore.getState().activity).toBeNull();
    expect(useEventStreamStore.getState().connection).toBe("open");
    expect(socketCount()).toBe(1);

    unmount();
  });

  it("ignores an unknown frame type rather than closing the socket over it", () => {
    const { unmount } = renderHook(() => useEventStream(true));
    latestSocket().open();

    // `error`/`ack` exist today; `toast` is reserved; a future daemon may add
    // more before Studio is redeployed.
    latestSocket().emit(JSON.stringify({ type: "toast", title: "hello" }));
    latestSocket().emit(JSON.stringify({ type: "ack", of: "abort" }));
    latestSocket().emit(JSON.stringify({ type: "something-studio-has-never-heard-of" }));

    expect(useEventStreamStore.getState().connection).toBe("open");
    expect(socketCount()).toBe(1);

    // And a frame it does understand still works afterwards.
    latestSocket().emit(statusFrame({ phase: "READING" }));
    expect(useEventStreamStore.getState().activity?.phase).toBe("READING");

    unmount();
  });

  /**
   * Milestone 6b, live-test item 1. The daemon's `invalidate` frame is
   * dispatched through `lib/invalidate.ts`, not acted on inside this hook
   * (see this file's own top-of-module doc) -- these tests pin the
   * dispatch, not any one consumer's refetch, which is exactly what the
   * brief asked this file to prove: a `devices` frame reaches a subscriber,
   * and an unknown resource neither throws nor reaches one.
   */
  describe("invalidate frames", () => {
    it("notifies the devices subscriber, debounced, and never an unknown resource", async () => {
      const devicesListener = vi.fn();
      const transportsListener = vi.fn();
      const unsubDevices = onInvalidate("devices", devicesListener);
      const unsubTransports = onInvalidate("transports", transportsListener);

      const { unmount } = renderHook(() => useEventStream(true));
      latestSocket().open();

      latestSocket().emit(JSON.stringify({ type: "invalidate", resource: "devices" }));
      // Not yet -- the debounce window hasn't closed, so a mechanism that
      // fired synchronously (and one that never debounced at all) both look
      // the same at this instant. The advance below is what tells them apart
      // from a mechanism that never fires at all.
      expect(devicesListener).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(INVALIDATE_DEBOUNCE_MS);
      expect(devicesListener).toHaveBeenCalledTimes(1);
      expect(transportsListener).not.toHaveBeenCalled();

      // A resource this build has never heard of: dropped silently, not
      // thrown, and it must not have reached ANY subscriber -- including
      // the ones registered for the resources that DO exist.
      expect(() =>
        latestSocket().emit(
          JSON.stringify({ type: "invalidate", resource: "a-future-table" }),
        ),
      ).not.toThrow();
      await vi.advanceTimersByTimeAsync(INVALIDATE_DEBOUNCE_MS);
      expect(devicesListener).toHaveBeenCalledTimes(1);
      expect(transportsListener).not.toHaveBeenCalled();
      expect(useEventStreamStore.getState().connection).toBe("open");

      unsubDevices();
      unsubTransports();
      unmount();
    });

    it("coalesces a burst on the same resource into one notification, never dropping it", async () => {
      const devicesListener = vi.fn();
      const unsub = onInvalidate("devices", devicesListener);

      const { unmount } = renderHook(() => useEventStream(true));
      latestSocket().open();

      // Two devices paired in quick succession: two frames, well inside one
      // debounce window.
      latestSocket().emit(JSON.stringify({ type: "invalidate", resource: "devices" }));
      await vi.advanceTimersByTimeAsync(INVALIDATE_DEBOUNCE_MS / 2);
      latestSocket().emit(JSON.stringify({ type: "invalidate", resource: "devices" }));
      await vi.advanceTimersByTimeAsync(INVALIDATE_DEBOUNCE_MS);

      // One notification, not zero (the burst was never dropped) and not two
      // (it was coalesced).
      expect(devicesListener).toHaveBeenCalledTimes(1);

      unsub();
      unmount();
    });

    it("re-probes the session on a session invalidate -- the one resource this hook refetches itself", async () => {
      const probe = vi.spyOn(useAuthStore.getState(), "probe").mockResolvedValue();

      const { unmount } = renderHook(() => useEventStream(true));
      latestSocket().open();

      latestSocket().emit(JSON.stringify({ type: "invalidate", resource: "session" }));
      await vi.advanceTimersByTimeAsync(INVALIDATE_DEBOUNCE_MS);

      expect(probe).toHaveBeenCalledTimes(1);

      unmount();
    });
  });

  it("reconnects with a growing, jittered delay and resets the counter on a successful open", async () => {
    // Jitter pinned to its floor so the sequence is assertable at all; the
    // shape of the jitter itself is retryDelay's own test below.
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { unmount } = renderHook(() => useEventStream(true));
    latestSocket().open();
    expect(useEventStreamStore.getState().connection).toBe("open");

    latestSocket().drop();
    expect(useEventStreamStore.getState().connection).toBe("reconnecting");

    // First retry: 500ms capped delay, floor of the jitter window = 250ms.
    await vi.advanceTimersByTimeAsync(249);
    expect(socketCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(socketCount()).toBe(2);

    // That attempt fails too, so the window doubles: 1000ms capped, 500ms floor.
    latestSocket().drop();
    await vi.advanceTimersByTimeAsync(499);
    expect(socketCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(socketCount()).toBe(3);

    // A successful open resets the counter, so the next drop is back to 250ms
    // rather than continuing to double toward the 30s ceiling.
    latestSocket().open();
    latestSocket().drop();
    await vi.advanceTimersByTimeAsync(250);
    expect(socketCount()).toBe(4);

    unmount();
  });

  it("stops reconnecting once unmounted", async () => {
    const { unmount } = renderHook(() => useEventStream(true));
    latestSocket().open();

    unmount();

    expect(latestSocket().closedByClient).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(socketCount()).toBe(1);
    expect(useEventStreamStore.getState().connection).toBe("closed");
  });

  describe("the chat seam", () => {
    beforeEach(() => {
      configureRepos("live", liveRepoBundle);
      vi.spyOn(liveRepoBundle.chat, "sendMessage").mockResolvedValue({
        turnId: "t1",
        conversationId: "conv-1",
      });
    });

    async function sendAndPend() {
      useChatStore.getState().sendMessage("what's the weather");
      await flush();
      expect(useChatStore.getState().liveTurn).not.toBeNull();
    }

    it("settles the live turn once a terminal phase has held for the quiet window", async () => {
      const getConversation = vi
        .spyOn(liveRepoBundle.chat, "getConversation")
        .mockResolvedValue({
          id: "conv-1",
          title: "Weather",
          messages: [
            { id: "m-user", role: "user", content: "what's the weather", createdAt: 1 },
            { id: "m-assistant", role: "assistant", content: "Overcast, 19°C.", createdAt: 2 },
          ],
        });

      const { unmount } = renderHook(() => useEventStream(true));
      latestSocket().open();
      await sendAndPend();

      latestSocket().emit(statusFrame({ phase: "IDLE" }));
      await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS);

      expect(getConversation).toHaveBeenCalledWith("conv-1");
      expect(useChatStore.getState().liveTurn).toBeNull();
      expect(
        useChatStore.getState().conversations[0].messages.map((m) => m.content),
      ).toEqual(["what's the weather", "Overcast, 19°C."]);

      unmount();
    });

    it("a phase arriving inside the quiet window cancels the settle -- she was not finished", async () => {
      const getConversation = vi.spyOn(liveRepoBundle.chat, "getConversation");

      const { unmount } = renderHook(() => useEventStream(true));
      latestSocket().open();
      await sendAndPend();

      // A handler publishing IDLE as IT finishes, mid-turn, is the case this
      // guards: settling here would refetch a conversation that does not yet
      // contain her reply.
      latestSocket().emit(statusFrame({ phase: "IDLE" }));
      await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS - 100);
      latestSocket().emit(statusFrame({ phase: "SPEAKING" }));
      await vi.advanceTimersByTimeAsync(5_000);

      expect(getConversation).not.toHaveBeenCalled();
      expect(useChatStore.getState().liveTurn).not.toBeNull();

      unmount();
    });

    it("a settle armed for a stopped turn never settles the one the user sent next", async () => {
      // The vanishing-message sequence. The settle timer lives in this
      // effect's closure, so `stopStreaming` cannot clear it: stop inside the
      // 600ms window, send again, and the surviving timer fires against the
      // NEW turn. The guard used to compare `liveTurn.conversationId`, which
      // live mode's single pane makes identical for every turn ever sent, so
      // it matched -- and `settleLiveTurn` then refetched a transcript that
      // predates the resend and assigned it over the pane. The user's own
      // message disappeared from the thread, the placeholder went with it,
      // and the composer unblocked with no reply.
      const send = vi.spyOn(liveRepoBundle.chat, "sendMessage");
      send.mockResolvedValueOnce({ turnId: "studio-1", conversationId: "session-1" });
      send.mockResolvedValueOnce({ turnId: "studio-2", conversationId: "session-1" });
      vi.spyOn(liveRepoBundle.chat, "abort").mockResolvedValue(true);
      const getConversation = vi
        .spyOn(liveRepoBundle.chat, "getConversation")
        .mockResolvedValue({
          id: "session-1",
          title: "session-1",
          // The transcript as it stood before the resend: it cannot contain
          // the second question yet, which is exactly why settling turn 2 on
          // turn 1's timer erases it.
          messages: [
            { id: "studio-0-u", role: "user", content: "an older question", createdAt: 1 },
            { id: "studio-0-a", role: "assistant", content: "an older answer", createdAt: 1 },
          ],
        });

      const { unmount } = renderHook(() => useEventStream(true));
      latestSocket().open();

      useChatStore.getState().sendMessage("first question");
      await flush();
      latestSocket().emit(statusFrame({ phase: "IDLE" })); // arms for studio-1

      await vi.advanceTimersByTimeAsync(300);
      useChatStore.getState().stopStreaming();
      useChatStore.getState().sendMessage("second question");
      await flush();
      expect(useChatStore.getState().liveTurn?.turnId).toBe("studio-2");

      // The rest of turn 1's window elapses with no new frame at all.
      await vi.advanceTimersByTimeAsync(300);

      // The symptom first: the message the user is looking at is still there.
      expect(
        useChatStore.getState().conversations[0].messages.map((m) => m.content),
      ).toContain("second question");
      expect(getConversation).not.toHaveBeenCalled();
      expect(useChatStore.getState().liveTurn?.turnId).toBe("studio-2");

      unmount();
    });

    it("a terminal phase with no turn pending settles nothing", async () => {
      const getConversation = vi.spyOn(liveRepoBundle.chat, "getConversation");

      const { unmount } = renderHook(() => useEventStream(true));
      latestSocket().open();

      latestSocket().emit(statusFrame({ phase: "IDLE" }));
      await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS);

      expect(getConversation).not.toHaveBeenCalled();

      unmount();
    });
  });

  /**
   * The daemon closes this socket with a code that says why
   * (`assistant/io/api/app.py`, /v1/events): 1008 for a device it will not
   * admit -- an unrecognised credential, or one whose grants lack OBSERVE --
   * and 1013
   * for one that has spent its rate-limit budget. Both used to arrive as an
   * unlabelled close and be retried forever, so a revoked token and a
   * switched-off daemon were the same three words on the badge.
   */
  describe("close codes", () => {
    it("stops retrying a 1008 and revokes the credential, rather than looping on a token she will never accept", async () => {
      const { unmount } = renderHook(() => useEventStream(true));
      latestSocket().open();

      latestSocket().drop(1008);

      expect(useEventStreamStore.getState().connection).toBe("unauthorized");
      // Cleared, so nothing downstream re-presents it -- and so the shell's
      // own presence check cannot pass on the next render.
      expect(readDevToken()).toBeNull();

      // Well past the 30s ceiling: no further attempt at all.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(socketCount()).toBe(1);

      unmount();
    });

    it("a 1008 close notifies the revocation listener the shell routes on", () => {
      const listener = vi.fn();
      const unsubscribe = onSessionRevoked(listener);

      const { unmount } = renderHook(() => useEventStream(true));
      latestSocket().open();
      latestSocket().drop(1008);

      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      unmount();
    });

    it("keeps retrying a 1013 -- throttling is not a rejection -- but no faster than the floor, and says which it is", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0);

      const { unmount } = renderHook(() => useEventStream(true));
      latestSocket().open();

      latestSocket().drop(1013);

      expect(useEventStreamStore.getState().connection).toBe("throttled");
      // The token is fine; only the budget is spent.
      expect(readDevToken()).toBe("device-token");

      // The ordinary first retry would have landed at 250ms. Coming back that
      // fast is what spends the budget being waited on.
      await vi.advanceTimersByTimeAsync(4_999);
      expect(socketCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(socketCount()).toBe(2);

      unmount();
    });

    it("an ordinary drop is neither: it reconnects at the base delay and leaves the token alone", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0);

      const { unmount } = renderHook(() => useEventStream(true));
      latestSocket().open();

      // 1006 -- no close handshake, which is what a browser reports for a
      // daemon that died or a cable that went.
      latestSocket().drop(1006);

      expect(useEventStreamStore.getState().connection).toBe("reconnecting");
      await vi.advanceTimersByTimeAsync(250);
      expect(socketCount()).toBe(2);
      expect(readDevToken()).toBe("device-token");

      unmount();
    });
  });
});

describe("retryDelay", () => {
  afterEach(() => vi.restoreAllMocks());

  it("doubles per attempt and caps at 30s", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(retryDelay(0)).toBe(250);
    expect(retryDelay(1)).toBe(500);
    expect(retryDelay(2)).toBe(1000);
    expect(retryDelay(20)).toBe(15_000); // capped at 30s, floor of the window
  });

  it("jitters across the upper half of the window rather than firing on the tick", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(retryDelay(0)).toBeGreaterThan(499);
    expect(retryDelay(0)).toBeLessThan(500);
    expect(retryDelay(20)).toBeLessThan(30_000);
  });
});
