// JSON as res/ holds it, read and written without losing anything:
// - objects are Maps, so keys keep their order even when they look like numbers ("13", "14");
// - a number written with a point or exponent ("3.0", "4.8e-05") stays a JsonFloat, so it is written back the same;
// - writing follows tools/data/datajson.py's dumps(), so an unchanged file is saved byte for byte.

export class JsonFloat {
  constructor(readonly value: number) {}
}

export type JsonValue = null | boolean | number | string | JsonFloat | JsonValue[] | JsonMap;
export type JsonMap = Map<string, JsonValue>;
export type JsonPath = (string | number)[];

export class JsonSyntaxError extends Error {
  constructor(message: string, readonly offset: number) {
    super(message);
  }
}

/** Parses JSON text; throws JsonSyntaxError with the offset of the mistake. */
export function parseJson(text: string): JsonValue {
  let at = 0;
  const fail = (what: string): never => {
    throw new JsonSyntaxError(`${what} at line ${lineOf(text, at)}`, at);
  };
  const space = () => {
    while (at < text.length && " \t\r\n".includes(text[at])) at++;
  };
  const value = (): JsonValue => {
    space();
    const c = text[at];
    if (c === "{") {
      at++;
      const map: JsonMap = new Map();
      space();
      if (text[at] === "}") {
        at++;
        return map;
      }
      for (;;) {
        space();
        if (text[at] !== '"') fail("Expected a key");
        const key = string();
        space();
        if (text[at] !== ":") fail("Expected ':'");
        at++;
        map.set(key, value());
        space();
        if (text[at] === ",") {
          at++;
          continue;
        }
        if (text[at] === "}") {
          at++;
          return map;
        }
        fail("Expected ',' or '}'");
      }
    }
    if (c === "[") {
      at++;
      const list: JsonValue[] = [];
      space();
      if (text[at] === "]") {
        at++;
        return list;
      }
      for (;;) {
        list.push(value());
        space();
        if (text[at] === ",") {
          at++;
          continue;
        }
        if (text[at] === "]") {
          at++;
          return list;
        }
        fail("Expected ',' or ']'");
      }
    }
    if (c === '"') return string();
    if (text.startsWith("true", at)) return (at += 4), true;
    if (text.startsWith("false", at)) return (at += 5), false;
    if (text.startsWith("null", at)) return (at += 4), null;
    const number = /^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?/.exec(text.slice(at, at + 64));
    if (!number) return fail("Unexpected character");
    at += number[0].length;
    const n = Number(number[0]);
    return number[2] || number[3] ? new JsonFloat(n) : n;
  };
  const string = (): string => {
    at++;
    let out = "";
    for (;;) {
      const end = text.indexOf('"', at);
      const slash = text.indexOf("\\", at);
      if (end < 0) fail("Unterminated string");
      if (slash < 0 || slash > end) {
        out += text.slice(at, end);
        at = end + 1;
        return out;
      }
      out += text.slice(at, slash);
      at = slash + 1;
      const e = text[at++];
      const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
      if (e in simple) out += simple[e];
      else if (e === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(at, at + 4))) {
        out += String.fromCharCode(parseInt(text.slice(at, at + 4), 16));
        at += 4;
      } else fail("Bad escape");
    }
  };
  const result = value();
  space();
  if (at < text.length) fail("Unexpected text after the end");
  return result;
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

/** Python's repr() of a float, which json.dumps uses: shortest digits, ".0" on whole numbers, and an exponent
 * below 1e-4 or from 1e16, written with at least two digits ("1e-05"). */
export function pythonFloat(x: number): string {
  if (Number.isNaN(x)) return "NaN";
  if (!Number.isFinite(x)) return x > 0 ? "Infinity" : "-Infinity";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const abs = Math.abs(x);
  if (abs >= 1e-4 && abs < 1e16) {
    // JavaScript gives the same shortest digits; it uses an exponent only below 1e-6 or from 1e21.
    let s = abs < 1e-6 || abs >= 1e21 ? expandExponent(x) : String(x);
    if (!/[.e]/.test(s)) s += ".0";
    return s;
  }
  const [mantissa, exponent] = x.toExponential().split("e");
  const sign = exponent.startsWith("-") ? "-" : "+";
  const digits = exponent.replace(/^[-+]/, "");
  return `${mantissa}e${sign}${digits.padStart(2, "0")}`;
}

function expandExponent(x: number): string {
  // Only reached for 1e-4 <= |x| < 1e16, where String() never uses an exponent; kept for completeness.
  return x.toFixed(20).replace(/0+$/, "").replace(/\.$/, ".0");
}

function scalar(v: JsonValue): string {
  if (v instanceof JsonFloat) return pythonFloat(v.value);
  // JSON.stringify escapes strings as Python's json.dumps(ensure_ascii=False) does.
  return JSON.stringify(v);
}

function isScalar(v: JsonValue): boolean {
  return !(v instanceof Map) && !Array.isArray(v);
}

/** datajson.dumps(): four-space indents, an object with a field per line, and an array on one line when it only
 * holds numbers, strings and booleans and fits in the width. */
export function dumpJson(data: JsonValue, width = 120, indent = 0): string {
  if (Array.isArray(data) && data.length && data.every(isScalar)) {
    const oneLine = "[ " + data.map(scalar).join(", ") + " ]";
    if (indent + oneLine.length <= width) return oneLine;
  }
  if (isScalar(data)) return scalar(data);
  const inner = " ".repeat(indent + 4);
  if (data instanceof Map) {
    if (!data.size) return "{}";
    const items = [...data].map(([k, v]) => `${inner}${JSON.stringify(k)}: ${dumpJson(v, width, indent + 4)}`);
    return "{\n" + items.join(",\n") + "\n" + " ".repeat(indent) + "}";
  }
  const list = data as JsonValue[];
  if (!list.length) return "[]";
  return "[\n" + list.map((v) => inner + dumpJson(v, width, indent + 4)).join(",\n") + "\n" + " ".repeat(indent) + "]";
}

/** The widths the data tools write with: most use 120; map matrices are written on unlimited lines. */
export const KNOWN_WIDTHS = [120, Number.MAX_SAFE_INTEGER];

/** The width that writes this text back exactly, or null when none of the known layouts does. */
export function detectWidth(text: string, data: JsonValue): number | null {
  for (const width of KNOWN_WIDTHS) if (dumpJson(data, width) + "\n" === text) return width;
  return null;
}

/** File text for data: the layout plus the final newline that datajson.write() adds. */
export function fileText(data: JsonValue, width: number): string {
  return dumpJson(data, width) + "\n";
}

// ---------------------------------------------------------------- Immutable edits

export function getIn(data: JsonValue, path: JsonPath): JsonValue | undefined {
  let at: JsonValue | undefined = data;
  for (const key of path) {
    if (at instanceof Map) at = at.get(String(key));
    else if (Array.isArray(at)) at = at[Number(key)];
    else return undefined;
  }
  return at;
}

/** A copy of data with the value at path replaced, or removed when value is undefined; untouched branches are shared. */
export function setIn(data: JsonValue, path: JsonPath, value: JsonValue | undefined): JsonValue {
  if (!path.length) return value === undefined ? null : value;
  const [key, ...rest] = path;
  if (data instanceof Map) {
    const copy: JsonMap = new Map(data);
    const k = String(key);
    if (value === undefined && !rest.length) copy.delete(k);
    else copy.set(k, setIn(copy.get(k) ?? null, rest, value));
    return copy;
  }
  if (Array.isArray(data)) {
    const copy = data.slice();
    const i = Number(key);
    if (value === undefined && !rest.length) copy.splice(i, 1);
    else copy[i] = setIn(copy[i] ?? null, rest, value);
    return copy;
  }
  return data;
}

/** Plain JavaScript for a JsonValue (Maps to objects, floats to numbers), for display or for libraries. */
export function toPlain(v: JsonValue): unknown {
  if (v instanceof JsonFloat) return v.value;
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [k, toPlain(x)]));
  if (Array.isArray(v)) return v.map(toPlain);
  return v;
}

export function typeOf(v: JsonValue): "null" | "boolean" | "integer" | "number" | "string" | "array" | "object" {
  if (v === null) return "null";
  if (v instanceof JsonFloat) return "number";
  if (v instanceof Map) return "object";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v as "boolean" | "string";
}

export function numberOf(v: JsonValue): number | undefined {
  if (v instanceof JsonFloat) return v.value;
  return typeof v === "number" ? v : undefined;
}
