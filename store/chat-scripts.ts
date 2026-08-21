import type { ScriptedReply } from "@/types/chat";

export const DEFAULT_CONVERSATION_TITLE = "New conversation";

export const SCRIPTED_REPLIES: ScriptedReply[] = [
  {
    id: "reply-routing",
    keywords: ["route", "routing", "stack", "browser", "vision"],
    variants: [
      `Three stacks, and I never ask a model which one to use.

- **browser** — Playwright over CDP, for anything with a URL
- **apps** — the accessibility tree, for native windows
- **vision** — screenshots, and only when the first two can't see it

The routing itself is deterministic:

\`\`\`python
def route(goal: str) -> Stack:
    if preference := prefs.get(goal):
        return preference
    if url_pattern.match(goal):
        return Stack.BROWSER
    if proc := running_process_for(goal):
        return Stack.APPS
    return Stack.VISION  # last resort, never first
\`\`\`

Most of what I do never touches a pixel. That's the whole point.`,
      `I don't guess at stacks — I decide, then I tell you which one I used.

Order of resolution:

1. your saved preference, if you've taught me one
2. a URL match → browser
3. a running process → apps
4. vision, only because the others came up empty

\`\`\`python
STACKS = ("browser", "apps", "vision")

def route(goal: str) -> str:
    # vision is last for a reason: it costs, the others don't
    return first_match(goal) or "vision"
\`\`\`

Cheaper, faster, and I can explain every choice afterward.`,
    ],
  },
  {
    id: "reply-cost",
    keywords: ["cost", "price", "spend", "money", "cheap", "expensive"],
    variants: [
      `Roughly two dollars a month, and I'll show you the arithmetic.

| path | per task | 41 tasks/day |
| --- | --- | --- |
| routed (what I do) | $0.0001 | $0.0041 |
| vision on everything | $0.0005 | $0.0192 |

Nearly five times cheaper, because \`29\` of those 41 tasks never needed to look at your screen at all.

I'd rather spend your quota on the tasks that actually need eyes.`,
      `Two dollars a month, give or take, and it's not a rounding trick.

| stack | share of tasks | vision calls |
| --- | --- | --- |
| browser | 46% | 0 |
| apps | 37% | 0 |
| vision | 17% | 1–3 each |

The whole saving is in that third column. Skip the screenshot and the bill mostly disappears — so I skip it whenever the accessibility tree already knows the answer.`,
    ],
  },
  {
    id: "reply-memory",
    keywords: ["memory", "remember", "forget", "know about me", "knowledge"],
    variants: [
      `Everything I know about you sits in one SQLite file on your machine.

- entities and the facts that link them
- when I learned each thing, and from which conversation
- commitments you made, so I can bring them up later

\`\`\`sql
SELECT subject, predicate, object, learned_at
FROM facts
WHERE subject = 'you'
ORDER BY learned_at DESC;
\`\`\`

No cloud, no account. Ask me to forget something and it's a \`DELETE\`, not a flag.`,
      `One file. \`~/TENKA/memory/tenka.db\`. That's the whole of what I know about you.

- I extract facts from what you say, not from anything I scrape
- every fact keeps its provenance — I can tell you *when* and *where* I learned it
- forgetting is real deletion, not a hidden tombstone

\`\`\`sql
DELETE FROM facts WHERE subject = ? AND predicate = ?;
\`\`\`

You can open it with any SQLite browser and read every row yourself. I'd rather you did.`,
    ],
  },
];

export const FALLBACK_REPLY: ScriptedReply = {
  id: "reply-fallback",
  keywords: [],
  variants: [
    `This is demo mode — I'm reading from a script, not thinking.

Ask me about **routing**, **cost**, or **memory** and you'll get something worth reading. Wire me to a real TENKA and the same interface talks to the real thing.`,
    `Scripted reply. There's no model behind this window yet.

Try **routing**, **cost**, or **memory** — those I have real answers for. The rest arrives when this connects to an actual TENKA.`,
  ],
};

export function resolveReply(userText: string): ScriptedReply {
  const haystack = userText.toLowerCase();
  return (
    SCRIPTED_REPLIES.find((reply) =>
      reply.keywords.some((kw) => haystack.includes(kw))
    ) ?? FALLBACK_REPLY
  );
}
