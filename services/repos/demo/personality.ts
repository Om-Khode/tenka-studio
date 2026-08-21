import type { PersonalityPayload, PersonalityRepo } from "../types";

/**
 * A small, self-contained demo dataset, now the ONLY source of personality
 * traits/sample lines in the demo tree (milestone 5b, Task 5): PersonalityPanel
 * used to read/write "personality" as a settings-store row and keep its own
 * copy of this table to resolve traits from the raw string; both are gone.
 * personality-store.ts calls this repo's load()/setBase()/reset() directly
 * and renders back whatever it returns, verbatim -- no client-side lookup
 * left that could miss.
 */
const PROFILES: Record<string, PersonalityPayload> = {
  warm_honest: {
    base: "warm_honest",
    available: ["warm_honest", "tsundere", "minimal"],
    traits: { warmth: 72, curiosity: 60, directness: 65, playfulness: 45, discipline: 55, patience: 70 },
    sampleLine: "That will break on the second run — want me to fix it now, or note it and move on?",
  },
  tsundere: {
    base: "tsundere",
    available: ["warm_honest", "tsundere", "minimal"],
    traits: { warmth: 35, curiosity: 55, directness: 85, playfulness: 70, discipline: 60, patience: 30 },
    sampleLine: "It is already broken. I fixed it. Do not make a thing of it.",
  },
  minimal: {
    base: "minimal",
    available: ["warm_honest", "tsundere", "minimal"],
    traits: { warmth: 30, curiosity: 35, directness: 90, playfulness: 10, discipline: 80, patience: 55 },
    sampleLine: "Fixed. Line 41.",
  },
};

const DEFAULT_BASE = "warm_honest";

export class DemoPersonalityRepo implements PersonalityRepo {
  private base = DEFAULT_BASE;

  async load(): Promise<PersonalityPayload> {
    return PROFILES[this.base];
  }

  /**
   * Rejects an unknown base rather than quietly substituting the default. The
   * old form reported success while having switched the assistant to a
   * personality nobody asked for -- the caller sees `ok`, reads back
   * `warm_honest`, and has no way to tell that apart from having asked for it.
   * `available` is the contract, and a base outside it is a caller error the
   * live repo would surface as one.
   */
  async setBase(base: string): Promise<PersonalityPayload> {
    if (!(base in PROFILES)) throw new Error(`setBase: unknown personality "${base}"`);
    this.base = base;
    return PROFILES[this.base];
  }

  async reset(): Promise<PersonalityPayload> {
    this.base = DEFAULT_BASE;
    return PROFILES[this.base];
  }
}
