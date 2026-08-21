/**
 * The single shape every user-fired action resolves to, on both the Commands
 * and Files pages. Having one shape is what lets the two pages read as one
 * system without pretending to be one machine -- and in spec 5 it is what a
 * real API response maps onto.
 */
export interface ActionResult {
  ok: boolean;
  /** Short, imperative-past. Shown as the toast headline. */
  title: string;
  /** Optional second line. Keep it to one clause. */
  detail?: string;
  /** Present only when the action is reversible. Renders an Undo button. */
  undo?: () => void;
}

/**
 * Every pane that will eventually read from the network models its own load
 * state, even while the data is local. A store that resolves instantly teaches
 * its consumers that data is always present, and spec 5 would then have to add
 * loading and failure branches to every component that reads it.
 */
export type LoadStatus = "idle" | "loading" | "ready" | "error";
