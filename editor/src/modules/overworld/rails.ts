// The rails of a zone without a grid (Castelia City's streets, Skyarrow Bridge): ZONE_RAIL_ASSIGNMENTS
// (src/system/zonedata.c) gives the zone a rail map of res/field/rails/maps.json, which names its rail directory
// (res/field/rails/<rails>/: rails.json's points, lines and curves, and each line's tile attributes in
// attributes/line_NN.csv). Read from src/ov036/field_rail.c, field_rail_func.c and rail_attr.c:
//
// - A place on the rails is a line, front (whole tiles from its point_a toward point_b, 0 to length - 1) and side
//   (whole tiles across, signed, 0 the middle). The events give NPCs, warps, triggers and proxies such places
//   ("component" is the line).
// - Its spot in the world, t = front / length: a straight line (curve handler 0) is A + t(B - A), side along
//   normalize(-d.z, 0, d.x); an arc (handler 1) turns about the curve's center in x and z with the radius and height
//   blended linearly, side along the radius, signed to the chord's side; handler 2 is the same arc in three
//   dimensions. 16 units a side tile.
// - The width at a front: each end point's half width for the line (in sixteenths of a tile), blended along it; a
//   side is on the rail while |side * 16| <= the width.
// - The attributes: a row per front, a column per side (column = side + columns / 2), each a tile type as on a grid.

import { api } from "../../api.ts";

const NONE = 65535;
const FX = 4096;
const SIDE_UNITS = 16;

export interface RailPoint { name: string; lines: number[]; dirs: number[]; widths: number[]; pos: number[]; camera: number }
export interface RailLine { name: string; point_a: number; point_b: number; dir: number; curve: number; camera: number; length: number }
export interface RailCurve { handler: number; center: number[] }

export interface RailMap {
  /** The rail directory, res/field/rails/<name>. */
  folder: string;
  points: RailPoint[];
  lines: RailLine[];
  curves: RailCurve[];
  /** Each line's attributes: its CSV's path, rows by front, columns by side. */
  attributes: { path: string; rows: number[][] }[];
}

export interface RailPlace { line: number; front: number; side: number }

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V): V => { const l = len(a); return l ? mul(a, 1 / l) : [0, 0, 0]; };
const units = (p: number[]): V => [p[0] / FX, p[1] / FX, p[2] / FX];

/** The direction between two directions at t, as the game's slerp of unit vectors. */
function slerp(a: V, b: V, t: number): V {
  const na = norm(a), nb = norm(b);
  const theta = Math.acos(Math.max(-1, Math.min(1, na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2])));
  const s = Math.sin(theta);
  if (!s) return nb;
  return norm(add(mul(na, Math.sin((1 - t) * theta) / s), mul(nb, Math.sin(t * theta) / s)));
}

/** A place on a line in the world, in units: front and side may be fractions (a tile's corners). */
export function railToWorld(rails: RailMap, line: number, front: number, side: number): V | null {
  const l = rails.lines[line];
  const a = rails.points[l?.point_a], b = rails.points[l?.point_b];
  if (!l || !a || !b || !l.length) return null;
  const A = units(a.pos), B = units(b.pos);
  const t = front / l.length;
  const off = side * SIDE_UNITS;
  const curve = rails.curves[l.curve];
  const handler = curve?.handler ?? 0;
  if (handler === 0 || !curve) {
    const d = sub(B, A);
    return add(add(A, mul(d, t)), mul(norm([-d[2], 0, d[0]]), off));
  }
  const center = units(curve.center);
  const flat = handler === 1;
  const y = A[1] + (B[1] - A[1]) * t;
  const C: V = flat ? [center[0], y, center[2]] : center;
  const ra = sub(A, C), rb = sub(B, C);
  if (flat) { ra[1] = 0; rb[1] = 0; }
  const r = mul(slerp(ra, rb, t), len(ra) + (len(rb) - len(ra)) * t);
  const P = add(C, r);
  let s: V = flat ? norm(r) : r[0] !== 0 && r[2] !== 0 ? norm([r[0], 0, r[2]]) : norm(((d) => [-d[2], 0, d[0]] as V)(sub(B, A)));
  const chord = norm(sub(rb, ra));
  const cy = s[2] * chord[0] - s[0] * chord[2];
  if (cy < 0) s = mul(s, -1);
  return add(P, mul(s, off));
}

/** A line's half width at a front, in sixteenths of a tile (GetLerpedLineWidthByLineYPos). */
export function widthAt(rails: RailMap, line: number, front: number): number {
  const l = rails.lines[line];
  const widthOf = (p: RailPoint | undefined) => {
    const slot = p ? p.lines.indexOf(line) : -1;
    return slot >= 0 ? p!.widths[slot] : -1;
  };
  let wa = widthOf(rails.points[l.point_a]), wb = widthOf(rails.points[l.point_b]);
  if (wa < 0) wa = wb;
  if (wb < 0) wb = wa;
  const len16 = l.length * 16, d = len16 - 16;
  if (!d) return Math.max(0, wa);
  const f = Math.min(front * 16, d);
  return wa + Math.trunc(((wb - wa) * f) / d);
}

/** The sides of a line at a front that are on the rail. */
export function sidesAt(rails: RailMap, line: number, front: number): number[] {
  const w = Math.floor(widthAt(rails, line, front) / 16);
  return Array.from({ length: 2 * w + 1 }, (_, i) => i - w);
}

/** A place's tile type, from its line's attributes, or null off them. */
export function railTile(rails: RailMap, place: RailPlace): number | null {
  const rows = rails.attributes[place.line]?.rows;
  const row = rows?.[place.front];
  if (!row) return null;
  const v = row[place.side + Math.floor(row.length / 2)];
  return v === undefined ? null : v;
}

let assignments: Promise<Map<string, number>> | null = null;

/** ZONE_RAIL_ASSIGNMENTS: each zone with rails and its rail map's number. */
function railAssignments(): Promise<Map<string, number>> {
  if (!assignments) {
    assignments = Promise.all([
      api.scan("src/system/zonedata.c", "ZONE_RAIL_ASSIGNMENTS\\["),
      api.scan("src/system/zonedata.c", "\\{ ZONE_\\w+, \\d+ \\}"),
    ]).then(([starts, rows]) => {
      const start = starts[0]?.line ?? Infinity;
      const map = new Map<string, number>();
      let last = start;
      for (const { line, text } of rows) {
        if (line <= start || line > last + 1) continue;
        last = line;
        for (const m of text.matchAll(/\{ (ZONE_\w+), (\d+) \}/g)) map.set(m[1], Number(m[2]));
      }
      return map;
    });
    assignments.catch(() => { assignments = null; });
  }
  return assignments;
}

const parseRow = (line: string) => line.split(",").map((v) => (v.trim().startsWith("0x") ? parseInt(v, 16) : Number(v)));

/** The rails of a zone, or null for a zone on a grid. The attributes come from source when it has them (the
 * painter's unsaved text). */
export async function loadRails(zone: string, source?: (path: string) => string | null): Promise<RailMap | null> {
  const index = (await railAssignments()).get(`ZONE_${zone.toUpperCase()}`);
  if (index === undefined) return null;
  const maps = JSON.parse((await api.file("res/field/rails/maps.json")).text) as { maps: { rails: string }[] };
  const name = maps.maps[index]?.rails;
  if (!name) return null;
  const folder = `res/field/rails/${name}`;
  const data = JSON.parse((await api.file(`${folder}/rails.json`)).text) as { points: RailPoint[]; lines: RailLine[]; curves: RailCurve[] };
  const attributes = await Promise.all(data.lines.map(async (_, i) => {
    const path = `${folder}/attributes/line_${String(i).padStart(2, "0")}.csv`;
    const text = source?.(path) ?? (await api.file(path).then((f) => f.text, () => ""));
    return { path, rows: text.trim() ? text.trim().split("\n").map(parseRow) : [] };
  }));
  return { folder, points: data.points, lines: data.lines, curves: data.curves, attributes };
}

/** A line's attributes as their CSV writes them, with one tile's type changed from what it was. */
export function setRailTile(text: string, place: RailPlace, change: (type: number) => number): string {
  const lines = text.split("\n");
  const row = lines[place.front]?.split(",");
  if (!row) return text;
  const column = place.side + Math.floor(row.length / 2);
  if (column < 0 || column >= row.length) return text;
  const old = row[column].trim();
  row[column] = `0x${(change(old.startsWith("0x") ? parseInt(old, 16) : Number(old)) >>> 0).toString(16).padStart(8, "0")}`;
  lines[place.front] = row.join(",");
  return lines.join("\n");
}

/** The heights the rails' points are at, in units, lowest first: the levels the map can show one at a time. */
export function railLevels(rails: RailMap): number[] {
  return [...new Set(rails.points.map((p) => Math.round(p.pos[1] / FX)))].sort((a, b) => a - b);
}

/** Whether a line is at a level: either of its ends is (a ramp is at both of its ends' levels). */
export function lineAtLevel(rails: RailMap, line: number, level: number | null): boolean {
  if (level === null) return true;
  const l = rails.lines[line];
  return [l?.point_a, l?.point_b].some((p) => rails.points[p] && Math.round(rails.points[p].pos[1] / FX) === level);
}

export { NONE as RAIL_NONE };
