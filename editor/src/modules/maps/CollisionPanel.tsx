// The Map Editor's Collision tab: the brush that a click or a drag on the map paints the chosen layer's tiles with: a
// tile type (a class of the game's and its flags), a flat height, or a whole tile copied with Alt+click; and whether
// a chunk's season variants are painted too where their tile was the same.

import { useEffect, useState } from "react";
import { FLAGS, tileClasses, type TileClass } from "./collision.ts";

export interface CollisionBrush {
  kind: "type" | "height" | "copy";
  tileClass: number;
  flags: number;
  /** In tiles, by halves. */
  heightTiles: number;
  /** The tile Alt+click picked, for the copy brush. */
  row: Record<string, number> | null;
  variants: boolean;
}

export function CollisionPanel({ brush, setBrush, layer, setLayer, layers, hasVariants }: {
  brush: CollisionBrush;
  setBrush(b: CollisionBrush): void;
  layer: number;
  setLayer(l: number): void;
  layers: number;
  hasVariants: boolean;
}) {
  const [classes, setClasses] = useState<TileClass[]>([]);
  useEffect(() => { tileClasses().then(setClasses, () => setClasses([])); }, []);
  const set = (part: Partial<CollisionBrush>) => setBrush({ ...brush, ...part });
  const known = classes.some((c) => c.value === brush.tileClass);
  return (
    <>
      <section className="me-section">
        <h4>Brush</h4>
        <div className="me-row"><label>Paints</label>
          <select value={brush.kind} onChange={(e) => set({ kind: e.target.value as CollisionBrush["kind"] })}>
            <option value="type">a tile type</option>
            <option value="height">a flat height</option>
            <option value="copy" disabled={!brush.row}>a copied tile{brush.row ? "" : " (Alt+click one)"}</option>
          </select>
        </div>
        {brush.kind === "type" && (
          <>
            <div className="me-row"><label>Class</label>
              <select value={brush.tileClass} onChange={(e) => set({ tileClass: Number(e.target.value) })}>
                {!known && <option value={brush.tileClass}>0x{brush.tileClass.toString(16)}</option>}
                {classes.map((c) => <option key={c.value} value={c.value}>{c.name} (0x{c.value.toString(16).padStart(2, "0")})</option>)}
              </select>
            </div>
            <div className="me-row"><label>Flags</label>
              <span className="me-inline me-wrap">
                {FLAGS.map((f) => (
                  <label key={f.bit} className="ow-check" title={f.title}>
                    <input type="checkbox" checked={(brush.flags & f.bit) !== 0}
                           onChange={(e) => set({ flags: e.target.checked ? brush.flags | f.bit : brush.flags & ~f.bit })} /> {f.label}
                  </label>
                ))}
              </span>
            </div>
            <p className="muted ow-note">The map shows the chosen class in yellow (all but the normal class). A tile's slope and height stay as
              they are.</p>
          </>
        )}
        {brush.kind === "height" && (
          <>
            <div className="me-row"><label>Height</label>
              <span className="me-inline"><input type="number" step={0.5} value={brush.heightTiles} className="me-number"
                                                  onChange={(e) => set({ heightTiles: Number(e.target.value) })} /> tiles</span>
            </div>
            <p className="muted ow-note">A flat tile at this height (the game's height table has every half tile from -10 to 10 but -8, and
              more); the tile's type stays as it is.</p>
          </>
        )}
        {brush.kind === "copy" && brush.row && (
          <p className="ow-note">Copies the picked tile whole: its type 0x{(brush.row.tile_type >>> 0).toString(16)}, its slope and its height (as a
            plane, so a ramp copied stays the same ramp only along its own line).</p>
        )}
        <p className="muted ow-note">Click or drag on the map to paint; Alt+click a tile to pick its type, height and the whole tile.
          Ctrl+Z undoes a stroke; Save writes the collision files.</p>
      </section>
      <section className="me-section">
        <h4>Where</h4>
        {layers > 1 ? (
          <div className="me-row"><label>Layer</label>
            <select value={layer} onChange={(e) => setLayer(Number(e.target.value))}>
              {Array.from({ length: layers }, (_, i) => <option key={i} value={i}>{i + 1}{i === 0 ? " (lower)" : " (upper)"}</option>)}
            </select>
          </div>
        ) : <p className="muted ow-note">The zone's chunks have one layer of collision.</p>}
        {layers > 1 && <p className="muted ow-note">A two-layer chunk (Virbank Complex, bridges over paths) has collision for what's under and
          what's over; the game takes the layer nearest the player's height.</p>}
        {hasVariants && (
          <label className="ow-check" title="Where a season replacement swaps a chunk, paint the same tile of its variants too, where it was the same as this one's">
            <input type="checkbox" checked={brush.variants} onChange={(e) => set({ variants: e.target.checked })} /> Paint the season variants too
            where their tile was the same
          </label>
        )}
      </section>
    </>
  );
}
