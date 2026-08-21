import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * The root 404. Next serves this for any unmatched URL, and after the
 * public-demo gate two reachable routes land here on purpose: /app and
 * /connect, both of which need a daemon on the same machine. So this page has
 * to read as an explanation, not as a dead end -- Next's stock 404 on a page
 * someone opened from a CV is a rough edge worth closing.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-bone-ghost">
        404
      </span>
      <h1 className="font-display text-2xl font-bold tracking-tight text-bone">
        Nothing of hers is here.
      </h1>
      <p className="max-w-sm text-sm text-bone-dim">
        The dashboard that talks to a running TENKA only works on the machine she runs on.
        The demo works anywhere.
      </p>
      <Link href="/demo" className="mt-2">
        <Button variant="primary" size="lg">
          Try Demo
        </Button>
      </Link>
    </main>
  );
}
