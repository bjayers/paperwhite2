// How the Overworld Editor's "Zone header" section lays out a zone's header (res/field/zones/<zone>.json,
// zone.schema.json): the fields in headed groups, by what they affect. The fields' kinds, limits, constants and
// descriptions come from the schema; this only says which group a key goes in and what its label is. A key the schema
// has that no group names lands in "Other", so a field added to the schema shows up with no change here.

import type { Schema } from "../../../shared/schema.ts";

export interface HeaderField {
  key: string;
  label: string;
  /** What the schema leaves unsaid, said after its description. */
  note?: string;
  /** A control of its own for the key (zoneHeaderPanel's), where the schema's alone would not do. */
  control?: "weather" | "bgm" | "fly" | "encounters";
}

export interface HeaderGroup {
  title: string;
  about: string;
  fields: HeaderField[];
}

export const HEADER_GROUPS: HeaderGroup[] = [
  { title: "Map and files", about: "What the zone loads", fields: [
    { key: "area", label: "Area" },
    { key: "matrix", label: "Map matrix", note: "The Map Editor edits its chunks." },
    { key: "scripts", label: "Scripts" },
    { key: "init_scripts", label: "Init scripts" },
    { key: "text", label: "Text bank", note: "The Text Editor edits its messages." },
    { key: "npc_cache", label: "NPC cache", note: "Which list of sprites the zone preloads; the bar above the map counts them against it." },
  ] },
  { title: "Place", about: "Its name on screen and what it belongs to", fields: [
    { key: "parent", label: "Parent zone" },
    { key: "place", label: "Place" },
    { key: "place_display", label: "Name shown" },
    { key: "name_icon", label: "Name icon" },
  ] },
  { title: "Sound", about: "The music", fields: [
    { key: "bgm", label: "Music", control: "bgm" },
    { key: "cycle_surf_bgm", label: "Bike and Surf music", note: "Whether cycling or surfing here plays the bike or Surf music instead of the zone's." },
  ] },
  { title: "Weather and look", about: "How the zone is drawn", fields: [
    { key: "weather", label: "Default weather", control: "weather" },
    { key: "projection", label: "Projection" },
    { key: "camera", label: "Camera", note: "Its camera areas are the Cameras tab's." },
    { key: "transition", label: "Entry effect" },
  ] },
  { title: "Battle", about: "Wild Pokémon and fights here", fields: [
    { key: "battle_bg", label: "Battle background" },
    { key: "encounters", label: "Encounter table", control: "encounters" },
    { key: "enc_slot", label: "Save slot" },
    { key: "easy_level", label: "Easy Mode level" },
  ] },
  { title: "Movement and travel", about: "What the player may do and where they land", fields: [
    { key: "map_type", label: "Map type", note: "Picks the loader and chunk size (MAP_CONFIGS in src/ov036/fieldmap.c); 16 is most zones'." },
    { key: "cycling", label: "Cycling" },
    { key: "escape_rope", label: "Escape Rope" },
    { key: "fly_from", label: "Fly from here" },
    { key: "fly", label: "Fly landing", control: "fly" },
    { key: "entralink_warp", label: "Entralink warp" },
    { key: "cam_bound", label: "Camera bound" },
  ] },
  { title: "Other", about: "Fields no group names", fields: [] },
];

/** The groups for a schema: its properties placed in the groups, and those no group names under "Other" (the group
 * is left out when empty). */
export function headerLayout(schema: Schema): HeaderGroup[] {
  const keys = Object.keys(schema.properties ?? {}).filter((k) => k !== "$schema");
  const named = new Set(HEADER_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
  const extra = keys.filter((k) => !named.has(k));
  return HEADER_GROUPS.map((g): HeaderGroup => ({
    ...g,
    fields: [
      ...g.fields.filter((f) => keys.includes(f.key)),
      ...(g.title === "Other" ? extra.map((key): HeaderField => ({
        key, label: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      })) : []),
    ],
  })).filter((g) => g.fields.length > 0);
}
