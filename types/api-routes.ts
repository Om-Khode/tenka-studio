/**
 * The daemon routes each of the six Studio pages needs, once the
 * repository seam (Batch 1-2 of the milestone 5b plan) wires them up.
 *
 * This is a manifest, not a client — nothing here talks to the network.
 * It exists so `api-routes.test.ts` can assert the committed
 * `openapi.json` still describes every route a page depends on, catching
 * a daemon contract change (a renamed path, a dropped operation) before
 * it silently breaks a page that has not been touched.
 *
 * Derivation: the Batch 2 task descriptions, one domain per `Http*Repo`,
 * cross-checked
 * against the components each page renders (settings page pulls in
 * PersonalityPanel/BackupPanel/EnrollmentPanel/DangerZone, so its routes
 * span personality, backup and enrollment, not just /v1/settings).
 *
 * `GET /v1/audit` is deliberately absent: none of the six pages have an
 * audit view. If one grows one, add it here.
 */

export interface PageRoute {
  readonly path: string;
  readonly methods: readonly string[];
}

export type PageName = "dashboard" | "chat" | "commands" | "files" | "memory" | "settings";

export const PAGE_ROUTES: Readonly<Record<PageName, readonly PageRoute[]>> = {
  dashboard: [
    { path: "/v1/status", methods: ["get"] },
    { path: "/v1/telemetry", methods: ["get"] },
  ],
  chat: [
    { path: "/v1/chat", methods: ["post"] },
    { path: "/v1/chat/conversations", methods: ["get"] },
    { path: "/v1/chat/conversations/{conversation_id}", methods: ["get"] },
    { path: "/v1/abort", methods: ["post"] },
  ],
  commands: [
    { path: "/v1/commands", methods: ["get"] },
    { path: "/v1/commands/{command_id}/run", methods: ["post"] },
  ],
  files: [
    { path: "/v1/files/roots", methods: ["get"] },
    { path: "/v1/files", methods: ["get", "delete"] },
    { path: "/v1/files/content", methods: ["get"] },
    { path: "/v1/files/rename", methods: ["post"] },
  ],
  memory: [
    { path: "/v1/memory/knowledge", methods: ["get"] },
    { path: "/v1/memory/preferences", methods: ["get"] },
    { path: "/v1/memory/procedures", methods: ["get"] },
    { path: "/v1/memory/{scope}/{item_id}", methods: ["delete"] },
    { path: "/v1/memory", methods: ["delete"] },
  ],
  // Settings' page tree also renders PersonalityPanel, BackupPanel and
  // EnrollmentPanel (components/settings/*), so its routes are not just
  // GET/PATCH /v1/settings. Milestone 6b adds the transports screen and the
  // raise control on the device list (TransportsPanel, RaiseDeviceDialog) --
  // both live-only, admin-gated the same way devices/pairing already is.
  settings: [
    { path: "/v1/settings", methods: ["get", "patch"] },
    { path: "/v1/personality", methods: ["get", "patch"] },
    { path: "/v1/personality/reset", methods: ["post"] },
    { path: "/v1/backup", methods: ["get"] },
    { path: "/v1/backup/run", methods: ["post"] },
    { path: "/v1/backup/restore", methods: ["post"] },
    { path: "/v1/enrollment", methods: ["get"] },
    { path: "/v1/enrollment/{kind}/{item_id}", methods: ["delete"] },
    { path: "/v1/transports", methods: ["get"] },
    { path: "/v1/transports/{name}", methods: ["post", "delete"] },
    { path: "/v1/devices/{device_id}/raise", methods: ["post", "delete"] },
  ],
};
