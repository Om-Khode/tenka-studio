"use client";

import { useSettingsStore } from "@/store/settings-store";

export function SettingsSearch() {
  const query = useSettingsStore((s) => s.query);
  const setQuery = useSettingsStore((s) => s.setQuery);
  const setActiveGroup = useSettingsStore((s) => s.setActiveGroup);

  return (
    <input
      type="search"
      value={query}
      placeholder="search settings…"
      aria-label="Search settings"
      onChange={(e) => {
        setQuery(e.target.value);
        // A group filter would silently hide matches from other groups.
        if (e.target.value) setActiveGroup(null);
      }}
      className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 font-mono text-xs text-bone placeholder:text-bone-ghost focus:border-border-strong focus:outline-none"
    />
  );
}
