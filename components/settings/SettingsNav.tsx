"use client";

import { useShallow } from "zustand/react/shallow";
import { useSettingsStore, selectGroups } from "@/store/settings-store";
import { visiblePanels, type PanelDef } from "./panels";
import { cn } from "@/lib/utils";

/*
 * Panel list lives in ./panels.ts so the rail and the page's search agree on
 * what exists and what it is called. These are jump targets: clear whatever
 * filter is active first -- a panel is hidden while a group filter is on, so
 * scrolling to it would otherwise land on nothing -- then scroll it into view.
 */

const ENTRY = "rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition-colors";

/**
 * Groups come from the currently-loaded defs, not a hardcoded list -- and
 * not the static registry either, once a live load can add or drop a
 * group the registry never named (milestone 5b, Task 5).
 */
export interface SettingsNavProps {
  /**
   * Which panels this route actually rendered. Defaults to the ones
   * SettingsPageBody draws itself, so a nav mounted on its own -- or by a
   * route with no `extra` -- lists exactly what is on the page and nothing
   * that would scroll to an empty document.
   */
  panels?: PanelDef[];
}

export function SettingsNav({ panels = visiblePanels(false) }: SettingsNavProps = {}) {
  const groups = useSettingsStore(useShallow(selectGroups));
  const activeGroup = useSettingsStore((s) => s.activeGroup);
  const setActiveGroup = useSettingsStore((s) => s.setActiveGroup);
  const setQuery = useSettingsStore((s) => s.setQuery);

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Setting groups" className="flex flex-col gap-0.5">
        {groups.map((group) => {
          const active = activeGroup === group;
          return (
            <button
              key={group}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveGroup(active ? null : group)}
              className={cn(ENTRY, active ? "bg-card text-bone" : "text-bone-ghost hover:text-bone-dim")}
            >
              {group}
            </button>
          );
        })}
      </nav>

      <nav aria-label="Panels" className="flex flex-col gap-0.5 border-t border-border pt-3">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            onClick={() => {
              setActiveGroup(null);
              setQuery("");
              // The panel only exists in the DOM once the filters above are
              // cleared, and that clear is a state update -- so the scroll
              // waits a frame for React to commit it.
              requestAnimationFrame(() => {
                document.getElementById(panel.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
            className={cn(ENTRY, "text-bone-ghost hover:text-bone-dim")}
          >
            {panel.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
