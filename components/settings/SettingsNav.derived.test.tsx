import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { SettingsNav } from "./SettingsNav";
import { useSettingsStore } from "@/store/settings-store";
import type { SettingDef } from "@/types/settings";

const FAKE_DEFS: SettingDef[] = [
  { key: "a", group: "Alpha", label: "a", description: "d", kind: "toggle", default: false, needsRestart: false, source: "default" },
  { key: "b", group: "Beta", label: "b", description: "d", kind: "toggle", default: false, needsRestart: false, source: "default" },
];

describe("SettingsNav (derived groups)", () => {
  beforeEach(() => useSettingsStore.setState(useSettingsStore.getInitialState()));

  // A nav that hardcoded today's group names would still render them here,
  // diverging from `state.defs`; a nav that truly derives from the loaded
  // defs follows it -- exactly what load() replacing `defs` wholesale
  // (milestone 5b, Task 5) requires: a live load can add or drop a group
  // the static registry never named, and the nav must track that, not a
  // module-level constant frozen at import time.
  it("follows the currently-loaded defs' groups rather than a fixed list", () => {
    useSettingsStore.setState({ defs: FAKE_DEFS });
    render(<SettingsNav />);
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wake Word" })).not.toBeInTheDocument();
  });
});
