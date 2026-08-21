import { describe, it, expect } from "vitest";
import { DemoChatRepo } from "./chat";

describe("DemoChatRepo", () => {
  it("sendMessage resolves a turnId/conversationId pair, never a reply string", async () => {
    const repo = new DemoChatRepo();
    const result = await repo.sendMessage("tell me about routing");
    expect(typeof result.turnId).toBe("string");
    expect(typeof result.conversationId).toBe("string");
    expect(result).not.toHaveProperty("reply");
  });

  it("listConversations and getConversation are inert -- chat-store.ts owns demo history, not this repo", async () => {
    const repo = new DemoChatRepo();
    expect(await repo.listConversations()).toEqual([]);
    expect(await repo.getConversation("anything")).toBeNull();
  });

  it("abort resolves a boolean", async () => {
    const repo = new DemoChatRepo();
    expect(await repo.abort()).toBe(false);
  });
});
