// What the Follower Editor reads: the followers' sprites and settings (each follower's field actor, a data.json with a
// "follower" object, under res/field/actors/followers/), their dialogue (res/paperwhite2/following/dialogue/), the
// item pools and the HeartGold interactions. docs/paperwhite2/following-pokemon.md describes them all.

import { api } from "../../api.ts";
import type { Constants } from "../../../shared/schema.ts";

export const FIELD_ACTOR_SCHEMA = "res/field/actors/field_actor.schema.json";
export const FOLLOWERS = "res/field/actors/followers";
export const FOLLOWING = "res/paperwhite2/following";
export const SHARED_DIALOGUE = `${FOLLOWING}/dialogue/shared.json`;
export const SPECIES_DIALOGUE = `${FOLLOWING}/dialogue/species`;
export const POOLS = `${FOLLOWING}/pools.json`;
export const INTERACTIONS = `${FOLLOWING}/interactions.json`;

/** One follower: a species' sprite for one form, sex and shininess. */
export interface Variant {
  /** Its folder under FOLLOWERS, such as "snivy_shiny". */
  name: string;
  path: string;
  species: string;
  form: number;
  sex: string;
  shiny: boolean;
  placeholder: boolean;
  /** Another object code whose sprite it shows, when it has none of its own. */
  sprite: string | null;
}

export interface FollowerSpecies {
  species: string;
  number: number;
  variants: Variant[];
  /** Its own dialogue file, when it has one. */
  dialogue: string | null;
}

export async function loadFollowers(constants: Constants): Promise<FollowerSpecies[]> {
  const [files, dialogues] = await Promise.all([
    api.data(FIELD_ACTOR_SCHEMA, ["follower", "sprite"]),
    api.list(`${SPECIES_DIALOGUE}/*.json`),
  ]);
  const bySpecies = new Map<string, FollowerSpecies>();
  for (const { path, data } of files) {
    const follower = data.follower as Record<string, unknown> | undefined;
    if (!follower || !path.startsWith(`${FOLLOWERS}/`)) continue;
    const species = String(follower.species);
    if (!bySpecies.has(species)) {
      bySpecies.set(species, { species, number: constants.get(species) ?? 0, variants: [], dialogue: null });
    }
    bySpecies.get(species)!.variants.push({
      name: path.slice(FOLLOWERS.length + 1, path.lastIndexOf("/")),
      path,
      species,
      form: Number(follower.form ?? 0),
      sex: String(follower.sex ?? ""),
      shiny: follower.shiny === true,
      placeholder: follower.placeholder === true,
      sprite: typeof data.sprite === "string" ? data.sprite : null,
    });
  }
  for (const entry of bySpecies.values()) {
    // The plain one first: by form, then not shiny before shiny, then male (or none) before female
    entry.variants.sort((a, b) => a.form - b.form || Number(a.shiny) - Number(b.shiny) ||
      Number(a.sex === "GENDER_FEMALE") - Number(b.sex === "GENDER_FEMALE"));
    const file = `${SPECIES_DIALOGUE}/${entry.species.replace(/^SPECIES_/, "").toLowerCase()}.json`;
    if (dialogues.includes(file)) entry.dialogue = file;
  }
  return [...bySpecies.values()].sort((a, b) => a.number - b.number);
}

/** A species' dialogue file's path, whether it exists or not. */
export function dialoguePath(species: string): string {
  return `${SPECIES_DIALOGUE}/${species.replace(/^SPECIES_/, "").toLowerCase()}.json`;
}

/** "SPECIES_MR_MIME" as "Mr Mime". */
export function speciesName(species: string): string {
  return species.replace(/^SPECIES_/, "").toLowerCase().split("_").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

/** What a variant is, in words: "Female, shiny", "Form 1". */
export function variantLabel(v: Variant): string {
  const parts = [v.form ? `Form ${v.form}` : "", v.sex === "GENDER_FEMALE" ? "Female" : "", v.shiny ? "Shiny" : ""].filter(Boolean);
  return parts.length ? parts.join(", ") : "Normal";
}

/** The follower folder whose sprite a variant shows: its own, or another follower's that it names
 * (OBJ_CODE_FOLLOWER_SNIVY is snivy's); null for another kind of object code's. */
export function spriteFolder(v: Variant): string | null {
  if (!v.sprite) return v.name;
  return v.sprite.startsWith("OBJ_CODE_FOLLOWER_") ? v.sprite.slice("OBJ_CODE_FOLLOWER_".length).toLowerCase() : null;
}
