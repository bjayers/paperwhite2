// The files of a side in the new Rig Editor (rig-editor-v2.md, "Built: step 2"): <side>_rig_v2.json, written in the
// editor's compact layout with its fields in the schema's order, and the flat <side>_rig.json the build packs, always
// the source's bake. A side without a _rig_v2.json opens as its flat rig converted (convertToV2), in memory only: the
// file is made by the first edit, so opening and saving an untouched vanilla side writes nothing.

import { fromPlain, getIn, type JsonValue, type Layout } from "../../../shared/json.ts";
import { dataOf } from "./model.ts";
import { orderedV2, type V2 } from "./v2.ts";
import type { Rig } from "./mcss.ts";

export type Side = "front" | "back";

export const rigPathOf = (folder: string, side: Side) => `res/pokemon/${folder}/${side}_rig.json`;
export const v2PathOf = (folder: string, side: Side) => `res/pokemon/${folder}/${side}_rig_v2.json`;
/** The first editor's armature, which a side has instead of a _rig_v2.json (never both). */
export const armaturePathOf = (folder: string, side: Side) => `res/pokemon/${folder}/${side}_rig_source.json`;
export const V2_SCHEMA_PATH = "res/pokemon/battle_sprite_rig_v2.schema.json";
/** The source's layout: the flat rig's (datajson.dumps_compact), a key a line. */
export const V2_LAYOUT: Layout = { width: 120, indent: 2, compact: true };

/** The source's `$schema`, relative as the flat rig's beside it is. */
export const v2SchemaFor = (flatData: JsonValue | null) =>
  String((flatData && getIn(flatData, ["$schema"])) ?? "../battle_sprite_rig.schema.json").replace("battle_sprite_rig.schema.json", "battle_sprite_rig_v2.schema.json");

/** A source as its file's data: `$schema` first, then the fields in the schema's order. */
export function v2Data(src: V2, schema: unknown): JsonValue {
  const { $schema: _, ...rest } = orderedV2(src) as V2 & { $schema?: unknown };
  return fromPlain({ $schema: schema, ...rest });
}

/** The flat rig's file data for a baked rig, with the flat file's own `$schema`. */
export const flatData = (rig: Rig, flat: JsonValue | null) => dataOf(rig, flat ? getIn(flat, ["$schema"]) : undefined);
