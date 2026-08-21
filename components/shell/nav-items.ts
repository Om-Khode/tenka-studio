"use client";

import {
  LayoutDashboard,
  MessageSquare,
  Terminal,
  Folder,
  Brain,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { useMemoryStore, selectVisibleEntities } from "@/store/memory-store";

/**
 * The nav, once. Two components render it -- components/shell/Sidebar.tsx at
 * `lg` and up, components/shell/BottomNav.tsx below it -- and a second
 * hand-maintained copy is the shape that drifts: a seventh destination added
 * to one and not the other is invisible until somebody opens Studio on the
 * other form factor.
 *
 * `path` is a suffix, never a route. Both consumers build every href from the
 * `basePath` they are handed (`/demo` or `/app`), which is what lets one nav
 * serve both trees -- see Sidebar's own docstring.
 */
export type NavItem = {
  label: string;
  /** Appended to the caller's basePath. "" is the tree's dashboard. */
  path: string;
  icon: LucideIcon;
  /** Key into useNavBadgeValues(); absent means this item never badges. */
  badge?: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", path: "", icon: LayoutDashboard },
  { label: "Chat", path: "/chat", icon: MessageSquare, badge: "conversation-count" },
  { label: "Commands", path: "/commands", icon: Terminal },
  { label: "Files", path: "/files", icon: Folder },
  { label: "Memory", path: "/memory", icon: Brain, badge: "entity-count" },
  { label: "Settings", path: "/settings", icon: Settings },
];

/**
 * Resolves the two live badge counts to the strings the nav renders, or
 * `undefined` where there is nothing worth a badge.
 *
 * A hook rather than a plain function because both counts are store
 * subscriptions, and it lives beside NAV_ITEMS rather than in either consumer
 * so the sidebar and the bottom bar cannot disagree about when a badge shows.
 * Returns a fresh object per render, which costs nothing: its two callers each
 * read it once in their own render body, and the subscriptions underneath are
 * what actually decide whether that render happens.
 */
export function useNavBadgeValues(): Record<string, string | undefined> {
  const conversationCount = useChatStore((s) => s.conversations.length);
  const entityCount = useMemoryStore((s) =>
    s.status === "ready" ? selectVisibleEntities(s).length : 0,
  );
  return {
    "conversation-count": conversationCount > 0 ? String(conversationCount) : undefined,
    "entity-count": entityCount > 0 ? String(entityCount) : undefined,
  };
}
