import type { ChatRepo } from "../types";
import type { ConversationDetail, ConversationRef } from "@/types/chat";

/**
 * chat-store.ts does NOT call this -- its scripted streaming (character-by-
 * character reveal, regenerate variants, abort mid-stream) is working,
 * tested behaviour, and moving it into a repository it doesn't need yet is
 * a rewrite for no gain (see this milestone's plan, Task 2: "Chat and
 * system stay store-internal in demo mode"). This exists for RepoBundle
 * completeness and as a reference for the real `HttpChatRepo`
 * (services/repos/http/chat.ts): its methods return well-typed, inert
 * values rather than reaching into `chat-scripts.ts`, because the daemon's
 * `ChatRepo` shape (send-then-stream, list of refs, fetch-a-detail) has no
 * honest demo equivalent -- the demo's `Conversation` type already carries
 * everything in one place, so there is nothing for this repo to actually do.
 */
export class DemoChatRepo implements ChatRepo {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match ChatRepo; this stub never reads the argument
  async sendMessage(_text: string): Promise<{ turnId: string; conversationId: string }> {
    return { turnId: `demo-turn-${crypto.randomUUID()}`, conversationId: "demo" };
  }

  async listConversations(): Promise<ConversationRef[]> {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match ChatRepo; this stub never reads the argument
  async getConversation(_id: string): Promise<ConversationDetail | null> {
    return null;
  }

  async abort(): Promise<boolean> {
    return false;
  }
}
