import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";

/**
 * The ROOT layout, so this describes /app -- a real daemon on a real machine --
 * exactly as much as it describes /demo. It used to end "— demo mode", which
 * captioned every route in the app, the live one included.
 */
export const metadata: Metadata = {
  title: "TENKA Studio",
  description: "A local-first AI assistant's control dashboard.",
};

/**
 * Next injects a `width=device-width, initial-scale=1` default, so this is not
 * strictly load-bearing -- it is stated because everything the responsive
 * layout does is measured against it, and a page-level behaviour that the
 * whole shell depends on should not be something a reader has to know a
 * framework default to find.
 *
 * No `maximumScale`/`userScalable`: pinch-zoom is an accessibility affordance,
 * and disabling it is how a small-text app becomes unusable rather than merely
 * cramped. The 16px input rule in globals.css is what stops iOS zooming on
 * focus, which is the actual problem people reach for `maximumScale` to solve.
 *
 * `viewportFit: "cover"` is load-bearing, not decorative. `env(safe-area-
 * inset-bottom)` reads `0px` on every engine until a page opts in with this
 * -- BottomNav.tsx's `pb-[env(safe-area-inset-bottom)]` was spending a value
 * that could never be anything but zero without it. Two things follow once
 * this is set: the layout viewport (and so `h-dvh`) extends under the home
 * indicator / gesture bar instead of stopping short of it, and that padding
 * on the nav starts reserving the real inset -- so the strip beneath the bar
 * is TENKA's own `--bg`, painted by the bar itself, rather than whatever the
 * OS paints in a region this page never claimed.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0e10",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
