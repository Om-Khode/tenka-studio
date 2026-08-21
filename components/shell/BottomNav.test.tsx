import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { BottomNav } from "./BottomNav";
import { NAV_ITEMS } from "./nav-items";
import { useChatStore } from "@/store/chat-store";

/**
 * The bottom bar is the ONLY nav below `lg` -- components/shell/Sidebar.tsx is
 * `hidden` there -- so anything the sidebar's own suite pins has to hold here
 * too, or a phone gets a lesser app rather than a narrower one.
 *
 * What this file cannot check is the half that is pure CSS: which of the two
 * navs is visible at a given width. Tailwind's stylesheet is not loaded under
 * jsdom, so `hidden`/`lg:hidden` are inert here and both navs render. That is
 * the browser pass's job (see the design doc's verification section), and
 * pretending otherwise with a jsdom media-query stub would assert the stub.
 */
describe("BottomNav", () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState(useChatStore.getInitialState());
  });

  it("renders every nav destination, so the bottom bar is not a subset of the sidebar", () => {
    render(<BottomNav activePath="/demo" basePath="/demo" />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(within(nav).getAllByRole("link")).toHaveLength(NAV_ITEMS.length);
  });

  it("builds every href from basePath, not a hardcoded /demo", () => {
    const { unmount } = render(<BottomNav activePath="/demo" basePath="/demo" />);
    for (const { label, path } of NAV_ITEMS) {
      expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toHaveAttribute(
        "href",
        `/demo${path}`,
      );
    }
    unmount();

    render(<BottomNav activePath="/app" basePath="/app" />);
    for (const { label, path } of NAV_ITEMS) {
      expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toHaveAttribute(
        "href",
        `/app${path}`,
      );
    }
  });

  it("marks the active route, and only it", () => {
    render(<BottomNav activePath="/demo/files" basePath="/demo" />);
    expect(screen.getByRole("link", { name: /files/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /memory/i })).not.toHaveAttribute("aria-current");
  });

  it("marks the dashboard active on the tree root, where `path` is the empty string", () => {
    render(<BottomNav activePath="/demo" basePath="/demo" />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the same live conversation count the sidebar does", () => {
    useChatStore.getState().createConversation();
    useChatStore.getState().createConversation();
    render(<BottomNav activePath="/demo" basePath="/demo" />);
    expect(screen.getByRole("link", { name: /chat/i }).textContent).toContain("2");
  });

  it("shows no badge when there is nothing to count", () => {
    render(<BottomNav activePath="/demo" basePath="/demo" />);
    expect(screen.getByRole("link", { name: /chat/i }).textContent).toBe("Chat");
    expect(screen.getByRole("link", { name: /memory/i }).textContent).toBe("Memory");
  });

  /**
   * Defect E: six `flex-1` destinations overflowed a 360-414px bar, clipping
   * "Dashboard" mid-word. `truncate` was already on the label, but a flex
   * item's automatic minimum size is its CONTENT's width unless the item
   * itself carries `min-w-0` (or an `overflow` other than `visible`) --
   * without it, a flex item refuses to shrink below its label's full text
   * width no matter how little room six of them are given, so the row
   * overflows the viewport instead of the label ever truncating. jsdom does
   * not lay out CSS (see this file's own top-of-file note), so this cannot
   * assert the pixels; it pins the class that makes the shrink -- and so the
   * truncate -- possible at all.
   */
  it("lets every destination shrink below its label's own width, so truncate has somewhere to engage", () => {
    render(<BottomNav activePath="/demo" basePath="/demo" />);
    for (const { label } of NAV_ITEMS) {
      expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toHaveClass("min-w-0");
    }
  });

  /**
   * Fix round 2, Defect 2b -- diagnosed, not changed. A live-test report
   * described "the bar sitting above a black band, with the gesture pill
   * below that" and asked whether `viewport-fit=cover` (round 1's fix for
   * Defect E) had swapped one bug for another.
   *
   * Measured against a real Chromium build via `Emulation.setSafeAreaInsetsOverride`
   * (CDP, see docs/6b-live-test-frontend-fixes-round2.md for the numbers):
   * `env(safe-area-inset-bottom)` resolved to exactly the overridden inset,
   * `<nav>`'s own `padding-bottom` matched it, `<nav>`'s own
   * `background-color` matched `<body>`'s, and `<nav>`'s bounding rect
   * reached the true bottom of the viewport (not stopping short of it). That
   * is the CORRECT shape: the bar's own background extends through the safe
   * area while its tap targets sit above the inset. The "band" in the
   * screenshot is that safe-area buffer, colour-matched and doing its job --
   * not a second regression. `viewport-fit=cover` stays; nothing here needed
   * a code change.
   *
   * jsdom cannot lay out CSS or resolve `env()` (this file's own top note),
   * so this cannot re-measure the pixels -- it pins the ONE property that
   * would flip this from the correct pattern to the bad one: the padding and
   * the background living on the SAME element. The bad pattern the brief
   * described -- "the whole bar being pushed up by it" -- looks like `bg-bg`
   * moving off `<nav>` (onto a parent that does not also carry the inset
   * padding) or the padding moving off `<nav>` (onto a sibling/wrapper) --
   * either split would open a gap below the bar painted by whatever sits
   * behind it instead of the bar's own colour. Proven red by moving `bg-bg`
   * onto a wrapping `<div>` while leaving the padding on `<nav>`: this
   * assertion failed exactly as expected before being reverted.
   */
  it("keeps the safe-area padding and the bar's own background on the SAME element", () => {
    render(<BottomNav activePath="/demo" basePath="/demo" />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav).toHaveClass("pb-[env(safe-area-inset-bottom)]");
    expect(nav).toHaveClass("bg-bg");
  });
});
