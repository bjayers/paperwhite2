// The Entree page's Buffs tab's data (res/paperwhite2/entralink/buffs.json, buffs.schema.json beside it; the design in
// docs/paperwhite2/design/entralink-buffs.md): the buff cards read as plain records, the effect kinds and their
// parameters from the schema (its effect_* definitions, so a new kind needs no change here), new and duplicated cards
// with stable ids, a tier change, the checks beyond the schema's (tools/paperwhite2/entralink_buffs.py's problems()),
// and the balance meter: the strongest possible hit and an example build, the same arithmetic as the packer's ceiling()
// and example_hit() and the doc's section 5.

import { fromPlain, type JsonMap, type JsonValue } from "../../../shared/json.ts";
import { resolve, type Schema } from "../../../shared/schema.ts";

export const BUFFS = "res/paperwhite2/entralink/buffs.json";
export const BUFFS_SCHEMA = "res/paperwhite2/entralink/buffs.schema.json";
export const BUFF_ICONS_DIR = "res/paperwhite2/entralink/buff_icons";
/** A category's icon (its pixels are palette indices) and a tier's palette (a swatch whose PNG palette is the tier's 16
 * colors): the game draws each icon in the card's tier's palette, so one picture serves the three tiers. */
export const categoryIconPath = (category: string) => `${BUFF_ICONS_DIR}/${category}.png`;
export const tierPalettePath = (tier: Tier) => `${BUFF_ICONS_DIR}/tier_${tier}.png`;
export const TIERS = ["blue", "purple", "gold"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_NOTES: Record<Tier, string> = {
  blue: "Stats, team-wide, stacking freely",
  purple: "Generic mechanics, stacking like blues; may be related to gold themes",
  gold: "A theme's boon in one of the gold slots, ranked up by picking it again",
};
/** The tier odds' rows (settings.tier_odds): after a battle (enemy, challenge, boss), a gift NPC's buff cards, a buff
 * room's offer, a shop's buffs (its gold percent then times shop_gold_weight). */
export const SOURCES = ["enemy", "challenge", "boss", "gift", "buff_room", "shop"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_NOTES: Record<Source, string> = {
  enemy: "After an enemy or enemy-choice battle (and a rest room's bonus battle)",
  challenge: "After a challenge battle",
  boss: "After a boss battle; with Boss gold on, at least one gold card",
  gift: "A gift NPC's buff cards (gift_buff_chance of its cards are buffs)",
  buff_room: "A buff room's offer",
  shop: "A shop's buffs; the gold percent is then times golds' shop weight",
};
export const BUFF_POOLS = ["after_battle", "gift", "buff_room", "shop"] as const;
export type BuffPool = (typeof BUFF_POOLS)[number];
export const BUFF_POOL_NAMES: Record<BuffPool, string> = { after_battle: "After battle", gift: "Gift", buff_room: "Buff room", shop: "Shop" };
export const BUFF_POOL_NOTES: Record<BuffPool, string> = {
  after_battle: "The 1 of 3 offered after each battle, its tier by the battle's source",
  gift: "A gift NPC's choice",
  buff_room: "A buff room's choice",
  shop: "A shop's goods, at the card's price in Dream Dust",
};
/** The effect kinds that add to a bucket (stat_ratio too, but for Speed), as the packer's BUCKET_KINDS. */
export const BUCKET_KINDS = ["damage_ratio", "stab_bonus", "crit_damage"];
const ATTACK_STATS = ["attack", "sp_attack", "attacking"];
const ID = /^[a-z0-9_]+$/;

const asMap = (v: JsonValue | undefined): JsonMap => (v instanceof Map ? v : new Map());
const asList = (v: JsonValue | undefined): JsonValue[] => (Array.isArray(v) ? v : []);
const str = (v: JsonValue | undefined): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: JsonValue | undefined): number | undefined => (typeof v === "number" ? v : undefined);

export interface Buff {
  id: string; name: string; tier: Tier; description: string[]; category: string; weight: number; rounds: number[]; price?: number;
  pools: BuffPool[]; bucket?: string;
  // blue, purple
  step: number; softLimit?: number; cap: number; related: string[]; typeCard: boolean;
  // gold
  theme?: string; core: boolean; ranks: number[];
  effect: JsonMap; kind: string;
  /** Further effects (more_effects, the condense's merged cards), each with its own step, soft limit, cap and bucket. */
  more: MoreEffect[];
}
export interface MoreEffect { effect: JsonMap; kind: string; step: number; softLimit?: number; cap: number; bucket?: string }
export interface Theme { id: string; name: string; description: string }
export interface Category { id: string; name: string; description: string }
export interface Bucket { id: string; name: string; description?: string; side: "attack" | "defense"; vanilla: number; cap: number; criticalOnly: boolean; reduces: boolean; event?: string }
export interface BuildPick { buff: string; count: number }
export interface Settings {
  offers: number; tierOdds: Record<Source, Record<Tier, number>>; bossGuaranteedGold: boolean; goldSlots: number; maxRank: number;
  damageCap: number; prices: Record<Tier, number>;
}
export interface Catalogue {
  settings: Settings; buckets: Bucket[]; categories: Category[]; themes: Theme[]; buffs: Buff[]; referenceHit: number; example: BuildPick[];
  /** The band a typical late build's factor should land in (balance.typical_factor, rebalance 2). */
  typicalFactor: [number, number];
}
/** The typical band when balance.typical_factor leaves it out (the packer's DEFAULT_TYPICAL_FACTOR). */
export const DEFAULT_TYPICAL_FACTOR: [number, number] = [15, 20];

export const isTier = (v: unknown): v is Tier => TIERS.includes(v as Tier);

export function readBuff(v: JsonValue): Buff {
  const m = asMap(v);
  const desc = m.get("description");
  const effect = asMap(m.get("effect"));
  return {
    id: str(m.get("id")) ?? "", name: str(m.get("name")) ?? "", tier: isTier(m.get("tier")) ? m.get("tier") as Tier : "blue",
    description: Array.isArray(desc) ? desc.map((d) => str(d) ?? "") : [str(desc) ?? ""],
    category: str(m.get("category")) ?? "", weight: num(m.get("weight")) ?? 0,
    rounds: asList(m.get("rounds")).map((r) => num(r) ?? 0), price: num(m.get("price")),
    pools: asList(m.get("pools")).filter((p): p is BuffPool => BUFF_POOLS.includes(p as BuffPool)),
    bucket: str(m.get("bucket")),
    step: num(m.get("step")) ?? 0, softLimit: num(m.get("soft_limit")), cap: num(m.get("cap")) ?? 0,
    related: asList(m.get("related")).map((r) => str(r) ?? ""), typeCard: m.get("type_card") === true,
    theme: str(m.get("theme")), core: m.get("core") === true, ranks: asList(m.get("ranks")).map((r) => num(r) ?? 0),
    effect, kind: str(effect.get("kind")) ?? "",
    more: asList(m.get("more_effects")).map((v) => {
      const x = asMap(v);
      const e = asMap(x.get("effect"));
      return { effect: e, kind: str(e.get("kind")) ?? "", step: num(x.get("step")) ?? 0, softLimit: num(x.get("soft_limit")),
               cap: num(x.get("cap")) ?? 0, bucket: str(x.get("bucket")) };
    }),
  };
}

/** Every effect as a card-like entry: the cards, then each card's further effects as "<id>.<n>" (the packer's
 * effect_entries()). */
export function effectEntries(buffs: Buff[]): Buff[] {
  return [...buffs, ...buffs.flatMap((b) => b.more.map((m, k) => ({ ...b, ...m, id: `${b.id}.${k + 2}`, more: [] })))];
}

export function readCatalogue(data: JsonValue | null | undefined): Catalogue {
  const d = asMap(data ?? undefined);
  const s = asMap(d.get("settings"));
  const odds = asMap(s.get("tier_odds"));
  const tiers = (v: JsonValue | undefined) => Object.fromEntries(TIERS.map((t) => [t, num(asMap(v).get(t)) ?? 0])) as Record<Tier, number>;
  const balance = asMap(d.get("balance"));
  return {
    settings: {
      offers: num(s.get("offers")) ?? 3, tierOdds: Object.fromEntries(SOURCES.map((src) => [src, tiers(odds.get(src))])) as Record<Source, Record<Tier, number>>,
      bossGuaranteedGold: s.get("boss_guaranteed_gold") === true, goldSlots: num(s.get("gold_slots")) ?? 5,
      maxRank: num(s.get("max_rank")) ?? 3, damageCap: num(s.get("damage_cap")) ?? 60000, prices: tiers(s.get("prices")),
    },
    buckets: asList(d.get("buckets")).map((v) => {
      const b = asMap(v);
      return {
        id: str(b.get("id")) ?? "", name: str(b.get("name")) ?? "", description: str(b.get("description")),
        side: b.get("side") === "defense" ? "defense" : "attack", vanilla: num(b.get("vanilla")) ?? 100, cap: num(b.get("cap")) ?? 0,
        criticalOnly: b.get("critical_only") === true, reduces: b.get("reduces") === true, event: str(b.get("event")),
      } as Bucket;
    }),
    categories: asList(d.get("categories")).map((v) => {
      const c = asMap(v);
      return { id: str(c.get("id")) ?? "", name: str(c.get("name")) ?? "", description: str(c.get("description")) ?? "" };
    }),
    themes: asList(d.get("themes")).map((v) => {
      const t = asMap(v);
      return { id: str(t.get("id")) ?? "", name: str(t.get("name")) ?? "", description: str(t.get("description")) ?? "" };
    }),
    buffs: asList(d.get("buffs")).map(readBuff),
    referenceHit: num(balance.get("reference_hit")) ?? 600,
    example: asList(balance.get("example")).map((v) => ({ buff: str(asMap(v).get("buff")) ?? "", count: num(asMap(v).get("count")) ?? 1 })),
    typicalFactor: (() => {
      const band = asList(balance.get("typical_factor")).map((v) => num(v) ?? 0);
      return band.length === 2 ? [band[0], band[1]] as [number, number] : DEFAULT_TYPICAL_FACTOR;
    })(),
  };
}

// ---- The effect kinds, from the schema ------------------------------------------------------------------------------

export interface EffectKind { kind: string; schema: Schema; description: string; unit: string; params: string[]; required: string[] }

/** The schema's effect kinds in its order (its effect's anyOf of effect_* definitions), with each one's parameters. */
export function effectKinds(schema: Schema | null | undefined): EffectKind[] {
  if (!schema) return [];
  const effect = resolve(schema.$defs?.effect ?? {}, schema);
  return (effect.anyOf ?? []).map((option) => {
    const def = resolve(option, schema);
    const kind = String((def.properties?.kind?.enum ?? [""])[0]);
    const [description, unit] = (def.description ?? "").split(". Value: ");
    return {
      kind, schema: def, description, unit: unit ?? "",
      params: Object.keys(def.properties ?? {}).filter((k) => k !== "kind"),
      required: (def.required ?? []).filter((k) => k !== "kind"),
    };
  });
}

/** Whether an effect kind adds to a bucket: the bucket kinds, and stat_ratio for every stat but Speed. */
export function needsBucket(effect: JsonMap): boolean {
  const kind = str(effect.get("kind")) ?? "";
  return BUCKET_KINDS.includes(kind) || (kind === "stat_ratio" && effect.get("stat") !== "speed");
}

// ---- New, duplicated and changed cards ------------------------------------------------------------------------------

/** An id from a name, snake_case, not one of taken: name, name_2, name_3... */
export function uniqueId(name: string, taken: Iterable<string>): string {
  const base = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "buff";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** The fields' order of a tier's records (the schema's stacking or gold definition), for writing them back in order. */
export function fieldOrder(schema: Schema | null | undefined, tier: Tier): string[] {
  const def = schema?.$defs?.[tier === "gold" ? "gold" : "stacking"];
  return Object.keys(def?.properties ?? {});
}

/** A record with keys set or removed (undefined), the keys in order. */
export function withFields(record: JsonMap, changes: Record<string, JsonValue | undefined>, order: string[]): JsonMap {
  const next = new Map(record);
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) next.delete(k);
    else next.set(k, v);
  }
  const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  return new Map([...next].sort((a, b) => rank(a[0]) - rank(b[0])));
}

/** A new card of a tier: a blue Attack-like stat card, a purple power card, or a gold of the first theme. */
export function newBuff(tier: Tier, taken: Iterable<string>, theme: string | undefined, order: string[]): JsonMap {
  const id = uniqueId(`new_${tier}`, taken);
  const common = { id, name: `New ${tier}`, tier };
  const plain = tier === "gold"
    ? { ...common, description: ["+10% damage", "+20% damage", "+30% damage"], category: "power", weight: 10, pools: ["after_battle", "gift", "buff_room", "shop"],
        theme: theme ?? "", ranks: [10, 20, 30], bucket: "final", effect: { kind: "damage_ratio" } }
    : { ...common, description: "+4% all damage", category: "power", weight: 10, pools: ["after_battle", "buff_room", "shop"], step: 4, cap: 20, bucket: "final",
        effect: { kind: "damage_ratio" } };
  return withFields(fromPlain(plain) as JsonMap, {}, order);
}

/** A copy of a card with a new id and " copy" after its name; a gold copy is never its theme's core. */
export function duplicateBuff(record: JsonMap, taken: Iterable<string>, order: string[]): JsonMap {
  const b = readBuff(record);
  return withFields(record, { id: uniqueId(`${b.id}_copy`, taken), name: `${b.name} copy`.slice(0, 24), core: undefined }, order);
}

/** A card moved to another tier: a gold's ranks and rank lines from a blue's step and line, and back; the fields the
 * new tier doesn't have dropped. */
export function changeTier(record: JsonMap, tier: Tier, maxRank: number, firstTheme: string | undefined, order: string[]): JsonMap {
  const b = readBuff(record);
  if (tier === b.tier) return record;
  if (tier === "gold") {
    const ranks = Array.from({ length: maxRank }, (_, i) => Math.min(b.step * (i + 1), b.cap || b.step * (i + 1)));
    return withFields(record, {
      tier, description: fromPlain(ranks.map(() => b.description[0] ?? "")), ranks: fromPlain(ranks), theme: firstTheme ?? "",
      step: undefined, soft_limit: undefined, cap: undefined, related: undefined, type_card: undefined,
    }, order);
  }
  if (b.tier === "gold") {
    const top = b.ranks[b.ranks.length - 1] ?? 0;
    return withFields(record, {
      tier, description: b.description[0] ?? "", step: b.ranks[0] ?? 1, cap: top || 1,
      theme: undefined, core: undefined, ranks: undefined,
    }, order);
  }
  return withFields(record, { tier, related: tier === "blue" ? undefined : record.get("related"), type_card: tier === "blue" ? undefined : record.get("type_card") }, order);
}

/** An icon's RGBA pixels in a tier's colors: each pixel is a palette index, 0 clear, the rest the tier palette's color
 * at that index (as the game will draw a 16-color texture with the tier's palette). */
export function tintIcon(pixels: ArrayLike<number>, palette: readonly (readonly [number, number, number])[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    const index = pixels[i];
    if (!index) continue;
    const [r, g, b] = palette[index] ?? [0, 0, 0];
    out.set([r, g, b, 255], i * 4);
  }
  return out;
}

/** The cards a filter keeps: a tier, a theme (a gold's, or a purple related to it), a pool, text in the name, id or
 * description. */
export function filterBuffs(buffs: Buff[], f: { tier?: Tier | "all"; theme?: string; pool?: BuffPool | ""; text?: string }): number[] {
  const text = (f.text ?? "").trim().toLowerCase();
  return buffs.flatMap((b, i) => {
    if (f.tier && f.tier !== "all" && b.tier !== f.tier) return [];
    if (f.theme && b.theme !== f.theme && !b.related.includes(f.theme)) return [];
    if (f.pool && !b.pools.includes(f.pool)) return [];
    if (text && ![b.name, b.id, ...b.description].some((s) => s.toLowerCase().includes(text))) return [];
    return [i];
  });
}

// ---- The balance meter (the doc's section 5; the packer's ceiling() and example_hit()) ------------------------------

/** What a blue's or purple's picks add up to: the full step up to the soft limit, half a step after, at most the cap. */
export function pickedValue(step: number, softLimit: number | undefined, cap: number, picks: number): number {
  const full = softLimit === undefined ? picks : Math.min(picks, softLimit);
  const total = step * full + (step / 2) * (picks - full);
  return step >= 0 ? Math.min(total, cap) : Math.max(total, cap);
}

/** A card's most: a blue's or purple's cap, a gold's highest rank. */
export const strongest = (b: Buff) => (b.tier === "gold" ? Math.max(...b.ranks) : b.cap);

/** Whether a card counts toward the strongest hit (super effective, STAB, on a boss): not the resisted-only bonuses, the
 * ones exempt from the cap, or the STAB for non-STAB moves. */
export function inStrongestHit(b: Buff): boolean {
  return !(asMap(b.effect.get("condition")).get("resisted") === true || b.effect.get("exempt_from_bucket_cap") === true || b.effect.get("non_stab") === true);
}

/** A bucket's factor for a sum, at most its cap: (vanilla + sum) / vanilla, / 100 for a critical-only one; a reducing
 * one's (100 - sum) / 100. */
export function bucketFactor(bucket: Bucket, sum: number): number {
  const total = Math.min(sum, bucket.cap);
  if (bucket.reduces) return (100 - total) / 100;
  return (bucket.vanilla + total) / (bucket.criticalOnly ? 100 : bucket.vanilla);
}

export interface BucketLine { bucket: Bucket; sum: number; factor: number; capped: boolean; entries: { id: string; value: number }[] }
export interface Hit { lines: BucketLine[]; factor: number; criticalFactor: number; hit: number; criticalHit: number }

function hitOf(cat: Catalogue, values: Map<string, number>, reference: number): Hit {
  const lines: BucketLine[] = cat.buckets.map((bucket) => {
    const entries = effectEntries(cat.buffs).filter((b) => b.bucket === bucket.id && values.has(b.id)).map((b) => ({ id: b.id, value: values.get(b.id)! }));
    const sum = entries.reduce((n, e) => n + e.value, 0);
    return { bucket, sum, factor: bucketFactor(bucket, sum), capped: sum > bucket.cap, entries };
  });
  const attack = lines.filter((l) => l.bucket.side === "attack");
  const factor = attack.filter((l) => !l.bucket.criticalOnly).reduce((n, l) => n * l.factor, 1);
  let criticalFactor = attack.reduce((n, l) => n * l.factor, 1);
  if (!attack.some((l) => l.bucket.criticalOnly)) criticalFactor *= 2;
  return { lines, factor, criticalFactor, hit: reference * factor, criticalHit: reference * criticalFactor };
}

/** The strongest possible single hit: every card at its most, each bucket's sum held to its cap. */
export function ceilingHit(cat: Catalogue, reference = cat.referenceHit): Hit {
  return hitOf(cat, new Map(effectEntries(cat.buffs).filter(inStrongestHit).map((b) => [b.id, strongest(b)])), reference);
}

/** An example build's hit: each pick's value (a gold at its rank), each bucket's sum held to its cap. */
export function exampleHit(cat: Catalogue, picks: BuildPick[] = cat.example, reference = cat.referenceHit): Hit {
  const values = new Map<string, number>();
  for (const p of picks) {
    const b = cat.buffs.find((x) => x.id === p.buff);
    if (!b) continue;
    if (inStrongestHit(b))
      values.set(b.id, b.tier === "gold" ? b.ranks[Math.min(p.count, b.ranks.length) - 1] ?? 0 : pickedValue(b.step, b.softLimit, b.cap, p.count));
    b.more.forEach((m, k) => {
      if (inStrongestHit({ ...b, ...m })) values.set(`${b.id}.${k + 2}`, pickedValue(m.step, m.softLimit, m.cap, p.count));
    });
  }
  return hitOf(cat, values, reference);
}

// ---- The checks beyond the schema's (the packer's problems()) --------------------------------------------------------

export interface BuffProblem { severity: "error" | "warning"; index?: number; message: string }

/** The game shows a card's description in the system window under its chooser: two lines of about this many
 * characters (tools/paperwhite2/entralink_buffs.py's DESCRIPTION_WIDTH and wrap(), which this mirrors). */
export const DESCRIPTION_WIDTH = 32;

/** A description as the game's lines, broken at spaces; a type card's "the card's type" reads "the Electric type"
 * there, so it counts as that. */
export function descriptionLines(text: string, typeCard = false): string[] {
  const shown = typeCard ? text.replace("the card's type", "the Electric type") : text;
  const lines: string[] = [];
  for (const word of shown.split(" ")) {
    if (lines.length && `${lines[lines.length - 1]} ${word}`.length <= DESCRIPTION_WIDTH) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  return lines;
}

export function checkBuffs(cat: Catalogue): BuffProblem[] {
  const out: BuffProblem[] = [];
  const err = (message: string, index?: number) => out.push({ severity: "error", index, message });
  for (const src of SOURCES) {
    const sum = TIERS.reduce((n, t) => n + cat.settings.tierOdds[src][t], 0);
    if (sum !== 100) err(`The ${src} odds add up to ${sum}%, not 100%.`);
  }
  const buckets = new Map(cat.buckets.map((b) => [b.id, b]));
  if (buckets.size !== cat.buckets.length) err("A bucket id is used twice.");
  for (const b of cat.buckets) if (b.reduces && b.cap > 99) err(`${b.name}: a reducing bucket's cap must stay under 100.`);
  const themes = new Set(cat.themes.map((t) => t.id));
  const categories = new Set(cat.categories.map((c) => c.id));
  if (categories.size !== cat.categories.length) err("A category id is used twice.");
  if (themes.size !== cat.themes.length) err("A theme id is used twice.");
  const cores = new Map<string, string>();
  const ids = new Set<string>();
  cat.buffs.forEach((b, i) => {
    const at = `${b.name || b.id}`;
    if (!ID.test(b.id)) err(`${at}: its id isn't snake_case.`, i);
    if (!categories.has(b.category)) err(`${at}: its category "${b.category}" isn't one of the categories.`, i);
    if (ids.has(b.id)) err(`${at}: the id ${b.id} is used twice.`, i);
    ids.add(b.id);
    if (b.tier === "gold") {
      if (!b.theme || !themes.has(b.theme)) err(`${at}: its theme ${b.theme ? `"${b.theme}" ` : ""}isn't one of the themes.`, i);
      if (b.ranks.length > cat.settings.maxRank) err(`${at}: ${b.ranks.length} ranks, past the max rank ${cat.settings.maxRank}.`, i);
      if (b.description.length !== b.ranks.length) err(`${at}: its description has a line per rank.`, i);
      if (b.core && b.theme) {
        if (cores.has(b.theme)) err(`${at}: the theme ${b.theme} already has a core gold, ${cores.get(b.theme)}.`, i);
        else cores.set(b.theme, b.id);
      }
    } else {
      if ((b.step < 0) !== (b.cap < 0) || Math.abs(b.step) > Math.abs(b.cap)) err(`${at}: the step must be within the cap, of the same sign.`, i);
      for (const r of b.related) if (!themes.has(r)) err(`${at}: the related theme "${r}" isn't one of the themes.`, i);
      if (b.tier === "blue" && (b.related.length || b.typeCard)) err(`${at}: related and type card are for purples.`, i);
    }
    const checkBucket = (where: string, e: { effect: JsonMap; kind: string; bucket?: string }) => {
      const needs = needsBucket(e.effect);
      if (e.bucket !== undefined && !buckets.has(e.bucket)) err(`${where}: its bucket "${e.bucket}" isn't one of the buckets.`, i);
      else if (needs && e.bucket === undefined) err(`${where}: a ${e.kind} effect adds to a bucket: pick one.`, i);
      else if (!needs && e.bucket !== undefined) err(`${where}: a ${e.kind} effect isn't damage: it has no bucket.`, i);
      else if (e.kind === "stat_ratio" && e.bucket !== undefined) {
        const side = ATTACK_STATS.includes(str(e.effect.get("stat")) ?? "") ? "attack" : "defense";
        if (buckets.get(e.bucket)!.side !== side) err(`${where}: the ${str(e.effect.get("stat"))} stat goes in a bucket of the ${side} side.`, i);
      }
    };
    checkBucket(at, b);
    if (b.more.length && b.tier === "gold") err(`${at}: further effects are for blues and purples.`, i);
    b.more.forEach((m, k) => {
      if ((m.step < 0) !== (m.cap < 0) || Math.abs(m.step) > Math.abs(m.cap)) err(`${at}, effect ${k + 2}: the step must be within the cap, of the same sign.`, i);
      checkBucket(`${at}, effect ${k + 2}`, m);
    });
    if (b.kind === "stat_stage_on_entry" && b.tier === "gold" && asList(b.effect.get("stats_by_rank")).length !== b.ranks.length)
      err(`${at}: stats by rank has a list per rank.`, i);
    for (const text of b.description)
      if (descriptionLines(text, b.typeCard).length > 2)
        err(`${at}: "${text}" takes more than the game's two description lines of about ${DESCRIPTION_WIDTH} characters.`, i);
  });
  for (const t of cat.themes) if (!cores.has(t.id)) out.push({ severity: "warning", message: `The theme ${t.name || t.id} has no core gold.` });
  for (const p of cat.example) {
    const b = cat.buffs.find((x) => x.id === p.buff);
    if (!b) err(`The example build names ${p.buff}, which isn't a buff.`);
    else if (b.tier === "gold" && p.count > b.ranks.length) err(`The example build has ${b.name} at rank ${p.count}, of ${b.ranks.length}.`);
  }
  // Rebalance 2: an extreme build past the clamp is fine; a typical one there, or outside its band, isn't
  const typical = exampleHit(cat);
  if (cat.example.length && typical.hit > cat.settings.damageCap)
    out.push({ severity: "warning", message: `The example build's hit on the reference (${Math.round(typical.hit).toLocaleString("en")}) passes the damage cap (${cat.settings.damageCap.toLocaleString("en")}): a typical build shouldn't reach it.` });
  const [low, high] = cat.typicalFactor;
  if (cat.example.length && (typical.factor < low || typical.factor > high))
    out.push({ severity: "warning", message: `The example build's factor ×${typical.factor.toFixed(1)} is outside the typical band ×${low}-${high}.` });
  return out;
}
