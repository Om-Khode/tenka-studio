import { describe, it, expect } from "vitest";
import {
  SCRIPTED_REPLIES,
  FALLBACK_REPLY,
  resolveReply,
  DEFAULT_CONVERSATION_TITLE,
} from "./chat-scripts";

describe("chat-scripts data", () => {
  it("every reply has exactly 2 variants and at least one keyword", () => {
    expect(SCRIPTED_REPLIES.length).toBeGreaterThanOrEqual(3);
    for (const reply of SCRIPTED_REPLIES) {
      expect(reply.variants).toHaveLength(2);
      expect(reply.keywords.length).toBeGreaterThan(0);
      expect(reply.variants[0]).not.toBe(reply.variants[1]);
    }
  });

  it("keywords are lowercase so matching is case-insensitive", () => {
    for (const reply of SCRIPTED_REPLIES) {
      for (const kw of reply.keywords) {
        expect(kw).toBe(kw.toLowerCase());
      }
    }
  });

  it("the script set demonstrates a fenced code block, a table, and a list", () => {
    const all = SCRIPTED_REPLIES.flatMap((r) => r.variants).join("\n");
    expect(all).toMatch(/```/);
    expect(all).toMatch(/\|.*\|/);
    expect(all).toMatch(/^- /m);
  });

  it("fallback has 2 variants and is not in the keyword-matched list", () => {
    expect(FALLBACK_REPLY.variants).toHaveLength(2);
    expect(SCRIPTED_REPLIES).not.toContain(FALLBACK_REPLY);
  });
});

describe("resolveReply", () => {
  it("matches a reply by keyword, case-insensitively", () => {
    const target = SCRIPTED_REPLIES[0];
    const kw = target.keywords[0];
    expect(resolveReply(`Tell me about ${kw.toUpperCase()} please`).id).toBe(target.id);
  });

  it("returns the fallback when nothing matches", () => {
    expect(resolveReply("zzzzqqqq nonsense xyzzy").id).toBe(FALLBACK_REPLY.id);
  });

  it("when several entries match, the earliest in array order wins", () => {
    // Build a message containing a keyword from the LAST entry and one from the FIRST.
    const first = SCRIPTED_REPLIES[0].keywords[0];
    const last = SCRIPTED_REPLIES[SCRIPTED_REPLIES.length - 1].keywords[0];
    expect(resolveReply(`${last} and also ${first}`).id).toBe(SCRIPTED_REPLIES[0].id);
  });

  it("exposes a default conversation title", () => {
    expect(DEFAULT_CONVERSATION_TITLE).toBe("New conversation");
  });
});
