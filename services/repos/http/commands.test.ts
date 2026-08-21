import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase } from "@/services/http";
import { HttpCommandRepo } from "./commands";
import { COMMANDS } from "@/store/command-catalogue";

const BASE = apiBase();
const envelope = <T>(data: T) => ({
  data,
  meta: { requestId: "r1", generatedAt: "2026-08-09T00:00:00Z" },
});

describe("HttpCommandRepo.list", () => {
  it("borrows only presentation from the catalogue row -- identity, label and behaviour come off the wire", async () => {
    server.use(
      http.get(`${BASE}/v1/commands`, () =>
        HttpResponse.json(
          envelope({
            commands: [
              {
                commandId: "lock_workstation",
                label: "Lock the workstation",
                description: "Locks the desktop session.",
                destructive: true,
                requiredGrant: "system_control",
              },
            ],
          }),
        ),
      ),
    );

    const repo = new HttpCommandRepo();
    const [command] = await repo.list();
    const catalogueRow = COMMANDS.find((c) => c.id === "lock-pc")!;

    // Identity comes from the daemon -- run() must post the id it recognises.
    expect(command.id).toBe("lock_workstation");
    // Presentation, and only presentation, comes from the catalogue.
    expect(command.icon).toBe(catalogueRow.icon);
    expect(command.steps).toEqual(catalogueRow.steps);
    // ... but the label the user reads is the daemon's own.
    expect(command.label).toBe("Lock the workstation");
    // The three daemon-only fields ride along too.
    expect(command.destructive).toBe(true);
    expect(command.requiredGrant).toBe("system_control");
    expect(command.description).toBe("Locks the desktop session.");
    // Guarded because the DAEMON said destructive, not because the catalogue
    // row happens to say "guarded" -- and the confirm sentence is the daemon's
    // description of what its own machine will do, not Studio's literal.
    expect(command.kind).toBe("guarded");
    expect(command.confirm).toEqual({
      title: "Lock the workstation?",
      body: "Locks the desktop session.",
      confirmLabel: "confirm",
    });
    expect(command.confirm).not.toEqual(catalogueRow.confirm);
  });

  /**
   * PROOF-OF-FAILURE for the confirmation gate. `...catalogueDef` used to
   * supply `kind`, and LiveCommandGrid raises its confirm dialog on `kind ===
   * "guarded"` alone -- so a daemon that started declaring screenshots
   * destructive was overruled by a client-side constant, and the card fired
   * with no confirmation. The two agree today, which is precisely why nothing
   * caught it.
   */
  it("follows the daemon when it declares a mapped command destructive, even though the catalogue row does not", async () => {
    server.use(
      http.get(`${BASE}/v1/commands`, () =>
        HttpResponse.json(
          envelope({
            commands: [
              {
                commandId: "screenshot",
                label: "Take Screenshot",
                description: "Captures the current screen and writes it to disk.",
                destructive: true,
                requiredGrant: "screen",
              },
            ],
          }),
        ),
      ),
    );

    const repo = new HttpCommandRepo();
    const [command] = await repo.list();

    expect(COMMANDS.find((c) => c.id === "take-screenshot")!.kind).toBe("stepped");
    expect(command.kind).toBe("guarded");
    expect(command.confirm?.body).toBe("Captures the current screen and writes it to disk.");
  });

  it("keeps an instant catalogue row instant while the daemon calls it harmless, and guards it the moment it does not", async () => {
    const volume = (destructive: boolean) =>
      http.get(`${BASE}/v1/commands`, () =>
        HttpResponse.json(
          envelope({
            commands: [
              {
                commandId: "volume_up",
                label: "Volume Up",
                description: "Raises the system volume.",
                destructive,
                requiredGrant: "system_control",
              },
            ],
          }),
        ),
      );

    // "instant" is about not occupying the run slot, not about danger, so it
    // survives the merge on a non-destructive command...
    server.use(volume(false));
    expect((await new HttpCommandRepo().list())[0].kind).toBe("instant");

    // ... and loses to `destructive` the moment the daemon raises it, because
    // an irreversible action must stop being a one-press affordance.
    server.use(volume(true));
    expect((await new HttpCommandRepo().list())[0].kind).toBe("guarded");
  });

  it("never carries the catalogue's scripted cost and vision-call figures onto a live command", async () => {
    server.use(
      http.get(`${BASE}/v1/commands`, () =>
        HttpResponse.json(
          envelope({
            commands: [
              {
                commandId: "lock_workstation",
                label: "Lock PC",
                description: "Locks the desktop session.",
                destructive: true,
                requiredGrant: "system_control",
              },
            ],
          }),
        ),
      ),
    );

    const [command] = await new HttpCommandRepo().list();

    // Demo-only fields: a dollar cost and a vision-call count are scripted
    // numbers, and `payload` is a demo POST body the live route has no use for
    // (`POST /v1/commands/{id}/run` takes no body at all).
    expect(command.costUsd).toBeUndefined();
    expect(command.visionCalls).toBeUndefined();
    expect(command.payload).toBeUndefined();
    expect(command.instantEffect).toBeUndefined();
  });

  it("renders a daemon command with no catalogue row as guarded, when it is destructive -- never bare", async () => {
    server.use(
      http.get(`${BASE}/v1/commands`, () =>
        HttpResponse.json(
          envelope({
            commands: [
              {
                commandId: "restart_daemon",
                label: "Restart",
                description: "Restarts the background service.",
                destructive: true,
                requiredGrant: "system_control",
              },
            ],
          }),
        ),
      ),
    );

    const repo = new HttpCommandRepo();
    const [command] = await repo.list();

    expect(command.id).toBe("restart_daemon");
    expect(command.kind).toBe("guarded");
    expect(command.confirm?.body).toBe("Restarts the background service.");
    expect(command.destructive).toBe(true);
    expect(command.requiredGrant).toBe("system_control");
  });

  it("renders a daemon command with no catalogue row and no confirm, when it is not destructive", async () => {
    server.use(
      http.get(`${BASE}/v1/commands`, () =>
        HttpResponse.json(
          envelope({
            commands: [
              {
                commandId: "list_windows",
                label: "List open windows",
                description: "Enumerates visible windows.",
                destructive: false,
                // `screen`, not the `chat` this fixture used to declare.
                // 6a split `chat` into `observe` (reads) and `recall`
                // (transcripts, graph), and the daemon's catalogue guard now
                // rejects a command declaring ANY read-only grant -- a command
                // is an action, so its gate has to be one of the write
                // capabilities. `list_windows` reads the desktop; that is
                // `screen`.
                requiredGrant: "screen",
              },
            ],
          }),
        ),
      ),
    );

    const repo = new HttpCommandRepo();
    const [command] = await repo.list();

    expect(command.kind).not.toBe("guarded");
    expect(command.confirm).toBeUndefined();
  });

  it("never surfaces open-chrome or open-vscode -- the daemon's catalogue has no such ids to return", async () => {
    server.use(
      http.get(`${BASE}/v1/commands`, () =>
        HttpResponse.json(
          envelope({
            commands: [
              {
                commandId: "screenshot",
                label: "Take Screenshot",
                description: "Captures the current screen.",
                destructive: false,
                requiredGrant: "screen",
              },
            ],
          }),
        ),
      ),
    );

    const repo = new HttpCommandRepo();
    const commands = await repo.list();
    expect(commands.map((c) => c.id)).not.toContain("open-chrome");
    expect(commands.map((c) => c.id)).not.toContain("open-vscode");
    expect(commands).toHaveLength(1);
  });

  it("rejects rather than resolving an empty catalogue when the daemon errors", async () => {
    server.use(http.get(`${BASE}/v1/commands`, () => HttpResponse.json({ detail: "busy" }, { status: 409 })));
    const repo = new HttpCommandRepo();
    await expect(repo.list()).rejects.toMatchObject({ status: 409 });
  });
});

describe("HttpCommandRepo.run", () => {
  it("resolves ok: true with the daemon's own confirmation message", async () => {
    server.use(
      http.post(`${BASE}/v1/commands/volume_up/run`, () =>
        HttpResponse.json(envelope({ commandId: "volume_up", message: "volume changed" })),
      ),
    );
    const repo = new HttpCommandRepo();
    const result = await repo.run("volume_up");
    expect(result).toEqual({ ok: true, title: "volume changed" });
  });

  it("resolves ok: false on a 403 refusal -- never throws", async () => {
    server.use(
      http.post(`${BASE}/v1/commands/lock_workstation/run`, () =>
        HttpResponse.json({ detail: "capability not granted" }, { status: 403 }),
      ),
    );
    const repo = new HttpCommandRepo();
    const result = await repo.run("lock_workstation");
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("capability not granted");
  });

  it("resolves ok: false when the daemon is unreachable -- never throws", async () => {
    server.use(http.post(`${BASE}/v1/commands/screenshot/run`, () => HttpResponse.error()));
    const repo = new HttpCommandRepo();
    const result = await repo.run("screenshot");
    expect(result.ok).toBe(false);
  });
});
