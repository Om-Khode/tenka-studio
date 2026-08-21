import * as React from "react";
import { Card } from "./card";
import { CardSkeletonGate } from "./CardSkeletonGate";

export interface ComingSoonProps {
  title: string;
  specNumber: number;
  icon: React.ReactNode;
}

export function ComingSoon({ title, specNumber, icon }: ComingSoonProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <CardSkeletonGate>
        <Card className="flex flex-col items-center gap-4 px-12 py-16 text-center">
          <div className="text-bone-subtle">{icon}</div>
          <h2 className="font-display text-2xl font-bold text-bone">{title}</h2>
          <p className="font-mono text-xs uppercase tracking-wide text-bone-ghost">
            this page ships in spec {specNumber}
          </p>
        </Card>
      </CardSkeletonGate>
    </div>
  );
}
