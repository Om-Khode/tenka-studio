import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-mono transition-colors disabled:opacity-40 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-bone text-bg hover:bg-[#e4ddcf]",
        secondary: "bg-transparent border border-border text-bone hover:border-border-strong",
        ghost: "bg-transparent text-bone hover:underline",
      },
      size: {
        sm: "px-3 py-1.5 text-xs uppercase tracking-wide",
        md: "px-4 py-2.5 text-sm",
        lg: "px-6 py-3 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
