"use client";

import { useEffect, useState } from "react";
import { getHighlighter, SHIKI_THEME, SHIKI_LANGS } from "@/lib/shiki";
import { cn } from "@/lib/utils";

/** Anything shiki was not loaded with would throw at codeToHtml time. */
function safeLang(language: string): string {
  return (SHIKI_LANGS as readonly string[]).includes(language) ? language : "text";
}

export function CodeBlock({
  language,
  code,
  className,
}: {
  language: string;
  code: string;
  className?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    getHighlighter()
      .then((hl) => {
        if (cancelled) return;
        setHtml(hl.codeToHtml(code, { lang: safeLang(language), theme: SHIKI_THEME }));
      })
      .catch(() => {
        // Highlighting is a nicety; plain mono is a perfectly good fallback.
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div
      data-testid="code-block"
      data-language={language}
      className={cn(
        "my-3 overflow-x-auto rounded-md border border-border bg-bg p-3 font-mono text-xs",
        className,
      )}
    >
      {html ? (
        // Safe: shiki HTML-escapes the source text (hast-util-to-html /
        // stringify-entities) when serializing codeToHtml's output, so `code`
        // can never break out of the generated markup. This holds ONLY as
        // long as no `transformers` or decoration options are passed to
        // createHighlighter/codeToHtml — those hooks can inject raw HTML. Do
        // not add one (e.g. for line-highlighting or a copy button) without
        // re-reviewing this for XSS.
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="whitespace-pre text-bone-dim">{code}</pre>
      )}
    </div>
  );
}
