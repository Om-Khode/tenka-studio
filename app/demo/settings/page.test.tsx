import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import SettingsPage from "./page";
import { useSettingsStore } from "@/store/settings-store";
import { useMemoryStore } from "@/store/memory-store";
import { usePersonalityStore } from "@/store/personality-store";
import { seedMemory } from "@/store/memory-scripts";
import { SETTING_GROUPS } from "@/store/settings-registry";

function ready() {
  useSettingsStore.setState({ ...useSettingsStore.getInitialState(), status: "ready" });
  // PersonalityPanel is its own repository-backed panel now (milestone 5b,
  // Task 5) -- seeded straight to "ready" so tests asserting on its
  // combobox don't need to wait out its own load().
  usePersonalityStore.setState({
    ...usePersonalityStore.getInitialState(),
    status: "ready",
    payload: {
      base: "warm_honest",
      available: ["warm_honest", "tsundere", "minimal"],
      traits: { warmth: 72, curiosity: 60, directness: 65, playfulness: 45, discipline: 55, patience: 70 },
      sampleLine: "That will break on the second run — want me to fix it now, or note it and move on?",
    },
  });
}

// Stub ResizeObserver for Radix Slider, which uses it to measure track width.
// A "ready" status renders the full ~40-row registry, including sliders --
// see components/settings/controls/SliderControl.test.tsx for the same note.
// Scoped to this file only, per that file's own caveat about global scope.
class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("Settings page", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState(useSettingsStore.getInitialState());
    usePersonalityStore.setState(usePersonalityStore.getInitialState());
    // DangerZone renders on this page and reads this store -- seed it so a
    // forget-all click has real data to act on, mirroring DangerZone.test.tsx.
    useMemoryStore.setState({
      ...useMemoryStore.getInitialState(),
      ...seedMemory(),
      status: "ready",
    });
  });

  it("shows a skeleton while loading", () => {
    useSettingsStore.setState({ status: "loading" });
    render(<SettingsPage />);
    expect(screen.getByLabelText("Loading settings")).toBeInTheDocument();
  });

  // Mirrors components/memory/EntityList.test.tsx's equivalent case: before
  // this fix, an "error" status fell through to the same branch as "loading"
  // and rendered the skeleton forever, with no retry.
  it("offers a retry when the load failed, instead of an infinite skeleton", () => {
    useSettingsStore.setState({ status: "error" });
    render(<SettingsPage />);
    expect(screen.queryByLabelText("Loading settings")).not.toBeInTheDocument();
    expect(screen.getByText(/could not reach her settings/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("retrying from the error branch actually reaches ready", async () => {
    vi.useFakeTimers();
    useSettingsStore.setState({ status: "error" });
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await vi.runAllTimersAsync();

    expect(useSettingsStore.getState().status).toBe("ready");
    vi.useRealTimers();
  });

  it("renders the group rail from the registry, not a hardcoded list", () => {
    ready();
    render(<SettingsPage />);
    for (const group of SETTING_GROUPS) {
      expect(screen.getByRole("button", { name: group })).toBeInTheDocument();
    }
  });

  /**
   * `state.defs` is seeded to the static registry and load()'s catch
   * deliberately leaves it there, so the rail listed all 39 groups
   * confidently while the right-hand column said "She could not reach her
   * settings." -- the status branch wraps only that column, so the <aside>
   * sat outside it. SettingsNav's own doc promises the groups come from what
   * actually loaded; this makes the page keep that promise.
   */
  it("does not list her groups beside a message saying it could not reach them", () => {
    useSettingsStore.setState({ status: "error" });
    render(<SettingsPage />);
    expect(screen.getByText(/could not reach her settings/i)).toBeInTheDocument();
    for (const group of SETTING_GROUPS) {
      expect(screen.queryByRole("button", { name: group })).not.toBeInTheDocument();
    }
    // Nor a search box over a list that never arrived.
    expect(screen.queryByLabelText("Search settings")).not.toBeInTheDocument();
  });

  it("does not list them while the load is still in flight either", () => {
    useSettingsStore.setState({ status: "loading" });
    render(<SettingsPage />);
    expect(screen.getByLabelText("Loading settings")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SETTING_GROUPS[0] })).not.toBeInTheDocument();
  });

  it("renders setting rows once ready", () => {
    ready();
    render(<SettingsPage />);
    expect(screen.getByText("assistant name")).toBeInTheDocument();
    expect(screen.getByText("speech rate")).toBeInTheDocument();
  });

  it("search narrows the visible rows to only the matching group", () => {
    ready();
    render(<SettingsPage />);
    // Unique to push_to_talk_key's label -- its own group ("Keyboard
    // Trigger") is the only one that should survive the filter.
    const [search] = screen.getAllByLabelText("Search settings");
    fireEvent.change(search, { target: { value: "push-to-talk" } });

    expect(screen.getByText("push-to-talk key")).toBeInTheDocument();
    expect(screen.queryByText("assistant name")).not.toBeInTheDocument();
    expect(screen.queryByText("speech rate")).not.toBeInTheDocument();
  });

  // `personality` is absent from the demo registry (milestone 5b, Task 5)
  // and, live, is a genuine daemon settings row this page must actively
  // filter out (fix round: it reports success and changes nothing) --
  // either way it must never render as a row here.
  it("does not render personality as a row; the panel is its control", () => {
    ready();
    render(<SettingsPage />);

    expect(screen.queryByText("personality base")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "personality base" })).toBeInTheDocument();
  });

  // The panels are searchable by keyword, not by registry row. Asserted on
  // panel-unique content rather than headings: the rail's jump links carry the
  // same names, so a text query would match the nav and pass whether or not
  // the panel actually rendered.
  it.each([
    ["personality", "combobox", /personality base/i],
    ["backup", "button", /back up now/i],
    ["restore", "button", /back up now/i],
    ["recovery phrase", "button", /back up now/i],
    ["danger", "button", /forget all memory/i],
    ["reset", "button", /forget all memory/i],
    ["face", "button", /^forget$/i],
  ] as const)("searching %j surfaces its panel", (query, role, control) => {
    ready();
    render(<SettingsPage />);
    const [search] = screen.getAllByLabelText("Search settings");
    fireEvent.change(search, { target: { value: query } });

    expect(screen.queryByText(/no setting matches/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole(role, { name: control }).length).toBeGreaterThan(0);
  });

  it("searching for a panel does not drag the other panels along", () => {
    ready();
    render(<SettingsPage />);
    const [search] = screen.getAllByLabelText("Search settings");
    fireEvent.change(search, { target: { value: "backup" } });

    expect(screen.getByRole("button", { name: /back up now/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "personality base" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /forget all memory/i })).not.toBeInTheDocument();
  });

  // The panels are page furniture, not search results. Before this, a query
  // matching nothing rendered "No setting matches that." directly above
  // Personality, Backup, Enrollment and Danger Zone.
  it("hides every panel when a search matches nothing", () => {
    ready();
    render(<SettingsPage />);
    const [search] = screen.getAllByLabelText("Search settings");
    fireEvent.change(search, { target: { value: "zzzznothing" } });

    expect(screen.getByText(/no setting matches/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "personality base" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back up now/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/enrolling someone new/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /forget all memory/i })).not.toBeInTheDocument();
  });

  it("hides the panels while a search is showing results too", () => {
    ready();
    render(<SettingsPage />);
    const [search] = screen.getAllByLabelText("Search settings");
    fireEvent.change(search, { target: { value: "push-to-talk" } });

    expect(screen.getByText("push-to-talk key")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /forget all memory/i })).not.toBeInTheDocument();
  });

  it("hides the panels while a group filter is active", () => {
    ready();
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Wake Word" }));

    expect(screen.getByText("sensitivity")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /forget all memory/i })).not.toBeInTheDocument();
  });

  it("a panel jump link clears the active filter so the panel can be reached", () => {
    ready();
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Wake Word" }));
    expect(screen.queryByRole("button", { name: /forget all memory/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Danger Zone" }));

    expect(useSettingsStore.getState().activeGroup).toBeNull();
    expect(screen.getByRole("button", { name: /forget all memory/i })).toBeInTheDocument();
  });
});
