// The overworld's matrix as a grid (res/field/matrices/overworld.json): each zone's cells in a color of its own, filler
// cells (a chunk, no zone: the trees and sea around the areas) grey, empty cells blank; the picked cells yellow, the
// current zone's outlined. Hovering names a cell's zone, as White 2 plays it (Route 4's cells are route_4_16's).

import { useEffect, useState } from "react";
import { api } from "../../api.ts";
import { versionZones } from "../overworld/terrain.ts";

export interface OverworldCell { column: number; row: number; zone: string | null; map: string | null }

const hue = (zone: string) => [...zone].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 0);

export function OverworldGrid({ picked = [], current, freeOnly = false, onCell, hint }: {
  picked?: [number, number][];
  /** The zone whose cells are outlined. */
  current?: string | null;
  /** Only cells with no zone can be clicked (picking a new route's). */
  freeOnly?: boolean;
  onCell(cell: OverworldCell): void;
  hint?: string;
}) {
  const [matrix, setMatrix] = useState<{ maps: (string | null)[][]; zones: (string | null)[][] } | null>(null);
  const [hover, setHover] = useState("");
  useEffect(() => {
    Promise.all([api.file("res/field/matrices/overworld.json"), versionZones().catch(() => new Map<string, string>())]).then(([f, versioned]) => {
      const m = JSON.parse(f.text) as { maps: (string | null)[][]; zones: (string | null)[][] };
      setMatrix({ ...m, zones: m.zones.map((row) => row.map((z) => (z ? versioned.get(z) ?? z : z))) });
    }, () => setMatrix(null));
  }, []);
  if (!matrix) return <p className="muted ow-note">Reading the overworld…</p>;
  const isPicked = (c: number, r: number) => picked.some(([x, y]) => x === c && y === r);
  return (
    <>
      <div className="me-overworld" style={{ gridTemplateColumns: `repeat(${matrix.maps[0].length}, 1fr)` }} onMouseLeave={() => setHover("")}>
        {matrix.maps.map((row, r) => row.map((map, c) => {
          const zone = matrix.zones[r][c];
          return (
            <button key={`${c},${r}`} disabled={freeOnly && !!zone}
                    className={`me-ow-cell${isPicked(c, r) ? " picked" : ""}${map && !zone ? " filler" : ""}${zone && zone === current ? " current" : ""}`}
                    style={zone && !isPicked(c, r) ? { background: `hsl(${hue(zone)} 45% 55%)` } : undefined}
                    onMouseEnter={() => setHover(`${c},${r}: ${zone ? zone.replace(/^ZONE_/, "").toLowerCase() : map ? "filler (no zone)" : "empty"}`)}
                    onClick={() => onCell({ column: c, row: r, zone, map })} />
          );
        }))}
      </div>
      <p className="muted ow-note">{hover || hint || "Hover a cell to see what's there."}</p>
    </>
  );
}
