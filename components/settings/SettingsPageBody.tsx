"use client";

/**
 * The settings page's actual content, shared by both routes that render it.
 *
 * Lives here, not in either page.tsx, because Next's typed-routes checker
 * (`next build`'s own type check, distinct from `tsc --noEmit`) requires a
 * `page.tsx` file to export ONLY the small fixed set it recognises --
 * `default`, `metadata`, `generateStaticParams`, and a few others -- and
 * rejects any other named export, even a component. A page.tsx also cannot
 * give its own `default` a custom prop: Next checks that signature against
 * its generated `PageProps` (params/searchParams only) and fails the build
 * the moment it isn't. Both of those broke here before this file existed:
 * app/demo/settings/page.tsx tried to be both the route AND the reusable
 * body, and `next build` rejected it on two separate grounds that neither
 * `tsc --noEmit` nor `vitest` catch.
 *
 * app/demo/settings/page.tsx renders this with no `extra` (demo has no real
 * device vault to back a devices/pairing section with). app/app/settings/
 * page.tsx supplies `extra={<DevicesPanel />}` -- milestone 6a's live-only
 * pairing UI -- rather than duplicating everything below it.
 */
import { useEffect, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { matchPanels, visiblePanels } from "@/components/settings/panels";
import { useSettingsStore, selectVisibleDefs, selectGroups } from "@/store/settings-store";
import { useSettingsHydration } from "@/hooks/useSettingsHydration";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { SettingsSearch } from "@/components/settings/SettingsSearch";
import { SettingGroup } from "@/components/settings/SettingGroup";
import { RestartBanner } from "@/components/settings/RestartBanner";
import { PersonalityPanel } from "@/components/settings/PersonalityPanel";
import { BackupPanel } from "@/components/settings/BackupPanel";
import { EnrollmentPanel } from "@/components/settings/EnrollmentPanel";
import { DangerZone } from "@/components/settings/DangerZone";
import { SaveBar } from "@/components/settings/SaveBar";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadFailure } from "@/components/ui/LoadFailure";

export interface SettingsPageBodyProps {
  /**
   * Milestone 6a's devices/pairing section, supplied by the live route only
   * (there is no demo device vault to back it). Rendered in the
   * `panel-devices` slot below -- between Enrollment and Danger Zone, and
   * behaving like every other panel: it has a rail entry, it answers a search
   * for "pairing", and it hides behind a group filter.
   *
   * It used to render after everything, which put it BELOW Danger Zone, and
   * had no panel entry at all, so nothing in the rail pointed at it.
   *
   * app/demo/settings/page.tsx never passes this. `visiblePanels(false)` then
   * drops the devices entry from the rail and from search, so the demo route
   * renders exactly what it rendered before the entry existed.
   */
  extra?: ReactNode;
  /**
   * Milestone 6b's transports screen, the second independent live-only slot
   * -- see panels.ts's own doc on why it is tracked separately from `extra`
   * rather than folded into it. Rendered in the `panel-transports` slot,
   * directly above Devices & Pairing.
   */
  transportsExtra?: ReactNode;
}

export function SettingsPageBody({ extra, transportsExtra }: SettingsPageBodyProps = {}) {
  useSettingsHydration();
  // Narrow reads only: `drafts`, `errors`, `saving`, and `pendingRestart`
  // change on every keystroke in any of the ~40 rows below, and this page
  // has no memoized children, so subscribing to the whole store here would
  // re-render every group and every row on every keystroke -- the exact
  // cascade Task 18 scoped SettingRow to avoid, reintroduced one level up.
  // `selectVisibleDefs` builds a fresh array each call, so it needs
  // `useShallow` to compare element-wise; status/activeGroup/load do not.
  const status = useSettingsStore((s) => s.status);
  const activeGroup = useSettingsStore((s) => s.activeGroup);
  const query = useSettingsStore((s) => s.query);
  const load = useSettingsStore((s) => s.load);
  const defs = useSettingsStore(useShallow(selectVisibleDefs));
  const allGroups = useSettingsStore(useShallow(selectGroups));

  useEffect(() => {
    if (status === "idle") void load();
  }, [status, load]);

  const groups = activeGroup ? [activeGroup] : allGroups;

  /*
   * Fix round, milestone 5b Task 5: `personality` IS in the daemon's
   * runtime_config.REGISTRY (config.py's _runtime_setting("personality",
   * ...) registers it like any other setting) -- corrected from this
   * task's first pass, which had that backwards. GET /v1/settings really
   * does return a `personality` row, and PATCHing it through the generic
   * settings route reports success while changing nothing (it writes
   * through settings_facade, not switch_personality() -- the path
   * HttpPersonalityRepo actually uses). HttpSettingsRepo.load() already
   * drops this key before it ever becomes a def (see its DEAD_ROW_KEYS),
   * but this filter stays here too, defensively: a live-mode page must
   * never render a control that reports success and does nothing, even if
   * a future repository forgets to exclude it upstream.
   */
  const rows = defs.filter((d) => d.key !== "personality");

  /*
   * The panels are searchable in their own right, by keyword rather than by
   * registry row -- see components/settings/panels.ts. Typing "backup" is a
   * user looking for the backup panel, and answering "No setting matches
   * that." because no ROW matched is wrong. A group filter still hides them,
   * since a panel belongs to no group and cannot be filtered to.
   */
  const hasExtra = extra !== undefined;
  const hasTransports = transportsExtra !== undefined;
  const matchedPanels = activeGroup ? [] : matchPanels(query, hasExtra, hasTransports);
  const shown = new Set(matchedPanels.map((p) => p.id));

  return (
    // h-full: the layout's <main> supplies a definite height now -- see
    // components/shell/shell-classes.ts and app/demo/memory/page.tsx's note on
    // the `calc(100vh-8.5rem)` this replaces.
    <div className="flex h-full gap-6 overflow-hidden p-4 lg:p-8">
      {/*
        min-h-0 + overflow-y-auto: the page root is a fixed height now, and the
        rail is 15 groups plus 4 panel links. Without its own scroll it was
        simply clipped -- everything from Personality down was unreachable.
      */}
      {/*
        Only once the defs are real. `state.defs` is seeded to the static
        registry (store/settings-store.ts) and load()'s catch deliberately
        leaves it alone, so an error status left this rail confidently
        listing 39 groups -- SettingsNav's own doc promises the opposite,
        that the groups come from what actually loaded -- immediately beside
        "She could not reach her settings." The status branch below wraps
        only the right-hand column, so nothing else was ever going to hide
        it. Searching a list that failed to load is equally empty, so the
        search box goes with it, here and in the small-screen copy below.
      */}
      {status === "ready" && (
        <aside className="hidden min-h-0 w-48 shrink-0 flex-col gap-3 overflow-y-auto pr-2 lg:flex">
          <SettingsSearch />
          <SettingsNav panels={visiblePanels(hasExtra, hasTransports)} />
        </aside>
      )}

      {/*
        pr-3 is a gutter, not decoration: this container scrolls, so without it
        the rows' right-hand controls -- toggles, sliders, number fields -- sit
        flush against the scrollbar track.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-3">
        {status === "ready" && (
          <div className="lg:hidden">
            <SettingsSearch />
          </div>
        )}

        {status === "error" ? (
          // Mirrors components/memory/EntityList.tsx's error branch: before
          // this, an "error" status rendered the loading skeleton forever,
          // with no way back short of a hard reload. GET /v1/settings is an
          // `observe` read; in the demo tree no session is ever probed, so
          // LoadFailure resolves to exactly the sentence and retry button that
          // were here before.
          <LoadFailure
            capability="observe"
            unreachable="She could not reach her settings."
            onRetry={() => void load()}
            className="flex-1"
          />
        ) : status !== "ready" ? (
          <div aria-label="Loading settings" className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <>
            <RestartBanner />
            {rows.length === 0 && matchedPanels.length === 0 && (
              <p className="py-8 text-center text-sm text-bone-ghost">No setting matches that.</p>
            )}
            {groups.map((group) => (
              <SettingGroup key={group} name={group} defs={rows.filter((d) => d.group === group)} />
            ))}
            {shown.has("panel-personality") && (
              <div id="panel-personality">
                <PersonalityPanel />
              </div>
            )}
            {shown.has("panel-backup") && (
              <div id="panel-backup">
                <BackupPanel />
              </div>
            )}
            {shown.has("panel-enrollment") && (
              <div id="panel-enrollment">
                <EnrollmentPanel />
              </div>
            )}
            {shown.has("panel-transports") && (
              <div id="panel-transports">{transportsExtra}</div>
            )}
            {shown.has("panel-devices") && <div id="panel-devices">{extra}</div>}
            {shown.has("panel-danger") && (
              <div id="panel-danger">
                <DangerZone />
              </div>
            )}
            <SaveBar />
          </>
        )}
        {/*
          `extra` is a panel now, so it lives in the branch above with the
          others -- except when the settings load itself FAILED, where there
          are no panels at all. Devices does not depend on the settings
          registry, and losing the only way to revoke a credential because an
          unrelated GET failed would be its own bug, so it still renders here
          in that one case. The two branches are mutually exclusive, so nothing
          ever draws it twice; and "loading" is deliberately not included, so a
          normal page load mounts it exactly once, at ready, rather than
          mounting it under the skeleton and remounting it a moment later.
          `transportsExtra` gets the same treatment for the same reason: it
          does not depend on the settings registry either.
        */}
        {status === "error" && transportsExtra}
        {status === "error" && extra}
      </div>
    </div>
  );
}
