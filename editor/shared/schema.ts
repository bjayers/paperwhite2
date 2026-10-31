// The schemas' keywords, checked the way tools/data/datajson.py's validate() checks them, so the editor reports what
// the build would. The build's own Python check still runs on every save; this one is for feedback while editing.
// Keywords: type, properties, required, additionalProperties, items, prefixItems, minItems, maxItems, minimum,
// maximum, pattern, enum, anyOf, $ref to $defs, and the project's own x-constant (a string that must be a known
// constant with that prefix) and x-hex (a hex ID such as "0x03d0" is accepted too).

import { JsonFloat, type JsonPath, type JsonValue } from "./json.ts";

export interface Schema {
  $ref?: string;
  $defs?: Record<string, Schema>;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  prefixItems?: Schema[];
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  enum?: unknown[];
  anyOf?: Schema[];
  "x-constant"?: string;
  "x-hex"?: boolean;
  [key: string]: unknown;
}

export interface SchemaError {
  path: JsonPath;
  message: string;
}

/** The constants a value may name: every name in generated/ and include/constants/, with its value. */
export type Constants = ReadonlyMap<string, number>;

const HEX = /^0x[0-9a-fA-F]+$/;

/** A schema as a file names it in "$schema": its file, and the fragment after "#" that names one of its definitions
 * ("condition.schema.json#/$defs/level_scaling"), or "" for the whole file. */
export function splitSchemaId(id: string): { file: string; fragment: string } {
  const at = id.indexOf("#");
  return at < 0 ? { file: id, fragment: "" } : { file: id.slice(0, at), fragment: id.slice(at + 1) };
}

/** The part of a schema file that a fragment names, as the build reads it (conditions.py's load_def): the definition,
 * with the file's $defs, which its $refs name. */
export function schemaPart(schema: Schema, fragment: string): Schema {
  if (!fragment) return schema;
  let at: unknown = schema;
  for (const key of fragment.replace(/^\//, "").split("/")) at = (at as Record<string, unknown> | undefined)?.[key];
  if (!at || typeof at !== "object") throw new Error(`The schema has no ${fragment}`);
  return { ...(at as Schema), $defs: { ...schema.$defs, ...(at as Schema).$defs } };
}

/** Follows a $ref to the root's $defs, as the build does: the target replaces the referring schema. Keeps the
 * referring schema's description, which the build ignores but an editor shows. */
export function resolve(schema: Schema, root: Schema): Schema {
  let at = schema;
  for (let depth = 0; at.$ref && depth < 32; depth++) {
    const target = root.$defs?.[at.$ref.replace(/^#\/\$defs\//, "")];
    if (!target) break;
    // The target's own $ref, if any, comes along and is followed next.
    at = { ...target, description: at.description ?? target.description, title: at.title ?? target.title };
  }
  return at;
}

function typeMatches(data: JsonValue, type: string): boolean {
  switch (type) {
    case "object":
      return data instanceof Map;
    case "array":
      return Array.isArray(data);
    case "string":
      return typeof data === "string";
    case "boolean":
      return typeof data === "boolean";
    case "integer":
      return typeof data === "number" && Number.isInteger(data);
    case "number":
      return typeof data === "number" || data instanceof JsonFloat;
    case "null":
      return data === null;
  }
  return false;
}

function equal(data: JsonValue, option: unknown): boolean {
  if (data instanceof JsonFloat) return data.value === option;
  if (data === null || typeof data !== "object") return data === option;
  return JSON.stringify(plain(data)) === JSON.stringify(option);
}

function plain(v: JsonValue): unknown {
  if (v instanceof JsonFloat) return v.value;
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [k, plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  return v;
}

const show = (v: JsonValue) => JSON.stringify(plain(v));

/** Every problem with data against schema. The build stops at its first; this lists them all, each with its path. */
export function validate(data: JsonValue, schema: Schema, constants: Constants, root: Schema = schema,
                         path: JsonPath = []): SchemaError[] {
  const errors: SchemaError[] = [];
  const fail = (message: string, at: JsonPath = path) => errors.push({ path: at, message });
  const s = resolve(schema, root);

  if (s.anyOf) {
    const attempts = s.anyOf.map((option) => validate(data, option, constants, root, path));
    if (!attempts.some((e) => !e.length)) {
      // Report the option that came closest, as the one most likely meant.
      const best = attempts.reduce((a, b) => (b.length < a.length ? b : a));
      errors.push(...best);
    }
  }
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeMatches(data, t))) {
      fail(`${show(data)} is not ${types.join(" or ")}`);
      return errors;
    }
  }
  if (s.enum && !s.enum.some((option) => equal(data, option))) fail(`${show(data)} is not one of ${JSON.stringify(s.enum)}`);
  if (data instanceof Map) {
    const properties = s.properties ?? {};
    for (const key of s.required ?? []) if (!data.has(key)) fail(`${key} is missing`);
    for (const [key, item] of data) {
      if (key in properties) errors.push(...validate(item, properties[key], constants, root, [...path, key]));
      else if (s.additionalProperties === false) fail(`${key} is not a field here`, [...path, key]);
    }
  }
  if (Array.isArray(data)) {
    if (data.length < (s.minItems ?? 0) || data.length > (s.maxItems ?? data.length))
      fail(`${data.length} items, not ${s.minItems ?? 0} to ${s.maxItems ?? "any"}`);
    const prefix = s.prefixItems ?? [];
    data.forEach((item, i) => {
      const itemSchema = i < prefix.length ? prefix[i] : s.items;
      if (itemSchema) errors.push(...validate(item, itemSchema, constants, root, [...path, i]));
    });
  }
  if (typeof data === "number" && Number.isInteger(data)) {
    if (data < (s.minimum ?? data) || data > (s.maximum ?? data))
      fail(`${data} is not from ${s.minimum ?? "any"} to ${s.maximum ?? "any"}`);
  }
  if (typeof data === "string") {
    if (s.pattern !== undefined && !pythonRegex(s.pattern).test(data)) fail(`"${data}" does not match ${s.pattern}`);
    const prefix = s["x-constant"];
    if (prefix && !(data.startsWith(prefix) && constants.has(data)) && !(s["x-hex"] && HEX.test(data)))
      fail(`"${data}" is not a known ${prefix}* constant`);
  }
  return errors;
}

const regexes = new Map<string, RegExp>();

/** The schemas' patterns are Python regular expressions; the ones in use mean the same in JavaScript. */
function pythonRegex(pattern: string): RegExp {
  let re = regexes.get(pattern);
  if (!re) regexes.set(pattern, (re = new RegExp(pattern, "u")));
  return re;
}
