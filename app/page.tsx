import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isPublicDemoBuild } from "@/services/deployment";

const TENKA_REPO = "https://github.com/Om-Khode/TENKA";

export default function LandingPage() {
  // A public deployment 404s /app and /connect, because a page served over
  // HTTPS cannot reach a visitor's loopback daemon. So on that build this page
  // must not offer the door (it is walled off) and must not claim she is
  // "running right here on this machine" (she is running on a different one, if
  // at all). Both are true of a desktop build and neither is true of a URL.
  const publicDemo = isPublicDemoBuild();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-bone-ghost">
        TENKA STUDIO
      </span>
      <h1 className="font-display text-2xl font-bold tracking-tight text-bone sm:text-3xl">
        Your local-first AI, one dashboard away
      </h1>
      <p className="max-w-md text-sm text-bone-dim">
        {publicDemo
          ? "Not a mockup. The real interface, on scripted data. The dashboard that talks to a running TENKA runs on the machine she runs on."
          : "Not a mockup. A live look at her, running right here on this machine."}
      </p>
      {/* Stacks below `sm`: two `size="lg"` buttons side by side overflow a
          390px viewport, and a landing page that scrolls sideways is the first
          thing a visitor sees. `w-full` on the wrapper so the stacked pair is
          the same width rather than each button hugging its own label. */}
      <div className="mt-4 flex w-full max-w-xs flex-col items-stretch gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:items-center">
        <Link href="/demo">
          <Button variant="primary" size="lg" className="w-full">
            Try Demo
          </Button>
        </Link>
        {publicDemo ? (
          <a href={TENKA_REPO} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="lg" className="w-full">
              TENKA on GitHub
            </Button>
          </a>
        ) : (
          /*
            Enabled as of milestone 5b: the live tree exists and /connect is the
            way into it. While this stayed disabled, /connect was reachable only
            by typing the URL or by the /app redirect -- so the front door had no
            way in at all, which is half of what made the blank-connect-page bug
            survive as long as it did.
          */
          <Link href="/connect">
            <Button variant="secondary" size="lg" className="w-full">
              Connect to TENKA
            </Button>
          </Link>
        )}
      </div>
    </main>
  );
}
