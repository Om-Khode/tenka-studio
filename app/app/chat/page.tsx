"use client";

import { ChatPane } from "@/components/chat/ChatPane";

/**
 * Not a re-export of app/demo/chat/page.tsx (milestone 5b, Task "10b"):
 * that page mounts useMessageStream, which drives chat-store.ts's demo-only
 * word-by-word reveal off chat-scripts.ts's scripted replies. A live turn
 * never sets `streamingMessageId` (see chat-store.ts's `LiveTurn` doc)
 * specifically so that hook has nothing to act on if it ran here anyway,
 * but there is no reason to run an always-on poll loop for a mechanism this
 * tree never uses. The pane below is unchanged -- it only ever reads
 * chat-store.ts, never chat-scripts.ts or demo-engine.ts directly, so it is
 * exactly as reusable here as on the demo page.
 *
 * That shared layout is components/chat/ChatPane.tsx rather than a second
 * copy of the JSX: it now carries the small-screen list/thread swap, and two
 * hand-maintained copies of that would be two behaviours.
 *
 * Store hydration happens in app/app/layout.tsx via useChatHydration, same
 * as the demo tree -- see hooks/useChatHydration.ts.
 */
export default function LiveChatPage() {
  return <ChatPane />;
}
