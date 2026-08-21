"use client";

import { ChatPane } from "@/components/chat/ChatPane";
import { useMessageStream } from "@/hooks/useMessageStream";

export default function ChatPage() {
  useMessageStream();

  // Store hydration (store/chat-store.ts's persist.rehydrate()) happens in
  // app/demo/layout.tsx via useChatHydration -- it runs on every /demo/*
  // route, not just this page. See hooks/useChatHydration.ts.

  // h-full, not a hand-computed viewport height: the layout's <main> is
  // `min-h-0 flex-1` inside an `h-dvh` shell now, so it HAS a definite height
  // to measure against. See components/shell/shell-classes.ts.
  return <ChatPane />;
}
