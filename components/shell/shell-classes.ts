/**
 * The shell's two structural class strings, shared by app/demo/layout.tsx and
 * app/app/layout.tsx. They are here rather than written out twice because they
 * encode two things that are easy to half-apply and hard to notice:
 *
 * `h-dvh`, not `h-screen`. On mobile Safari and Chrome, `100vh` is the
 * viewport with the browser chrome RETRACTED -- the largest it ever gets --
 * so a `100vh` shell is taller than what is actually on screen at rest, and
 * its last child, which is now the bottom nav, sits below the fold until the
 * user scrolls the URL bar away. `dvh` tracks the viewport as it is. On
 * desktop the two are identical.
 *
 * `min-h-0` on the scroll container. Without it, flexbox's default
 * `min-height: auto` lets <main> grow to fit its content, so a child asking
 * for `h-full` measures against an indefinite height, resolves to nothing, and
 * the WINDOW scrolls instead of the pane -- which hands a virtualised list an
 * unbounded scroll element and no reason to virtualize. Four pages used to
 * work around this with `h-[calc(100vh-8.5rem)]`, a hand-transcribed copy of
 * the Topbar's height that was wrong the moment the Topbar changed.
 */
export const SHELL = "flex h-dvh flex-col lg:flex-row";

export const MAIN = "min-h-0 flex-1 overflow-y-auto p-4 lg:p-6";
