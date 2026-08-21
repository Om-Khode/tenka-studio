import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Defect E's dead band beneath the bottom nav: without `viewport-fit=cover`,
 * `env(safe-area-inset-bottom)` is spec'd to read `0px` regardless of what a
 * phone actually reserves for a home indicator or gesture bar -- a page only
 * gets the real value once it opts in. BottomNav.tsx already spends a
 * `pb-[env(safe-area-inset-bottom)]` assuming that value is real; without
 * this opt-in, that padding is permanently `0px` and the shell's `h-dvh`
 * never extends under the system UI either, so the strip beneath the bar
 * renders whatever the OS/browser paints there by default -- not TENKA's own
 * `--bg` -- which is exactly the "dead band, not flush" symptom.
 *
 * A source sweep, not a render test importing `./layout`: the root layout
 * pulls in `globals.css` and the vendored font CSS, which vitest's CSS
 * pipeline (a plain Vite config, not Next's) cannot process -- see
 * components/selector-conventions.test.ts for the same reasoning applied to
 * a different file that cannot be safely imported under test.
 */
describe("root viewport", () => {
  it("opts into viewport-fit=cover, so the safe-area insets BottomNav already spends are real", () => {
    const source = readFileSync(join(import.meta.dirname, "layout.tsx"), "utf8");
    expect(source).toMatch(/viewportFit:\s*["']cover["']/);
  });
});
