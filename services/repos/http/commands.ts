import { apiGet, apiSend, ApiError } from "@/services/http";
import { COMMANDS, DAEMON_COMMAND_IDS } from "@/store/command-catalogue";
import type { ActionResult } from "@/types/action";
import type { CommandDef, CommandKind } from "@/types/command";
import type { components } from "@/types/api";
import type { CommandRun, CommandsRepo } from "../types";

type CommandDefWire = components["schemas"]["CommandDefPayload"];
type CommandsWire = components["schemas"]["CommandsPayload"];
type AuditWire = components["schemas"]["AuditPayload"];

/** `POST /v1/commands/{id}/run` and nothing else -- anchored so the listing
 * route cannot match. */
const RUN_PATH = /^\/v1\/commands\/([^/]+)\/run$/;
type CommandRunWire = components["schemas"]["CommandRunPayload"];

const CATALOGUE_BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

/**
 * The daemon's four ids (`lock_workstation`, `volume_up`, `volume_down`,
 * `screenshot`) share no spelling with the demo catalogue's six
 * (`lock-pc`, `volume-up`, ...) -- `DAEMON_COMMAND_IDS` in
 * store/command-catalogue.ts is the explicit reconciliation.
 *
 * What the catalogue may contribute is PRESENTATION ONLY: the icon, and the
 * step labels the demo grid animates. Everything that decides what happens when
 * the card is pressed comes off the wire.
 *
 * That split is the fix for a real hole. This used to spread the whole
 * catalogue row (`...catalogueDef`) over the wire fields, so `kind` -- the only
 * thing components/commands/live/LiveCommandGrid.tsx consults before raising a
 * confirmation -- was a client-side constant, while the daemon's own
 * `destructive` was stored and never read. The two agree today (the daemon
 * marks only `lock_workstation` destructive; `lock-pc` is the catalogue's only
 * "guarded" row), which is exactly what made it invisible: flip `screenshot` to
 * destructive server-side and the live card fired it with no confirmation at
 * all, because Studio had already decided. The daemon's declaration is the
 * authority on its own machine.
 *
 * `destructive` therefore always wins the kind: "guarded", overriding even an
 * "instant" catalogue row, because a volume key that became irreversible must
 * stop being a one-press affordance. A non-destructive command may still borrow
 * "instant" -- that kind is about not occupying the run slot, not about danger.
 *
 * The confirm copy comes off the wire too, for the same reason. The sentence a
 * user reads before locking their PC was Studio's own literal; it is now the
 * daemon's `description`, which is the only description of what that daemon
 * will actually do.
 *
 * `open-chrome` and `open-vscode` never appear here -- the daemon's catalogue is
 * OS capabilities only, and neither has a live counterpart by design. The
 * demo-only fields on those rows (`payload`, `costUsd`, `visionCalls`,
 * `instantEffect`) are deliberately NOT carried across either: a cost in
 * dollars and a vision-call count are scripted numbers, and the merge used to
 * hand them to every live command that happened to map.
 */
function mergeCommand(wire: CommandDefWire): CommandDef {
  const catalogueId = DAEMON_COMMAND_IDS[wire.commandId];
  const catalogueDef = catalogueId ? CATALOGUE_BY_ID.get(catalogueId) : undefined;

  const kind: CommandKind = wire.destructive
    ? "guarded"
    : catalogueDef?.kind === "instant"
      ? "instant"
      : "stepped";

  return {
    id: wire.commandId,
    label: wire.label,
    icon: catalogueDef?.icon ?? "Terminal",
    kind,
    steps: catalogueDef?.steps,
    description: wire.description,
    destructive: wire.destructive,
    requiredGrant: wire.requiredGrant,
    ...(wire.destructive
      ? {
          confirm: {
            title: `${wire.label}?`,
            body: wire.description,
            confirmLabel: "confirm",
          },
        }
      : {}),
  };
}

/**
 * Maps daemon JSON onto Studio's own types, once, at the edge -- see
 * services/repos/types.ts.
 */
export class HttpCommandRepo implements CommandsRepo {
  async list(): Promise<CommandDef[]> {
    const payload = await apiGet<CommandsWire>("/v1/commands");
    return payload.commands.map(mergeCommand);
  }

  /**
   * Never throws. `POST /v1/commands/{id}/run` refuses with 403 (capability
   * not granted), 404 (unknown id), 429 (the run-specific throttle) or 502
   * (the OS call itself failed) -- every one of those, and an unreachable
   * daemon, resolves to `ok: false` so the caller can push it straight onto
   * the shared toast queue instead of needing its own try/catch.
   */
  async run(id: string): Promise<ActionResult> {
    try {
      const result = await apiSend<CommandRunWire>(
        "POST",
        `/v1/commands/${encodeURIComponent(id)}/run`,
      );
      return { ok: true, title: result.message };
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, title: "Command refused", detail: err.code };
      }
      return { ok: false, title: "Could not reach her" };
    }
  }
  /**
   * Recent command runs, newest first, reconstructed from `GET /v1/audit`.
   *
   * The audit log is a record of HTTP requests, not of everything TENKA did,
   * so a command she ran by voice is genuinely absent here -- the interface
   * doc says so and the card that renders this says so on screen. Inventing a
   * fuller history from the data available is exactly the kind of confident
   * fiction this milestone kept finding.
   *
   * Entries are matched on the run route's own shape rather than a substring,
   * so `/v1/commands` (the listing) can never be mistaken for a run.
   */
  async recentRuns(limit: number): Promise<CommandRun[]> {
    const wire = await apiGet<AuditWire>("/v1/audit");
    const runs: CommandRun[] = [];

    for (const entry of wire.entries) {
      if (entry.method.toUpperCase() !== "POST") continue;
      const match = RUN_PATH.exec(entry.path);
      if (!match) continue;
      runs.push({
        id: decodeURIComponent(match[1]),
        at: entry.at,
        outcome: entry.outcome,
      });
    }

    // Newest first. The daemon's own ordering is not part of the contract, so
    // this sorts rather than trusting it -- and `at` is an ISO string, which
    // sorts correctly as text only while the offsets match, so it is parsed.
    runs.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return runs.slice(0, limit);
  }
}
