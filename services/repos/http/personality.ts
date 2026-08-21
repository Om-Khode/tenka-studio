import { apiGet, apiSend } from "@/services/http";
import type { PersonalityPayload, PersonalityRepo } from "../types";
import type { components } from "@/types/api";

type Payload = components["schemas"]["PersonalityPayload"];
type Patch = components["schemas"]["PersonalityPatch"];

/**
 * The daemon keeps traits as 0.0-1.0 floats -- see any personality's
 * traits.json, e.g. `"warmth": {"initial": 0.70, "floor": 0.10, "ceiling":
 * 0.90}` -- while Studio's whole trait vocabulary is 0-100: the demo repo
 * returns `warmth: 72`, TraitBar draws `width: ${v}%`, LiveTraitDriftStrip
 * declares `aria-valuemax={100}`, and both print `Math.round(v)`.
 *
 * Passing the daemon's numbers through unscaled put a real assistant on
 * screen as openness 1, patience 1, sass 0 -- Math.round(0.5) and
 * Math.round(0.30) -- above bars 0.5% wide, reading as an assistant with
 * almost no personality at all. She was at 70% warmth.
 *
 * Scaled here rather than in the components: this is the one edge where the
 * daemon's vocabulary becomes Studio's, and the alternative is every current
 * and future trait renderer having to remember which scale it was handed.
 */
const TRAIT_SCALE = 100;

function toPercentTraits(traits: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(traits).map(([key, value]) => [
      key,
      // Rounded to two decimals of a percent, not to an integer: reflection
      // moves a trait by as little as 0.01 (1%), and event-driven deltas are
      // smaller still, so integer rounding here would quietly discard the
      // drift this strip exists to show. Two decimals is well below anything
      // meaningful and removes the float artifact -- 0.55 * 100 is
      // 55.00000000000001, which would otherwise reach the DOM verbatim.
      Math.round(value * TRAIT_SCALE * 100) / 100,
    ]),
  );
}

function toDomain(payload: Payload): PersonalityPayload {
  return {
    base: payload.base,
    available: payload.available,
    traits: toPercentTraits(payload.traits),
    sampleLine: payload.sampleLine,
  };
}

/**
 * Talks to the daemon's dedicated personality routes (milestone 5b, Task
 * 5) -- `GET/PATCH /v1/personality`, `POST /v1/personality/reset`. Verified
 * against `assistant/io/api/routes/settings.py`, which is where all three
 * live: the GET is gated on `observe`, and BOTH writes on `system_control`.
 * `chat_send` gates none of them -- changing how she behaves is a machine
 * change, not a conversational one, and settings.py says that separation is
 * the point. `setBase`/`reset` apply
 * immediately server-side and hand back the fully-resolved new state; there
 * is no draft/save step to model here because the daemon has none either.
 *
 * `set_personality` 400s with "unknown personality" if `base` is not in the
 * daemon's own `available` list -- that rejection surfaces as a thrown
 * ApiError from apiSend(), same as any other daemon error, for the caller
 * (personality-store.ts) to catch and toast rather than resolve silently.
 */
export class HttpPersonalityRepo implements PersonalityRepo {
  async load(): Promise<PersonalityPayload> {
    return toDomain(await apiGet<Payload>("/v1/personality"));
  }

  async setBase(base: string): Promise<PersonalityPayload> {
    const body: Patch = { base };
    return toDomain(await apiSend<Payload>("PATCH", "/v1/personality", body));
  }

  async reset(): Promise<PersonalityPayload> {
    return toDomain(await apiSend<Payload>("POST", "/v1/personality/reset"));
  }
}
