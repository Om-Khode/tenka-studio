import { apiGet, apiSend, ApiError } from "@/services/http";
import type { components } from "@/types/api";
import type { ChatRepo } from "../types";
import type { ConversationDetail, ConversationRef, Message } from "@/types/chat";

type ChatSendPayload = components["schemas"]["ChatSendPayload"];
type ConversationsPayload = components["schemas"]["ConversationsPayload"];
type ConversationRefPayload = components["schemas"]["ConversationRefPayload"];
type ConversationDetailPayload = components["schemas"]["ConversationDetailPayload"];
type ChatMessagePayload = components["schemas"]["ChatMessagePayload"];
type AbortPayload = components["schemas"]["AbortPayload"];

function toMessage(payload: ChatMessagePayload): Message {
  // `intent` rides on the wire (payloads.py's ChatMessagePayload.intent) but
  // nothing in Studio reads it today -- dropped here, at the one edge that
  // maps daemon JSON onto Studio's own Message, rather than smuggling an
  // unused field onto a type every component that touches Message has to
  // know about.
  return {
    id: payload.messageId,
    role: payload.role,
    content: payload.text,
    createdAt: Date.parse(payload.createdAt),
  };
}

function toConversationRef(payload: ConversationRefPayload): ConversationRef {
  return {
    id: payload.conversationId,
    title: payload.title,
    updatedAt: Date.parse(payload.updatedAt),
    messageCount: payload.messageCount,
  };
}

function toConversationDetail(payload: ConversationDetailPayload): ConversationDetail {
  return {
    id: payload.conversationId,
    title: payload.title,
    messages: payload.messages.map(toMessage),
  };
}

/**
 * Maps Studio's chat domain onto the daemon's `/v1/chat*` routes (see "The
 * shipped contract" in the milestone 5b plan). Deliberately NOT wired into
 * chat-store.ts by this task -- that store's scripted streaming stays demo-
 * only per Task 2, and wiring the live tree onto this repo is Task 9's job.
 */
export class HttpChatRepo implements ChatRepo {
  async sendMessage(text: string): Promise<{ turnId: string; conversationId: string }> {
    const result = await apiSend<ChatSendPayload>("POST", "/v1/chat", { text });
    return { turnId: result.turnId, conversationId: result.conversationId };
  }

  async listConversations(): Promise<ConversationRef[]> {
    const result = await apiGet<ConversationsPayload>("/v1/chat/conversations");
    return result.conversations.map(toConversationRef);
  }

  async getConversation(id: string): Promise<ConversationDetail | null> {
    try {
      const result = await apiGet<ConversationDetailPayload>(
        `/v1/chat/conversations/${encodeURIComponent(id)}`,
      );
      return toConversationDetail(result);
    } catch (err) {
      // Only "gone" resolves to null. Anything else -- 401/403/409/429, a
      // network failure, a malformed envelope -- rethrows, so a caller can
      // never mistake "she said no" or "she is not answering" for "there is
      // no such chat". A bare `except: return null` here would make every
      // one of those read as the same silent absence.
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  async abort(): Promise<boolean> {
    const result = await apiSend<AbortPayload>("POST", "/v1/abort");
    return result.aborted;
  }
}
