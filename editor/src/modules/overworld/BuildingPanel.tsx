// A building's fields in the Overworld Editor's side panel: its prop (a model of the area's bundle, by ID), its place
// in tiles (half a tile is 0.5; the GLB keeps units from the chunk's center, 16 a tile) and its turn about y.

import { ScrubNumber, type ScrubPhase } from "./ScrubNumber.tsx";
import type { Entity } from "./entities.ts";
import { propsOf, type Prop } from "./props.ts";
import { TILE } from "./terrain.ts";

export function BuildingPanel({ entity, models, onChange, chunkSize }: {
  entity: Entity;
  /** The chunks' size in units (the map type's). */
  chunkSize: number;
  /** The area's bundle's models by prop ID: their folders. */
  models: Map<number, string>;
  onChange(prop: Prop, phase: ScrubPhase): void;
}) {
  const b = entity.building!;
  const prop = propsOf(b.chunk)[b.index];
  if (!prop) return null;
  // The chunk's center, in global units, from which the GLB places its props
  const cx = b.ux - prop.x, cz = b.uz - prop.z;
  const options = [...models.entries()].map(([id, folder]) => ({ id, name: folder.slice(folder.lastIndexOf("/") + 1) }))
    .sort((a, c) => a.name.localeCompare(c.name));
  const set = (change: Partial<Prop>, phase: ScrubPhase = "typed") => onChange({ ...prop, ...change }, phase);
  const turn = ((prop.angle % 360) + 360) % 360;
  return (
    <>
      <section className="ow-panel-box ow-section">
        <h5>Building <span className="muted">{b.model ? b.model.slice(b.model.lastIndexOf("/") + 1) : `prop ${prop.id}`}</span></h5>
        <div className="ow-condition ow-event-rows">
          <span className="ow-condition-label">Model</span>
          <span className="ow-event-control">
            <select value={models.has(prop.id) ? prop.id : -1} onChange={(e) => set({ id: Number(e.target.value) })}>
              {!models.has(prop.id) && <option value={-1}>{prop.id}: not in this area's bundle</option>}
              {options.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}
            </select>
            <span className="muted hint">a model of the area's prop bundle{b.model ? <>: <code>{b.model.replace(/^res\/field\/props\//, "")}</code></> : null}</span>
          </span>
          <span className="ow-condition-label">Prop ID</span>
          <span className="ow-event-control">
            <input inputMode="numeric" className="ow-number-box" value={prop.id}
              onChange={(e) => { const v = Number(e.target.value); if (Number.isInteger(v)) set({ id: Math.max(0, Math.min(65535, v)) }); }} />
            <span className="muted hint">the model's res_id, so the same ID shows another model in an area with another bundle</span>
          </span>
        </div>
      </section>
      <section className="ow-panel-box ow-section">
        <h5>Place <span className="muted">tile {Math.floor(b.ux / TILE)}, {Math.floor(b.uz / TILE)}</span></h5>
        <div className="ow-condition ow-event-rows">
          <span className="ow-condition-label">Tile</span>
          <span className="ow-xyz">
            <ScrubNumber label="X" value={b.ux / TILE} step={0.05} onChange={(v, phase) => set({ x: v * TILE - cx }, phase)} />
            <ScrubNumber label="Z" value={b.uz / TILE} step={0.05} onChange={(v, phase) => set({ z: v * TILE - cz }, phase)} />
            <span className="muted hint">on the zone's grid, half a tile is 0.5; within its chunk, {(cx - chunkSize / 2) / TILE} to {(cx + chunkSize / 2) / TILE} by{" "}
              {(cz - chunkSize / 2) / TILE} to {(cz + chunkSize / 2) / TILE}, since the game draws a prop with its chunk</span>
          </span>
          <span className="ow-condition-label">Height</span>
          <span className="ow-xyz">
            <ScrubNumber label="tiles" value={prop.y / TILE} step={0.05} onChange={(v, phase) => set({ y: v * TILE }, phase)} />
          </span>
        </div>
      </section>
      <section className="ow-panel-box ow-section">
        <h5>Turn <span className="muted">{Math.round(turn * 100) / 100}°</span></h5>
        <div className="ow-condition ow-event-rows">
          <span className="ow-condition-label">Turn</span>
          <span className="ow-xyz">
            <ScrubNumber label="°" value={prop.angle} step={0.5} onChange={(v, phase) => set({ angle: v }, phase)} />
            <span className="view-switch">
              {[0, 90, 180, 270].map((a) => <button key={a} className={Math.abs(turn - a) < 0.01 ? "active" : ""} onClick={() => set({ angle: a })}>{a}°</button>)}
            </span>
            <span className="muted hint">about its upright axis</span>
          </span>
        </div>
      </section>
      <p className="muted ow-note">Its collision isn't the prop's: the chunk's tiles under it block walking, so paint them (Paint, Blocked) when
        you move or add one. A sign is a building with a proxy on the tile in front of it.</p>
    </>
  );
}
