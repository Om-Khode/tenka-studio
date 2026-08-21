import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase } from "@/services/http";
import { clearDevToken } from "@/services/token";
import { HttpChatRepo } from "./chat";

const BASE = apiBase();
const envelope = <T>(data: T) => ({ data, meta: { requestId: "r1", generatedAt: "2026-08-09T00:00:00Z" } });

describe("HttpChatRepo", () => {
  beforeEach(() => {
    clearDevToken();
  });

  it("sendMessage maps ChatSendPayload's turnId/conversationId, not a reply string", async () => {
    server.use(
      http.post(`${BASE}/v1/chat`, () =>
        HttpResponse.json(envelope({ turnId: "t1", conversationId: "c1" }), { status: 202 }),
      ),
    );
    const repo = new HttpChatRepo();
    const result = await repo.sendMessage("hello");
    expect(result).toEqual({ turnId: "t1", conversationId: "c1" });
  });

  it("sendMessage rejects with a 409 the composer can render as busy, not a silent drop", async () => {
    server.use(
      http.post(`${BASE}/v1/chat`, () => HttpResponse.json({ detail: "busy" }, { status: 409 })),
    );
    const repo = new HttpChatRepo();
    await expect(repo.sendMessage("hello")).rejects.toMatchObject({ status: 409, code: "busy" });
  });

  it("listConversations maps the ref shape -- title, updatedAt, messageCount, no messages array", async () => {
    server.use(
      http.get(`${BASE}/v1/chat/conversations`, () =>
        HttpResponse.json(
          envelope({
            conversations: [
              { conversationId: "c1", title: "Routing questions", updatedAt: "2026-08-09T00:00:00Z", messageCount: 3 },
            ],
          }),
        ),
      ),
    );
    const repo = new HttpChatRepo();
    const refs = await repo.listConversations();
    expect(refs).toEqual([
      { id: "c1", title: "Routing questions", updatedAt: Date.parse("2026-08-09T00:00:00Z"), messageCount: 3 },
    ]);
    expect(refs[0]).not.toHaveProperty("messages");
  });

  it("getConversation maps the detail shape -- messages, no messageCount/updatedAt", async () => {
    server.use(
      http.get(`${BASE}/v1/chat/conversations/c1`, () =>
        HttpResponse.json(
          envelope({
            conversationId: "c1",
            title: "Routing questions",
            messages: [
              { messageId: "m1", role: "user", text: "hi", createdAt: "2026-08-09T00:00:00Z", intent: "small_talk" },
            ],
          }),
        ),
      ),
    );
    const repo = new HttpChatRepo();
    const detail = await repo.getConversation("c1");
    expect(detail).toEqual({
      id: "c1",
      title: "Routing questions",
      messages: [{ id: "m1", role: "user", content: "hi", createdAt: Date.parse("2026-08-09T00:00:00Z") }],
    });
    expect(detail).not.toHaveProperty("messageCount");
    // `intent` rides the wire but is dropped at the edge -- nothing in
    // Studio's Message type carries it.
    expect(detail!.messages[0]).not.toHaveProperty("intent");
  });

  it("getConversation resolves null for a missing conversation, not an error", async () => {
    server.use(
      http.get(`${BASE}/v1/chat/conversations/gone`, () =>
        HttpResponse.json({ error: "not found" }, { status: 404 }),
      ),
    );
    const repo = new HttpChatRepo();
    await expect(repo.getConversation("gone")).resolves.toBeNull();
  });

  it("getConversation rethrows anything that is not a 404 -- a 500 must not read as 'no such chat'", async () => {
    server.use(
      http.get(`${BASE}/v1/chat/conversations/broken`, () =>
        HttpResponse.json({ detail: "internal error" }, { status: 500 }),
      ),
    );
    const repo = new HttpChatRepo();
    await expect(repo.getConversation("broken")).rejects.toMatchObject({ status: 500 });
  });

  it("abort maps AbortPayload.aborted", async () => {
    server.use(http.post(`${BASE}/v1/abort`, () => HttpResponse.json(envelope({ aborted: true }))));
    const repo = new HttpChatRepo();
    await expect(repo.abort()).resolves.toBe(true);
  });
});
