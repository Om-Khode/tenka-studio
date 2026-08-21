"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "./skeleton";

export function CardSkeletonGate({
  children,
  delayMs = 400,
}: {
  children: React.ReactNode;
  delayMs?: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);

  if (!ready) return <Skeleton className="h-32 w-full" />;
  return <>{children}</>;
}
