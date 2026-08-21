/**
 * The four panels, as data.
 *
 * They are not registry groups -- they have no `SettingDef` rows and cannot be
 * filtered to the way a group can -- but they ARE settings surfaces, so the
 * search has to reach them. `keywords` is what the query is matched against:
 * a user typing "backup" or "recovery phrase" is looking for the backup panel,
 * not for one of the 40 rows, and answering "No setting matches that." is
 * wrong even though no row matched.
 *
 * `personality` is the case that forced this to be general. It is not a
 * registry row at all any more (milestone 5b, Task 5 moved it onto its own
 * PersonalityRepo) -- PersonalityPanel is its only control, so without
 * keyword matching, searching for it would find nothing at all.
 *
 * Shared by SettingsNav (jump links) and the page (search matching) so the two
 * cannot disagree about what exists or what it is called.
 */
/**
 * Who renders the panel.
 *
 * `body` panels are drawn by SettingsPageBody itself and exist on every route
 * that renders it. `extra` panels are supplied by ONE route -- milestone 6a's
 * devices/pairing section, which is live-only because there is no demo device
 * vault to back it -- and must not appear in the other route's rail: a jump
 * link that scrolls to nothing is a worse bug than the missing entry it would
 * be fixing. `visiblePanels()` is the one place that decides.
 *
 * `extra-transports` is milestone 6b's second live-only slot (the transports
 * screen), kept distinct from `extra` rather than folded into it: the two
 * sections are supplied independently by AppSettingsPage (see its own doc),
 * and a route could in principle supply one without the other.
 */
export type PanelSource = "body" | "extra" | "extra-transports";

export interface PanelDef {
  /** DOM id the page wraps the panel in, and the nav scrolls to. */
  id: string;
  label: string;
  /** Lowercase. Matched as substrings against a lowercased query. */
  keywords: string[];
  /** Defaults to "body" -- most panels are rendered by the shared page. */
  source?: PanelSource;
}

/**
 * Declaration order is render order AND rail order, and Danger Zone is last on
 * purpose: it is the one section whose controls are irreversible, and putting
 * anything below it invites a person scrolling to Devices to pass through it
 * twice. Devices sits directly above it.
 */
export const PANELS: PanelDef[] = [
  {
    id: "panel-personality",
    label: "Personality",
    keywords: ["personality", "persona", "base", "warm honest", "tsundere", "minimal", "traits", "voice"],
  },
  {
    id: "panel-backup",
    label: "Backup & Restore",
    keywords: ["backup", "back up", "restore", "recovery phrase", "encrypted", "cloud"],
  },
  {
    id: "panel-enrollment",
    label: "Who She Recognises",
    keywords: ["enrollment", "enrol", "recognise", "recognize", "voice profile", "face", "who she knows"],
  },
  {
    id: "panel-transports",
    label: "Transports",
    keywords: [
      "transport", "transports", "tunnel", "tunnels", "tailnet", "funnel",
      "tailscale", "raise", "ceiling", "url",
    ],
    source: "extra-transports",
  },
  {
    id: "panel-devices",
    label: "Devices & Pairing",
    keywords: ["device", "devices", "pair", "pairing", "phone", "qr", "revoke", "code"],
    source: "extra",
  },
  {
    id: "panel-danger",
    label: "Danger Zone",
    keywords: ["danger", "reset", "forget", "wipe", "erase", "defaults"],
  },
];

/**
 * The panels this render actually has content for.
 *
 * `hasExtra`/`hasTransports` are the route saying whether it supplied the
 * `extra`/`extra-transports` slots. Demo supplies neither, so `panel-devices`
 * and `panel-transports` are filtered out of its rail and its search results
 * alike -- the demo route's rendering is byte-for-byte what it was before
 * either entry existed. Two booleans rather than a set of ids: exactly two
 * live-only slots exist today, and both are route-wide (a route supplies a
 * slot or it does not, never a specific panel by name).
 */
export function visiblePanels(hasExtra: boolean, hasTransports = false): PanelDef[] {
  return PANELS.filter((p) => {
    const source = p.source ?? "body";
    if (source === "body") return true;
    if (source === "extra-transports") return hasTransports;
    return hasExtra;
  });
}

/** Panels whose label or keywords contain the query. Empty query matches all. */
export function matchPanels(query: string, hasExtra = false, hasTransports = false): PanelDef[] {
  const available = visiblePanels(hasExtra, hasTransports);
  const q = query.trim().toLowerCase();
  if (!q) return available;
  return available.filter(
    (p) => p.label.toLowerCase().includes(q) || p.keywords.some((k) => k.includes(q)),
  );
}
