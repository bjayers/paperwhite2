// Trainer level scaling as the game works it out (src/paperwhite2/main/paperwhite2_trainer_scaling.c, from
// res/paperwhite2/trainer_scaling/trainer_scaling.json): a trainer's tier, and its party's levels at a party level.
// The Trainer Editor's preview uses it.

import type { JsonValue } from "../../../shared/json.ts";
import { toPlain } from "../../../shared/json.ts";

export const SCALING = "res/paperwhite2/trainer_scaling/trainer_scaling.json";
export const LEVEL_SCALING = "res/paperwhite2/level_scaling.json";
export const FIXED = "fixed";

export interface Tier {
  name: string;
  top: number;
  bottom: number;
  below_original: boolean;
}

export interface Scaling {
  tiers: Tier[];
  default_tier: string;
  ally_tier: string;
  classes: { class: string; tier: string }[];
  trainers: { trainer: string; tier: string }[];
  badge_floor: number[];
}

export const readScaling = (data: JsonValue | null): Scaling | null => (data instanceof Map ? (toPlain(data) as unknown as Scaling) : null);

/** A trainer's file's TRAINER_* constant: res/trainers/data/leader_cheren.json is TRAINER_LEADER_CHEREN. */
export const trainerConstant = (path: string) => `TRAINER_${path.slice(path.lastIndexOf("/") + 1, -".json".length).toUpperCase()}`;

/** The trainer's own tier if listed, else its class's, else the default; "fixed" for not scaled. */
export function tierOf(s: Scaling, trainer: string, cls: string): { tier: string; own: boolean } {
  const own = s.trainers.find((t) => t.trainer === trainer);
  if (own) return { tier: own.tier, own: true };
  return { tier: s.classes.find((c) => c.class === cls)?.tier ?? s.default_tier, own: false };
}

const clamp = (n: number) => Math.min(100, Math.max(1, n));

/** The party level trainers scale from: the party's, at least the badge floor. */
export const scalingBasis = (s: Scaling, partyLevel: number, badges: number) =>
  Math.max(partyLevel, s.badge_floor[Math.min(8, Math.max(0, badges))] ?? 1);

/** A team's levels at a party level: the ace at the party level + top, the others keeping their gap below it but no
 * lower than the party level + bottom, from 1 to 100; then the difficulty's levels, if any. */
export function scaleTeam(levels: number[], tier: Tier, basis: number, difficulty = 0): number[] {
  if (!levels.length) return [];
  const ace = Math.max(...levels);
  const top = clamp(basis + tier.top);
  const bottom = clamp(basis + tier.bottom);
  return levels.map((level) => {
    let next = Math.max(top - (ace - level), bottom);
    if (!tier.below_original) next = Math.max(next, level);
    return clamp(clamp(next) + difficulty);
  });
}
