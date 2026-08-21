/**
 * What a person reads while deciding what a phone may do.
 *
 * Milestone 6a's pair dialog and device list are the one place in Studio
 * where a human ticks capabilities by hand -- everywhere else `useCanUse()`
 * just gates a control that already exists. Getting the label wrong here
 * doesn't grey out a button, it hands a phone a permission the person did
 * not mean to grant. So these are not the enum names prettified:
 *
 * - `recall` is not "read chat". It is her transcripts AND the whole
 *   knowledge graph -- everything she has ever learned, not one thread.
 * - `chat_send` is not "send messages". A chat turn is routed through
 *   intent classification like anything typed at her directly, so it can
 *   reach `code_executor` and every other intent, not just talk.
 *
 * `label` is deliberately short -- it is what becomes each checkbox's
 * accessible name (see PairDeviceDialog.test.tsx: the name must contain
 * "chat send" / "system control" as consecutive words, which the enum's
 * underscore form does not give you for free). `reach` is the fuller
 * sentence a person can actually act on, rendered as body copy beside the
 * checkbox, and reused as `aria-describedby` so the accessible name itself
 * stays short.
 *
 * `execute` (Milestone 6b) gets the bluntest `reach` of the seven,
 * deliberately: it is the one capability that turns her reply into an
 * action on this machine rather than a description of one, and the checkbox
 * for it is off by default and visually separated in the dialog -- see
 * PairDeviceDialog's own comment.
 */
import type { Capability } from "@/types/session";

export interface CapabilityCopy {
  label: string;
  reach: string;
}

export const CAPABILITY_LABELS: Record<Capability, CapabilityCopy> = {
  observe: {
    label: "Observe",
    reach: "Her status, telemetry, and the live event stream -- what she's doing right now.",
  },
  recall: {
    label: "Recall",
    reach: "Her conversation transcripts AND the whole knowledge graph -- everything she's learned, not just chat history.",
  },
  chat_send: {
    label: "Chat send",
    reach: "Send her a message as if typed at her directly -- a turn reaches every intent, including running code.",
  },
  screen: {
    label: "Screen",
    reach: "See whatever is currently on her screen.",
  },
  files: {
    label: "Files",
    reach: "Browse and read files on her machine.",
  },
  system_control: {
    label: "System control",
    reach: "Administer her -- settings, devices, and backups. Needed to mint codes or manage devices at all.",
  },
  execute: {
    label: "Execute",
    reach: "Let what she says back become a subprocess, a keystroke, a click, or a scheduled job on this machine -- not just a reply.",
  },
};
