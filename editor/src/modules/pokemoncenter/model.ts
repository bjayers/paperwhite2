// What the Pokémon Center page works out from services.json: the shares and odds it shows beside the weights. The
// weights are the data's; these only read them (the game draws a tier by its weight out of the tiers' total, then an
// item by its weight out of the tier's, a plain item weighing 1: tools/paperwhite2/pokemon_center.py).

import type { JsonMap, JsonValue } from "../../../shared/json.ts";

export const SERVICES_PATH = "res/paperwhite2/pokemon_center/services.json";

export interface TierItem {
  item: string;
  /** The item's own weight, or null when it is a plain name (weight 1). */
  weight: number | null;
}

export interface Tier {
  name: string;
  weight: number;
  items: TierItem[];
}

export interface TierShare {
  /** The tier's share of the held items, 0 to 1. */
  share: number;
  /** Each item's chance of being the tier's pick, 0 to 1, in the tier's order. */
  items: number[];
}

const map = (v: JsonValue | undefined): JsonMap => (v instanceof Map ? v : new Map());

export function readTiers(value: JsonValue | undefined): Tier[] {
  if (!Array.isArray(value)) return [];
  return value.map((t) => {
    const tier = map(t);
    const items = tier.get("items");
    return {
      name: String(tier.get("name") ?? ""),
      weight: Number(tier.get("weight") ?? 0),
      items: Array.isArray(items) ? items.map((i): TierItem => {
        if (i instanceof Map) return { item: String(i.get("item") ?? ""), weight: Number(i.get("weight") ?? 1) };
        return { item: String(i), weight: null };
      }) : [],
    };
  });
}

export const itemWeight = (i: TierItem) => i.weight ?? 1;

export function tierShares(tiers: Tier[]): TierShare[] {
  const total = tiers.reduce((sum, t) => sum + t.weight, 0);
  return tiers.map((t) => {
    const inside = t.items.reduce((sum, i) => sum + itemWeight(i), 0);
    return {
      share: total > 0 ? t.weight / total : 0,
      items: t.items.map((i) => (inside > 0 ? itemWeight(i) / inside : 0)),
    };
  });
}

/** The chance that one trade gives the item held: the held-item percent, the tier and the item, summed over every
 * place the item is listed. */
export function itemChance(tiers: Tier[], heldPercent: number, item: string): number {
  const shares = tierShares(tiers);
  let chance = 0;
  tiers.forEach((t, ti) => t.items.forEach((i, ii) => {
    if (i.item === item) chance += (heldPercent / 100) * shares[ti].share * shares[ti].items[ii];
  }));
  return chance;
}

/** "about 1 in N trades", or null for an item that never comes. */
export function oneIn(chance: number): string | null {
  if (!(chance > 0)) return null;
  const n = Math.round(1 / chance);
  return `about 1 in ${n.toLocaleString("en-US")} trades`;
}

/** A share as a percentage: two decimals under 1%, one decimal otherwise. */
export function percentOf(share: number): string {
  const p = share * 100;
  return `${p < 1 && p > 0 ? p.toFixed(2) : p.toFixed(1)}%`;
}

/** Each weight's share of the list's total, 0 to 1 (0 for all when the total is 0). */
export function sharesOf(weights: number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (total > 0 ? w / total : 0));
}
