import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_CONVERSATION_TITLE,
  FALLBACK_REPLY,
  SCRIPTED_REPLIES,
  resolveReply,
} from "./chat-scripts";
import { useToastStore } from "./toast-store";
import { useAuthStore } from "./auth-store";
import { getRepoMode, getRepos, namespacedStorage } from "@/services/repo-registry";
import { ApiError } from "@/services/http";
import { refusalFor, isRefusalError, GENERIC_REFUSAL_MESSAGE } from "@/lib/refusal";
import type { Conversation, Message, ScriptedReply } from "@/types/chat";

/**
 * Collision-free ids across reloads. Uses crypto.randomUUID() rather than a
 * module-scoped counter: once this store is wrapped in persist (Task 4),
 * a counter restarting at 0 on every load would collide with ids already
 * rehydrated from localStorage.
 */
function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

const TITLE_MAX = 48;

function titleFromMessage(text: string): string {
  const clean = text.trim();
  if (clean.length <= TITLE_MAX) return clean;
  return `${clean.slice(0, TITLE_MAX - 1)}…`;
}

function replyById(id: string): ScriptedReply {
  return SCRIPTED_REPLIES.find((r) => r.id === id) ?? FALLBACK_REPLY;
}

/**
 * `sendMessage`'s live branch. A module-level function rather than another
 * method on ChatState: it needs `get`/`set` before the store literal that
 * defines them exists, and nothing outside `sendMessage` itself has any
 * business calling straight into it.
 *
 * `POST /v1/chat` answers 202 with `{ turnId, conversationId }`, and that
 * conversationId is NOT an identity this pane may adopt. The daemon returns
 * `session_mod.get_current_session_id()` (assistant/main.py), and
 * `_current_session_id` is one uuid minted once per assistant process run
 * (assistant/session.py: `start_session()` is called exactly once, from
 * main.py's startup) -- so every turn of an entire TENKA run answers with
 * the same string. Renaming the local conversation to it, as this used to,
 * gave a second live pane the first pane's id: `conversations.find(c => c.id
 * === activeConversationId)` then rendered the older one, so the message the
 * user had just sent never appeared, settleLiveTurn wrote history into both,
 * and deleteConversation removed both.
 *
 * The local id therefore stays the pane's identity for its whole life. The
 * daemon's id rides along inside `liveTurn.daemonConversationId`, used for
 * exactly one thing: the key settleLiveTurn() fetches history with.
 *
 * `liveTurn` (not `streamingMessageId`) is what marks the placeholder
 * assistant bubble pending; see LiveTurn's own doc for why the two must stay
 * separate, and settleLiveTurn for the other half of this seam.
 */
async function sendLiveMessage(
  get: () => ChatState,
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  text: string,
): Promise<void> {
  if (get().liveTurn) return; // Composer already gates Send while pending; defensive.
  const clean = text.trim();
  if (!clean) return;

  let conversationId = get().activeConversationId;
  if (!conversationId) {
    conversationId = get().createConversation();
  }

  const now = Date.now();
  const userMessage: Message = { id: nextId("msg"), role: "user", content: clean, createdAt: now };
  const assistantMessage: Message = { id: nextId("msg"), role: "assistant", content: "", createdAt: now };

  set((s) => ({
    conversations: s.conversations.map((c) => {
      if (c.id !== conversationId) return c;
      const isFirstMessage = c.messages.length === 0;
      return {
        ...c,
        title: isFirstMessage ? titleFromMessage(clean) : c.title,
        messages: [...c.messages, userMessage, assistantMessage],
        updatedAt: now,
      };
    }),
  }));

  try {
    const result = await getRepos().chat.sendMessage(clean);
    set({
      liveTurn: {
        conversationId,
        daemonConversationId: result.conversationId,
        turnId: result.turnId,
        assistantMessageId: assistantMessage.id,
      },
    });
  } catch (err) {
    // Nothing was actually sent -- roll back both optimistic bubbles rather
    // than leaving a user message with no reply and no way to retry it
    // short of typing it again. `rejectedDraft` hands the text back to the
    // composer, which cleared its textarea the instant it called
    // sendMessage: without it a 409 destroys what the user typed while the
    // toast tells them to try again, with nothing left to try.
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id !== conversationId
          ? c
          : {
              ...c,
              messages: c.messages.filter(
                (m) => m.id !== userMessage.id && m.id !== assistantMessage.id,
              ),
            },
      ),
      rejectedDraft: clean,
    }));
    // Three different answers, not two. POST /v1/chat requires `chat_send`,
    // and a device paired without it got "Could not reach her" -- a toast that
    // blames her for a boundary the user set, and invites a retry that will be
    // refused every time. The session already knows; ask it before the error.
    const busy = err instanceof ApiError && err.status === 409;
    const refusal = refusalFor(useAuthStore.getState().session, "chat_send");
    const refused = refusal !== null || isRefusalError(err);
    // 409 first: a turn she actually accepted and then rejected as busy is a
    // fact about this moment, and outranks a session read that says the device
    // should not have got that far.
    const toast = busy
      ? { title: "She's mid-turn", detail: "Wait for her to finish, then try again." }
      : refused
        ? {
            title: "This device may not message her",
            detail: refusal?.message ?? GENERIC_REFUSAL_MESSAGE,
          }
        : { title: "Could not reach her", detail: undefined };
    useToastStore.getState().push({ ok: false, ...toast });
  }
}

/**
 * Folds the finished turn's reply into the pane instead of adopting the
 * daemon's transcript wholesale.
 *
 * `ChatRepo.getConversation()` is keyed by `liveTurn.daemonConversationId`,
 * which is a SESSION id (see sendLiveMessage's doc), so what comes back is
 * `memory.get_recent(200, session)` -- every turn of the running assistant
 * process, voice turns included, and nothing at all from the run before it
 * (assistant/actions/studio_runtime.py's `conversation()`). Assigning that
 * array over `messages`, as this used to, meant the first live reply in a
 * fresh pane REPLACED it with up to 200 unrelated turns, and -- because the
 * session id changes on a daemon restart -- the first reply of a new run
 * replaced a rehydrated pane's persisted history with only the new run's
 * turns. Neither is a race; both happen every time.
 *
 * Only the tail of that transcript belongs to the turn that just finished.
 * The daemon emits exactly one `{turn}-u` / `{turn}-a` pair per stored row,
 * oldest first (`get_recent` reverses its `ORDER BY id DESC`), so the
 * transcript always ends on the last turn's assistant message. Walking back
 * from the end and stopping at the first non-assistant message -- or the
 * first id this pane already holds, which is where a re-settle stops --
 * yields this turn's output and nothing earlier.
 *
 * Everything already in the pane survives. A local message with no
 * counterpart in the transcript is the user's own history (or another
 * session's, or the optimistic bubble whose daemon-side twin carries a
 * different id), never stale data for the daemon to correct.
 */
function mergeSettledMessages(
  local: Message[],
  remote: Message[],
  placeholderId: string,
): Message[] {
  const localIds = new Set(local.map((m) => m.id));
  const incoming: Message[] = [];
  for (let i = remote.length - 1; i >= 0; i -= 1) {
    const message = remote[i];
    if (message.role !== "assistant" || localIds.has(message.id)) break;
    incoming.unshift(message);
  }
  // The placeholder is the slot the reply belongs in, so the local user
  // message keeps its position and its local id -- the daemon's copy of it is
  // deliberately not imported, since importing both is how an id-union
  // duplicates every question the user asks. An empty `incoming` (the daemon
  // had not persisted a reply yet) drops the placeholder rather than leaving
  // a bubble that renders blank forever, the same call onRehydrateStorage and
  // stopStreaming already make.
  return local.flatMap((m) => (m.id === placeholderId ? incoming : [m]));
}

/**
 * Tracks a live (non-demo) turn in flight. `sendMessage`'s live path never
 * sets `streamingMessageId` -- that field drives useMessageStream.ts's
 * word-by-word reveal off a SCRIPTED reply (chat-scripts.ts), and a live
 * message has no scripted reply to reveal. This is the seam a future
 * event-stream hook meets: once it sees a `status` frame report this
 * conversation's turn has finished, it calls
 * `useChatStore.getState().settleLiveTurn(conversationId)`, which is the
 * only thing that can resolve this back to `null`. Not persisted -- a turn
 * left pending across a reload is dead the moment the tab closes; there is
 * no partial content to recover (no token frame exists on the wire, see
 * ChatRepo's own doc), so surviving a reload would only mean rendering an
 * empty bubble forever.
 */
export interface LiveTurn {
  /**
   * The LOCAL conversation this turn belongs to -- the pane's identity, the
   * id every other part of the store keys on (stopStreaming's placeholder
   * removal, settleLiveTurn's merge target, and the id useEventStream reads
   * back out of here to hand to settleLiveTurn).
   */
  conversationId: string;
  /**
   * What `POST /v1/chat` answered with: the daemon's SESSION id, one uuid per
   * assistant process run and identical across every turn of that run (see
   * sendLiveMessage's doc). Never an identity -- only the key
   * `ChatRepo.getConversation()` needs to fetch this turn's history.
   */
  daemonConversationId: string;
  /**
   * The ONE field on the wire that distinguishes one turn from another:
   * `POST /v1/chat` answers `studio-{n}` off a per-run counter incremented
   * once per accepted turn (assistant/main.py's `_StudioDispatch.submit`).
   * This is what `settleLiveTurn` guards on -- the status frame carries no
   * turn identity at all (`build_status_frame()` in
   * assistant/io/api/events.py emits phase/detail/step/tier and nothing
   * more), so the socket has to remember which turn it armed a settle for
   * and hand it back. Guarding on `conversationId` instead, as this did,
   * guards on nothing: live mode has one pane, so that string is identical
   * for every turn the user ever sends.
   */
  turnId: string;
  assistantMessageId: string;
}

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  streamingMessageId: string | null;
  liveTurn: LiveTurn | null;
  /**
   * Text handed back to the composer after a send the daemon refused (409
   * busy, or an unreachable daemon). Composer clears its textarea the moment
   * it calls sendMessage -- optimistically, because the overwhelming case is
   * a send that lands -- so the rollback needs somewhere to return the
   * user's words to. Null whenever there is nothing outstanding; not
   * persisted, since a draft rejected in a tab that then closed has no
   * composer left to restore it into.
   */
  rejectedDraft: string | null;
  searchQuery: string;
  hasHydrated: boolean;

  createConversation: () => string;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setActiveConversation: (id: string) => void;
  setSearchQuery: (q: string) => void;
  /** Acknowledges a restored draft. The composer owns the textarea, so only it can say the text is back. */
  clearRejectedDraft: () => void;

  sendMessage: (text: string) => void;
  appendStreamChunk: (messageId: string, chunk: string) => void;
  finishStreaming: () => void;
  stopStreaming: () => void;
  regenerateLast: () => void;
  getActiveConversation: () => Conversation | null;
  getStreamingTarget: () => {
    messageId: string;
    fullText: string;
    written: string;
  } | null;

  /**
   * The socket seam. useEventStream captures `liveTurn.turnId` when a
   * terminal `status` phase arms its quiet-window timer and hands that same
   * id back when the window elapses; this settles only if THAT turn is still
   * the pending one. Fetches the daemon's canonical message list
   * (ChatRepo.getConversation) and merges this turn's reply into the pane --
   * there is no token stream to append instead (see LiveTurn's own doc), so
   * the reply appears whole rather than character by character.
   *
   * The argument is a TURN id, not a conversation id (see LiveTurn.turnId
   * for why nothing else on the wire can tell two turns apart). The quiet
   * window is a heuristic and the timer outlives the turn it was armed for:
   * stop a turn inside the window and send again and it fires against the
   * turn AFTER the one it was armed for, and any of the many independent
   * `StatusPhase.IDLE` publishers can arm one for a turn that is still
   * running. Both settle a turn that has no reply stored yet, which used to
   * mean assigning a transcript that predates it over the pane -- erasing
   * the message the user had just sent. Mismatched ids are a no-op.
   *
   * The fetch uses `liveTurn.daemonConversationId`; the merge target is
   * `liveTurn.conversationId`, the local pane. Never rejects: a failed
   * refetch toasts (see the catch) rather than surfacing as an unhandled
   * rejection in the socket's `void` call.
   */
  settleLiveTurn: (turnId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      streamingMessageId: null,
      liveTurn: null,
      rejectedDraft: null,
      searchQuery: "",
      hasHydrated: false,

      createConversation: () => {
        const id = nextId("conv");
        const now = Date.now();
        const conversation: Conversation = {
          id,
          title: DEFAULT_CONVERSATION_TITLE,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        set({
          conversations: [conversation, ...get().conversations],
          activeConversationId: id,
        });
        return id;
      },

      deleteConversation: (id) => {
        const target = get().conversations.find((c) => c.id === id);
        const remaining = get().conversations.filter((c) => c.id !== id);
        const wasActive = get().activeConversationId === id;
        const streamingId = get().streamingMessageId;
        // Defence in depth: if the conversation being removed owns the
        // in-flight stream, clear streamingMessageId in the same update.
        // Without this, getStreamingTarget() returns null forever (the
        // message it pointed at no longer exists in any conversation) and
        // useMessageStream's tick loop never reaches finishStreaming() --
        // the composer stays soft-locked in "streaming" state. Only clear
        // it when THIS conversation actually owns it: deleting an unrelated
        // conversation must not interrupt a live stream in another one.
        const ownsStreamingMessage =
          streamingId != null && (target?.messages.some((m) => m.id === streamingId) ?? false);
        set({
          conversations: remaining,
          activeConversationId: wasActive
            ? (remaining[0]?.id ?? null)
            : get().activeConversationId,
          streamingMessageId: ownsStreamingMessage ? null : streamingId,
        });
      },

      renameConversation: (id, title) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        set({
          conversations: get().conversations.map((c) =>
            c.id === id ? { ...c, title: trimmed } : c,
          ),
        });
      },

      setActiveConversation: (id) => set({ activeConversationId: id }),

      setSearchQuery: (q) => set({ searchQuery: q }),

      clearRejectedDraft: () => set({ rejectedDraft: null }),

      /**
       * Branches on repo mode rather than being two callers' worth of
       * separate methods: Composer.tsx (this store's sole caller,
       * see the INVARIANT note below) stays mode-agnostic, matching
       * how every other shared chat component already reads getRepoMode()
       * nowhere at all -- the store is the one place that needs to know.
       */
      sendMessage: (text) => {
        // `!== "demo"` (Task 12): getRepoMode() is `RepoMode | null`, and null
        // means configureRepos() has not run. Falling through to the scripted
        // path there would answer a real question with chat-scripts.ts prose
        // and no way for the user to tell. sendLiveMessage catches its own
        // getRepos() throw and rolls the bubbles back with a toast, so the
        // unbound case surfaces as "could not reach her" -- which it is.
        if (getRepoMode() !== "demo") {
          void sendLiveMessage(get, set, text);
          return;
        }

        // INVARIANT (relied on one layer away): this has no guard against
        // starting a new message while another conversation's stream is
        // in flight. That's only safe because Composer is this store's
        // sole caller of sendMessage, and it gates both the Send button
        // and the Enter-key path on the global streamingMessageId (see
        // components/chat/Composer.tsx's `isStreaming`/`canSend`). If a
        // future caller (e.g. a real backend wiring) invokes sendMessage
        // without going through that gate, this guard needs to move here.
        const clean = text.trim();
        if (!clean) return;

        let conversationId = get().activeConversationId;
        if (!conversationId) {
          conversationId = get().createConversation();
        }

        const reply = resolveReply(clean);
        const now = Date.now();
        const userMessage: Message = {
          id: nextId("msg"),
          role: "user",
          content: clean,
          createdAt: now,
        };
        const assistantMessage: Message = {
          id: nextId("msg"),
          role: "assistant",
          content: "",
          createdAt: now,
          replyId: reply.id,
          variantIndex: 0,
        };

        set({
          conversations: get().conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const isFirstMessage = c.messages.length === 0;
            return {
              ...c,
              title: isFirstMessage ? titleFromMessage(clean) : c.title,
              messages: [...c.messages, userMessage, assistantMessage],
              updatedAt: now,
            };
          }),
          streamingMessageId: assistantMessage.id,
        });
      },

      appendStreamChunk: (messageId, chunk) => {
        if (get().streamingMessageId !== messageId) return;
        set({
          conversations: get().conversations.map((c) => {
            const hasTarget = c.messages.some((m) => m.id === messageId);
            if (!hasTarget) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, content: m.content + chunk } : m,
              ),
            };
          }),
        });
      },

      finishStreaming: () => {
        const streamingId = get().streamingMessageId;
        set({
          streamingMessageId: null,
          conversations: get().conversations.map((c) => {
            const ownsStreamingMessage = c.messages.some(
              (m) => m.id === streamingId,
            );
            return ownsStreamingMessage ? { ...c, updatedAt: Date.now() } : c;
          }),
        });
      },

      /**
       * A live turn has no partial content to preserve (no token frame
       * exists on the wire -- see LiveTurn's own doc), so stopping one drops
       * the empty placeholder bubble entirely rather than leaving a
       * permanently blank one behind. `abort()` is best-effort: the
       * composer unblocks either way, since staying soft-locked on a
       * network hiccup during an abort would be worse than one that
       * silently didn't land server-side.
       */
      stopStreaming: () => {
        const liveTurn = get().liveTurn;
        if (liveTurn) {
          void getRepos()
            .chat.abort()
            .catch(() => {});
          set((s) => ({
            liveTurn: null,
            conversations: s.conversations.map((c) =>
              c.id !== liveTurn.conversationId
                ? c
                : { ...c, messages: c.messages.filter((m) => m.id !== liveTurn.assistantMessageId) },
            ),
          }));
          return;
        }
        set({ streamingMessageId: null });
      },

      settleLiveTurn: async (turnId) => {
        const liveTurn = get().liveTurn;
        // A turn that was stopped leaves `liveTurn` null, so its timer bails
        // here; a turn that was stopped AND resent leaves a different
        // `turnId`, which is the case only this comparison catches.
        if (!liveTurn || liveTurn.turnId !== turnId) return;
        const { conversationId, assistantMessageId } = liveTurn;
        try {
          const detail = await getRepos().chat.getConversation(liveTurn.daemonConversationId);
          if (detail) {
            // The daemon builds a detail as `ConversationDetail(id, id,
            // messages)` -- its title IS its id, a raw session uuid -- so
            // adopting it verbatim would rename the sidebar entry to
            // "3f2a..." the instant the first live reply landed. The local
            // title (titleFromMessage() of what the user actually typed) is
            // the better one until the daemon has a real one to send, which
            // is exactly what `title !== id` detects.
            const title = detail.title === detail.id ? undefined : detail.title;
            set((s) => ({
              conversations: s.conversations.map((c) =>
                c.id !== conversationId
                  ? c
                  : {
                      ...c,
                      title: title ?? c.title,
                      messages: mergeSettledMessages(
                        c.messages,
                        detail.messages,
                        assistantMessageId,
                      ),
                      updatedAt: Date.now(),
                    },
              ),
            }));
          }
          // detail === null means the conversation is gone server-side. The
          // pane's own messages are left as-is rather than guessed at -- the
          // next explicit getConversation() (e.g. reopening the pane)
          // surfaces that on its own terms instead of this call inventing a
          // reason here. Only the placeholder goes, in the `finally` below.
        } catch {
          // sendLiveMessage toasts on exactly this class of failure and a
          // settle that stays silent is the worse of the two: by here the
          // user has watched their message land and is waiting on a reply
          // that is never coming. HttpChatRepo resolves 404 to null and
          // rethrows everything else, so what reaches here is a 401, a 500,
          // a dropped connection -- none of which the user can distinguish
          // from being ignored unless something says so.
          useToastStore.getState().push({
            ok: false,
            title: "Lost her reply",
            detail: "She finished the turn, but it could not be fetched.",
          });
        } finally {
          // Cleared on every path: the composer must unblock, and a retry is
          // a new sendMessage, not a mechanism this method owns. The
          // placeholder goes with it when it is still empty -- reaching here
          // with a blank bubble means no reply is coming for it, and one
          // that renders blank forever reads as "she ignored me". The merge
          // above has already replaced it on the path where one did arrive,
          // so this filter only fires on the null/throw paths.
          set((s) => ({
            liveTurn: null,
            conversations: s.conversations.map((c) =>
              c.id !== conversationId
                ? c
                : {
                    ...c,
                    messages: c.messages.filter(
                      (m) => m.id !== assistantMessageId || m.content !== "",
                    ),
                  },
            ),
          }));
        }
      },

      regenerateLast: () => {
        // Live replies are the daemon's real content; replyById() below
        // only knows chat-scripts.ts's scripted variants, so regenerating a
        // live message would silently overwrite it with fabricated demo
        // content rather than actually asking her again. Defence in depth
        // now: MessageBubble no longer offers the control in live mode (it
        // was an enabled button that did nothing at all), so reaching this
        // return means a caller that bypassed the UI.
        // `!== "demo"`: an unbound registry is not a licence to fabricate
        // either.
        if (getRepoMode() !== "demo") return;
        if (get().streamingMessageId) return;
        const conversation = get().getActiveConversation();
        if (!conversation) return;

        const lastAssistant = [...conversation.messages]
          .reverse()
          .find((m) => m.role === "assistant");
        if (!lastAssistant) return;

        const reply = replyById(lastAssistant.replyId ?? FALLBACK_REPLY.id);
        const nextVariant =
          ((lastAssistant.variantIndex ?? 0) + 1) % reply.variants.length;

        set({
          conversations: get().conversations.map((c) =>
            c.id !== conversation.id
              ? c
              : {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === lastAssistant.id
                      ? { ...m, content: "", variantIndex: nextVariant }
                      : m,
                  ),
                  updatedAt: Date.now(),
                },
          ),
          streamingMessageId: lastAssistant.id,
        });
      },

      getActiveConversation: () => {
        const { conversations, activeConversationId } = get();
        return conversations.find((c) => c.id === activeConversationId) ?? null;
      },

      getStreamingTarget: () => {
        const { streamingMessageId, conversations } = get();
        if (!streamingMessageId) return null;
        // Search every conversation, not just the active one: the user may switch
        // conversations mid-stream, and the stream must keep its place.
        for (const c of conversations) {
          const message = c.messages.find((m) => m.id === streamingMessageId);
          if (message) {
            const reply = replyById(message.replyId ?? FALLBACK_REPLY.id);
            return {
              messageId: message.id,
              fullText: reply.variants[message.variantIndex ?? 0],
              written: message.content,
            };
          }
        }
        return null;
      },
    }),
    {
      name: "tenka-studio-chat",
      storage: namespacedStorage<{
        conversations: Conversation[];
        activeConversationId: string | null;
      }>(),
      skipHydration: true,
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // A reload mid-stream leaves an empty trailing assistant message.
        // An empty bubble is worse than no bubble — drop it.
        state.conversations = state.conversations.map((c) => {
          const last = c.messages[c.messages.length - 1];
          if (last && last.role === "assistant" && last.content === "") {
            return { ...c, messages: c.messages.slice(0, -1) };
          }
          return c;
        });
        state.hasHydrated = true;
      },
    },
  ),
);
