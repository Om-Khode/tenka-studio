import { describe, it, expect } from "vitest";
import { PANELS, matchPanels, visiblePanels } from "./panels";

describe("panels", () => {
  it("has an entry for the devices section", () => {
    // Fault 3: there was none, so nothing in the settings rail ever pointed at
    // the live pairing section.
    expect(PANELS.map((p) => p.id)).toContain("panel-devices");
  });

  it("puts Danger Zone last, with Devices directly above it", () => {
    const ids = PANELS.map((p) => p.id);
    expect(ids.at(-1)).toBe("panel-danger");
    expect(ids.at(-2)).toBe("panel-devices");
  });

  it("hides the devices entry from a route that supplies no devices section", () => {
    // Demo has no device vault. An entry in its rail would scroll to nothing,
    // which is a worse bug than the missing entry it would be fixing.
    expect(visiblePanels(false).map((p) => p.id)).not.toContain("panel-devices");
    expect(visiblePanels(true).map((p) => p.id)).toContain("panel-devices");
  });

  it("leaves the four body panels identical whether or not extra is supplied", () => {
    expect(visiblePanels(false).map((p) => p.id)).toEqual([
      "panel-personality",
      "panel-backup",
      "panel-enrollment",
      "panel-danger",
    ]);
  });

  it("answers a search for pairing only where the section exists", () => {
    expect(matchPanels("pairing", true).map((p) => p.id)).toEqual(["panel-devices"]);
    expect(matchPanels("pairing", false)).toEqual([]);
  });

  it("matches the existing panels exactly as before", () => {
    expect(matchPanels("backup").map((p) => p.id)).toEqual(["panel-backup"]);
    expect(matchPanels("recovery phrase").map((p) => p.id)).toEqual(["panel-backup"]);
    expect(matchPanels("zzzznothing")).toEqual([]);
  });

  it("does not let a devices keyword drag another panel in, or vice versa", () => {
    expect(matchPanels("danger", true).map((p) => p.id)).toEqual(["panel-danger"]);
    expect(matchPanels("device", true).map((p) => p.id)).toEqual(["panel-devices"]);
  });

  // Milestone 6b: a second, independent live-only slot.
  it("has an entry for the transports section, directly above devices", () => {
    const ids = PANELS.map((p) => p.id);
    expect(ids).toContain("panel-transports");
    expect(ids.indexOf("panel-transports")).toBe(ids.indexOf("panel-devices") - 1);
  });

  it("hides transports independently of devices -- a route can supply either, both, or neither", () => {
    expect(visiblePanels(false, false).map((p) => p.id)).not.toContain("panel-transports");
    expect(visiblePanels(true, false).map((p) => p.id)).not.toContain("panel-transports");
    expect(visiblePanels(false, true).map((p) => p.id)).toEqual(
      expect.arrayContaining(["panel-transports"]),
    );
    expect(visiblePanels(false, true).map((p) => p.id)).not.toContain("panel-devices");
    expect(visiblePanels(true, true).map((p) => p.id)).toEqual(
      expect.arrayContaining(["panel-transports", "panel-devices"]),
    );
  });

  it("answers a search for tailnet only where the transports section exists", () => {
    expect(matchPanels("tailnet", false, true).map((p) => p.id)).toEqual(["panel-transports"]);
    expect(matchPanels("tailnet", false, false)).toEqual([]);
  });
});
