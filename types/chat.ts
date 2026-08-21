export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** assistant messages only: which scripted variant is currently shown */
  replyId?: string;
  variantIndex?: number;
}

/**
 * The demo's own shape: chat-store.ts always holds every message for every
 * conversation it lists, so one type carrying both the list-row fields and
 * the full body has never been a lie there. Left untouched by Milestone 5b
 * Task 7 -- chat-store.ts does not call a repository (see repos/demo/chat.ts)
 * and this type is not part of the daemon contract.
 */
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

/**
 * The daemon's list-row shape (`GET /v1/chat/conversations` ->
 * `ConversationRefPayload`, one per conversation, no `messages`). A list of
 * these is not a list of half-empty `Conversation`s -- it never carries a
 * body, so `Conversation` would either lie about having `messages: []` (a
 * conversation with real history rendering as empty) or force a second
 * network call just to satisfy a type. `updatedAt` is epoch ms, mapped from
 * the wire's ISO string inside `HttpChatRepo`, same convention as
 * `Message.createdAt`.
 *
 * No `createdAt`: the daemon has no field for it (`ConversationRefPayload`
 * has `updatedAt` only) and `HttpChatRepo` does not invent one -- see
 * `ConversationDetail` for why deriving it from the first message was
 * rejected too.
 */
export interface ConversationRef {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

/**
 * The daemon's single-conversation shape (`GET
 * /v1/chat/conversations/{id}` -> `ConversationDetailPayload`): a title and
 * its messages, no `updatedAt`/`messageCount` -- a pane that fetched the
 * body already has the messages themselves to derive a count or a last-
 * activity time from, if it ever needs to.
 *
 * No `createdAt` here either. `messages[0].createdAt` looks like a free
 * derivation but isn't reliable: it depends on the daemon never trimming or
 * paginating the messages array, a guarantee nothing in the contract makes,
 * and it would silently disagree with `ConversationRef` (which has no
 * messages to derive from at all) if any page ever tried to sort by
 * "created" using whichever shape happened to be in hand. Dropping it is the
 * honest choice: nothing downstream is told a conversation was created at a
 * time nobody actually reported.
 */
export interface ConversationDetail {
  id: string;
  title: string;
  messages: Message[];
}

export interface ScriptedReply {
  id: string;
  /** lowercase keywords; a message matches if it contains any of them */
  keywords: string[];
  /** exactly 2 variants so Regenerate always has somewhere to go */
  variants: [string, string];
}
