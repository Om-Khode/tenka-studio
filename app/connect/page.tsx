"use client";

import { notFound, useRouter } from "next/navigation";
import { ConnectGate } from "@/components/live/ConnectGate";
import { isPublicDemoBuild } from "@/services/deployment";

export default function ConnectPage() {
  // Gated here rather than inherited from app/app/layout.tsx: this route is
  // deliberately NOT nested under that layout -- read its docstring, the
  // sibling arrangement is what fixed milestone 5b's blank connect page -- so
  // there is no gated parent to inherit from. A public build has no daemon to
  // connect to, and a token field that cannot work is worse than a 404.
  if (isPublicDemoBuild()) notFound();

  const router = useRouter();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-bone-ghost">
        TENKA STUDIO
      </span>
      <h1 className="font-display text-2xl font-bold tracking-tight text-bone">
        Connect to TENKA
      </h1>
      <ConnectGate onConnected={() => router.push("/app")} />
    </main>
  );
}
