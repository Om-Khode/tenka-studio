import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export function Card({ className, hoverable, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg backdrop-blur-md transition-colors",
        hoverable && "hover:bg-card-hover",
        className
      )}
      {...props}
    />
  );
}
