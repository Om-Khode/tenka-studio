/**
 * The display formatters shared across panes (milestone 5b, Task 12).
 *
 * Every one of these was defined per-component before this sweep -- `DATE_FMT`
 * in five files byte-for-byte identically, and two *different* byte formatters
 * that disagreed about what a large or empty number looks like. Five copies of
 * a constant drift the moment one of them is edited, and two formatters for
 * one quantity is not duplication, it is two answers.
 */

const UNITS = ["B", "KB", "MB", "GB"] as const;

/**
 * Scales through units rather than pinning one.
 *
 * `<= 0` is an em dash, not "0 B": every caller's zero means "there is no size
 * to report" -- a directory (which always reports 0 bytes) or a backup that
 * has never run -- and printing a measurement for something unmeasured is the
 * confident-wrong-fact failure this codebase avoids everywhere else (see
 * EnrollmentPanel's `countLabel`, LiveSystemMetersCard's battery).
 *
 * Task 12 collapsed components/settings/BackupPanel.tsx's `mb()` into this,
 * which is a DECISION, not a dedup: `mb()` always rendered MB with one
 * decimal, so a 2 GB backup read "2048.0 MB" and a never-run one "0.0 MB".
 * Backups only grow, and the unit ladder is what stops the number from
 * becoming unreadable as they do. The demo's own 41 MB figure is unchanged --
 * both formatters print "39.1 MB" for it -- so only the two honest cases move.
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value} ${UNITS[unit]}` : `${value.toFixed(1)} ${UNITS[unit]}`;
}

/** Fixed locale and UTC: a date that shifts with the viewer's zone breaks tests. */
const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

/**
 * Takes what the callers actually hold: a `Date` from a file listing, or the
 * ISO string every daemon payload carries. Wrapping the `new Date(...)` here
 * is the whole reason five call sites could each own a copy of the formatter
 * and nobody noticed.
 */
export function formatDate(value: Date | string | number): string {
  return DATE_FMT.format(value instanceof Date ? value : new Date(value));
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/**
 * Coarse relative age, for labelling a reading that has stopped arriving
 * ("last seen 2m ago"). Deliberately one unit and no decimals: this exists to
 * answer "is this still true?", and "2m" answers it while "2 minutes and 14
 * seconds" invites the reader to trust a precision the number does not have.
 */
export function formatAgo(ms: number): string {
  if (ms < MINUTE_MS) return `${Math.max(0, Math.floor(ms / 1000))}s`;
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)}m`;
  return `${Math.floor(ms / HOUR_MS)}h`;
}
