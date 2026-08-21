"use client";

import type { ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { CodeBlock } from "@/components/ui/CodeBlock";

export function MarkdownContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("text-sm leading-relaxed text-bone-dim", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-bone">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-bone">{children}</em>,
          a: ({ children, href }) => (
            <a href={href} className="text-blue underline hover:no-underline">
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wide text-bone-subtle">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border px-3 py-2 text-bone">{children}</td>
          ),
          code: ({ className: cls, children }) => {
            const raw = String(children ?? "");
            const langMatch = /language-(\w+)/.exec(cls ?? "");

            // Inline code: react-markdown gives inline <code> no language class,
            // and it never contains a newline. Check the RAW text, before
            // stripping the trailing newline below — rehype always appends a
            // trailing "\n" to fenced-block content (even a single-line block
            // with no language), so stripping first would make that case
            // indistinguishable from genuine inline code.
            if (!langMatch && !raw.includes("\n")) {
              return (
                <code className="rounded-sm bg-card px-1 py-0.5 font-mono text-[0.85em] text-amber">
                  {children}
                </code>
              );
            }

            const text = raw.replace(/\n$/, "");
            return <CodeBlock language={langMatch?.[1] ?? "text"} code={text} />;
          },
          pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
