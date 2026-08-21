import type { SettingDef } from "@/types/settings";

/**
 * Mirrors the assistant's runtime_config REGISTRY: 39 settings, descriptions
 * copied from its config so the demo reads as the real system rather than as
 * placeholder copy. No JSX -- spec 5 may receive this over the wire.
 *
 * `source` records the real precedence chain (DB -> env -> default). An
 * env-owned row is not user-editable in the assistant, so it must not look
 * editable here.
 *
 * `personality` is deliberately NOT here (milestone 5b, Task 5). It used to
 * be a `select`-kind row read/written through this same registry/store, but
 * `runtime_config.REGISTRY` on the daemon side never carried it -- it lives
 * behind its own `GET/PATCH /v1/personality` + `POST /v1/personality/reset`
 * routes -- the GET on `observe`, both writes on `system_control`, same as
 * the settings routes beside them in `routes/settings.py` -- with its own
 * PersonalityRepo. A `select` setting cannot occur live at all (the daemon
 * has no enum cast to populate `options` with), so the one component that
 * rendered personality was wired to the one control kind guaranteed not to
 * work once real data arrived. See store/personality-store.ts and
 * components/settings/PersonalityPanel.tsx.
 */
export const SETTINGS_REGISTRY: SettingDef[] = [
  {
    key: "assistant_name", group: "Assistant Identity", label: "assistant name",
    kind: "text", default: "TENKA", needsRestart: true, source: "default",
    description:
      "The assistant's display / wake / persona name. Used in prompts, shortcut matching, and wake word model path. Note: renaming does NOT wipe conversation memory, so the persona may take a few turns to fully 'settle in' with the new name.",
  },

  {
    key: "listen_to_everyone", group: "Voice I/O", label: "listen to everyone",
    kind: "toggle", default: false, needsRestart: false, source: "default",
    description:
      "If true, speaker verification is disabled — anyone can issue commands. Also toggled by the 'listen to everyone' voice phrase.",
  },
  {
    key: "followup_timer", group: "Voice I/O", label: "follow-up window",
    kind: "number", default: 5, min: 1, max: 30, step: 0.5,
    needsRestart: false, source: "default",
    description: "Seconds she listens for a follow-up utterance after TTS finishes.",
  },
  {
    key: "tts_speed", group: "Voice I/O", label: "speech rate",
    kind: "slider", default: 1, min: 0.5, max: 2, step: 0.05,
    needsRestart: false, source: "db",
    description:
      "TTS speech rate multiplier (0.5–2.0). Lower = slower & clearer, higher = faster.",
  },
  {
    key: "vocal_voice_enabled", group: "Voice I/O", label: "vocal post-processing",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description:
      "Vocal voice post-processing (pitch shift, EQ, tremolo). Off = plain Kokoro voice.",
  },
  {
    key: "vocal_casual_language", group: "Voice I/O", label: "casual language",
    kind: "toggle", default: false, needsRestart: true, source: "env",
    description:
      "Let her use mild curses (damn, crap, dumbass...). Persona flavor, not hostility.",
  },
  {
    key: "wake_word_sensitivity", group: "Wake Word", label: "sensitivity",
    kind: "slider", default: 0.02, min: 0, max: 1, step: 0.01,
    needsRestart: false, source: "db",
    description: "openWakeWord detection threshold (0.0–1.0). Lower = more sensitive.",
  },
  {
    key: "wake_word_cooldown", group: "Wake Word", label: "cooldown",
    kind: "number", default: 2, min: 0, max: 30, step: 0.5,
    needsRestart: false, source: "default",
    description:
      "Seconds to ignore the wake word after it fires. Raise if rapid re-triggers happen.",
  },
  {
    key: "wake_word_enabled", group: "Wake Word", label: "wake word",
    kind: "toggle", default: true, needsRestart: true, source: "default",
    description: "Master switch for wake word detection. Off = push-to-talk only.",
  },

  {
    key: "speaker_verify_enabled", group: "Speaker Verification", label: "speaker verification",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description: "Master switch for speaker verification. Off = any speaker is trusted.",
  },
  {
    key: "speaker_verify_threshold", group: "Speaker Verification", label: "match threshold",
    kind: "slider", default: 0.5, min: 0, max: 1, step: 0.01,
    needsRestart: false, source: "default",
    description:
      "SV cosine similarity threshold (0.0–1.0). Lower if it rejects you often, higher if impostors slip through.",
  },

  {
    key: "camera_enabled", group: "Camera / Face", label: "camera",
    kind: "toggle", default: true, needsRestart: true, source: "default",
    description: "Camera + face recognition. Off saves CPU and improves privacy.",
  },
  {
    key: "face_recognition_tolerance", group: "Camera / Face", label: "face match tolerance",
    kind: "slider", default: 0.5, min: 0.4, max: 0.6, step: 0.01,
    needsRestart: false, source: "default",
    description: "Face match strictness (0.4 strict – 0.6 loose). Lower = fewer false positives.",
  },

  {
    key: "proactive_enabled", group: "Proactive Nudges", label: "proactive nudges",
    kind: "toggle", default: true, needsRestart: true, source: "default",
    description: "Master switch for unprompted nudges / reflection.",
  },
  {
    key: "proactive_mode", group: "Proactive Nudges", label: "nudge mode",
    kind: "select", default: "always", needsRestart: false, source: "default",
    options: [
      { value: "always", label: "always" },
      { value: "idle_only", label: "idle only" },
    ],
    description:
      "'always' fires immediately when ready; 'idle_only' waits until she is idle.",
  },
  {
    key: "proactive_interval_minutes", group: "Proactive Nudges", label: "analyzer interval",
    kind: "number", default: 30, min: 5, max: 240, step: 5,
    needsRestart: true, source: "default",
    description: "How often the nudge analyzer re-checks (minutes).",
  },
  {
    key: "proactive_idle_threshold_minutes", group: "Proactive Nudges", label: "idle threshold",
    kind: "number", default: 10, min: 1, max: 120, step: 1,
    needsRestart: false, source: "default",
    description: "Minutes of silence before an idle nudge fires.",
  },

  {
    key: "verify_enabled", group: "Verification Layer", label: "step verification",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description:
      "Master switch for step verification. Off = skip all pre-checks and post-verifies — fastest, but silent failures possible.",
  },
  {
    key: "verify_browser_steps", group: "Verification Layer", label: "verify browser steps",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description: "Verify browser (Playwright) steps. Off only if you're profiling latency.",
  },
  {
    key: "verify_app_steps", group: "Verification Layer", label: "verify app steps",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description: "Verify native app (Terminator) steps. Off only if you're profiling latency.",
  },
  {
    key: "verify_vision_fallback", group: "Verification Layer", label: "vision fallback",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description:
      "When code-tier verification is ambiguous (e.g. click outcomes), escalate to a Gemini Flash vision call. Off = treat ambiguous as ok.",
  },
  {
    key: "verify_strict_text_match", group: "Verification Layer", label: "strict text match",
    kind: "toggle", default: false, needsRestart: false, source: "default",
    description:
      "True = exact text match on field readback (catches autocomplete drift but causes false fails on phone/email auto-formatting). False = case-insensitive contains.",
  },
  {
    key: "verify_min_confidence", group: "Verification Layer", label: "minimum confidence",
    kind: "slider", default: 0.5, min: 0, max: 1, step: 0.05,
    needsRestart: false, source: "default",
    description:
      "Vision-tier confidence threshold to count as a real failure. Lower = more retries, higher = more silent passes.",
  },
  {
    key: "verify_max_retries", group: "Verification Layer", label: "self-heal attempts",
    kind: "number", default: 1, min: 0, max: 1, step: 1,
    needsRestart: false, source: "default",
    description:
      "How many self-heal attempts after a verify_failed (per step). Hard-capped at 1 in policy — endless retry is the antipattern that bricks demos.",
  },

  {
    key: "dropdown_commit_guard_enabled", group: "Plan-and-Execute Hardening",
    label: "dropdown commit guard",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description:
      "Auto-inject keyboard_press(enter) when an action batch navigates a dropdown via arrow keys without a commit action. Off = trust the planner's batch as-is (will regress on Down×N selections).",
  },
  {
    key: "deterministic_matching_enabled", group: "Plan-and-Execute Hardening",
    label: "deterministic matching",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description:
      "Action-signature TODO marking with vision-confirm for select TODOs. Off = revert to text-only LLM updater (will regress on dropdown completion hallucinations).",
  },
  {
    key: "dynamic_budget_enabled", group: "Plan-and-Execute Hardening", label: "dynamic loop budget",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description:
      "Dynamic loop budget sized from TODO count + dropdowns (capped at 15) plus stuck-step detector (3 zero-progress batches → abort). Off = MAX_LOOPS=8 fixed, no stuck detection.",
  },

  {
    key: "dialog_engagement_gate_enabled", group: "Dialog-Engagement Gate",
    label: "dialog engagement gate",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description:
      "Dialog-engagement gate: refuse to dismiss overlays when recent agent actions show successful engagement with the modal surface. Off = pre-fix behaviour (dismisses regardless of engagement; can close form-modals the agent is filling).",
  },

  {
    key: "browser_prefer_cdp", group: "Browser CDP", label: "attach to running Chrome",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description:
      "When True (default), she tries to attach to a running Chrome with --remote-debugging-port=9222 before launching her own bundled Chromium. Off = always use bundled.",
  },
  {
    key: "browser_cdp_port", group: "Browser CDP", label: "CDP port",
    kind: "number", default: 9222, min: 1024, max: 65535, step: 1,
    needsRestart: false, source: "default",
    description:
      "Port to probe for Chrome's CDP endpoint. Default 9222 is the Chrome convention. Change only if you launch Chrome with a non-default --remote-debugging-port.",
  },
  {
    key: "browser_cdp_probe_ttl", group: "Browser CDP", label: "probe cache TTL",
    kind: "number", default: 30, min: 5, max: 300, step: 5,
    needsRestart: false, source: "default",
    description:
      "How long (seconds) the CDP availability probe result is cached. Lower = more probes (slight latency); higher = stale state risks (e.g. user closed Chrome mid-session). 30s is the sweet spot.",
  },

  {
    key: "browser_dom_tree_token_budget", group: "Browser DOM", label: "element tree budget",
    kind: "number", default: 4000, min: 500, max: 16000, step: 500,
    needsRestart: false, source: "default",
    description:
      "Max tokens the perceived element tree may consume in the DOM planner prompt. When exceeded, the perceiver drops bounds → drops placeholders → prunes off-viewport elements. Budget keeps the planner call cheap and fast.",
  },
  {
    key: "browser_dom_cache_ttl", group: "Browser DOM", label: "tree cache TTL",
    kind: "number", default: 10, min: 1, max: 120, step: 1,
    needsRestart: false, source: "default",
    description:
      "Tree-cache TTL in seconds. Pages with periodic mutations (timers, polling) shouldn't rely on a stale tree. 10s balances reuse against staleness. Manual invalidation happens on click/press/navigation regardless.",
  },

  {
    key: "browser_dom_mode_enabled", group: "Browser Routing", label: "DOM-aware planner",
    kind: "toggle", default: true, needsRestart: false, source: "default",
    description:
      "Master switch for the DOM-aware planner path. When False, browser-content goals always route to the legacy vision-loop fallback regardless of CDP availability. Useful kill-switch if DOM-mode regresses against a specific site.",
  },

  {
    key: "messaging_notify_debounce", group: "Messaging", label: "notify debounce",
    kind: "number", default: 5, min: 0, max: 60, step: 1,
    needsRestart: false, source: "default",
    description: "Wait window (seconds) before announcing a new message. Use 20–30 in real life.",
  },
  {
    key: "messaging_suppress_window", group: "Messaging", label: "suppress window",
    kind: "number", default: 300, min: 0, max: 3600, step: 30,
    needsRestart: false, source: "default",
    description:
      "After reading messages, stay silent for this long (seconds) on new ones from the same chat.",
  },
  {
    key: "incoming_read_threshold", group: "Messaging", label: "read vs summarize",
    kind: "number", default: 3, min: 1, max: 20, step: 1,
    needsRestart: false, source: "default",
    description: "≤N messages → read verbatim; more → LLM-summarize.",
  },

  {
    key: "unity_enabled", group: "Avatar Bridge", label: "avatar frontend",
    kind: "toggle", default: true, needsRestart: true, source: "default",
    description:
      "Enable the Unity avatar frontend and TCP bridge. Off = terminal-only: TTS/STT/wake word still work, avatar commands are no-ops.",
  },

  {
    key: "push_to_talk_key", group: "Keyboard Trigger", label: "push-to-talk key",
    kind: "text", default: "v", needsRestart: true, source: "default",
    description: "Key to start/stop recording (single char or 'home', 'end', 'f1', etc.)",
  },
];

/** Registry order, de-duplicated. Never hardcode this list in a component. */
export const SETTING_GROUPS: string[] = [...new Set(SETTINGS_REGISTRY.map((s) => s.group))];

export function findSetting(key: string): SettingDef | undefined {
  return SETTINGS_REGISTRY.find((s) => s.key === key);
}
