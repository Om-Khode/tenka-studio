/** Shiki theme closest to the TENKA palette (warm near-black, muted accents). */
export const SHIKI_THEME = "vitesse-dark";

export const SHIKI_LANGS = [
  "python",
  "typescript",
  "tsx",
  "javascript",
  "json",
  "bash",
  "sql",
  "markdown",
  "css",
] as const;

export type Highlighter = {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
};

let highlighterPromise: Promise<Highlighter> | null = null;

/** Loaded once per session, lazily — shiki is large and must not block first paint. */
export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki")
      .then((shiki) =>
        shiki.createHighlighter({
          themes: [SHIKI_THEME],
          langs: [...SHIKI_LANGS],
        }),
      )
      .catch((err: unknown) => {
        // A transient failure (e.g. a dropped chunk request) must not
        // permanently downgrade every code block for the rest of the
        // session — null the cache so the next call gets a fresh attempt
        // instead of replaying this same rejection forever.
        highlighterPromise = null;
        throw err;
      });
  }
  return highlighterPromise;
}

/** Test-only: clears the session cache so each test starts cold. */
export function resetHighlighterForTests() {
  highlighterPromise = null;
}
