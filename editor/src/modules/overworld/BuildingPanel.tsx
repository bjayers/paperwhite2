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
  return (
    <div className="schema-form flw-form ow-building">
      {/* In an object, whose width the form's narrow layout follows */}
      <div className="object">
      <div className="row">
        <div className="row-label"><span>Model</span></div>
        <div className="row-control">
          <select value={models.has(prop.id) ? prop.id : -1} onChange={(e) => set({ id: Number(e.target.value) })}>
            {!models.has(prop.id) && <option value={-1}>{prop.id}: not in this area's bundle</option>}
            {options.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}
          </select>
          <div className="hint">A model of the area's prop bundle{b.model ? <>: <code>{b.model.replace(/^res\/field\/props\//, "")}</code></> : null}. The
            prop's ID is the model's res_id, so the same ID shows another model in an area with another bundle.</div>
        </div>
      </div>
      <div className="row">
        <div className="row-label"><span>Prop ID</span></div>
        <div className="row-control"><input inputMode="numeric" className="ow-number-box" value={prop.id}
          onChange={(e) => { const v = Number(e.target.value); if (Number.isInteger(v)) set({ id: Math.max(0, Math.min(65535, v)) }); }} /></div>
      </div>
      <div className="row">
        <div className="row-label"><span>Place</span></div>
        <div className="row-control ow-xyz">
          <ScrubNumber label="X" value={b.ux / TILE} step={0.05} onChange={(v, phase) => set({ x: v * TILE - cx }, phase)} />
          <ScrubNumber label="Z" value={b.uz / TILE} step={0.05} onChange={(v, phase) => set({ z: v * TILE - cz }, phase)} />
          <ScrubNumber label="Height" value={prop.y / TILE} step={0.05} onChange={(v, phase) => set({ y: v * TILE }, phase)} />
          <div className="hint">In tiles, X and Z on the zone's grid (half a tile is 0.5). The game draws a prop with its chunk, so keep it within
            the chunk: {(cx - chunkSize / 2) / TILE} to {(cx + chunkSize / 2) / TILE} by {(cz - chunkSize / 2) / TILE} to {(cz + chunkSize / 2) / TILE}.</div>
        </div>
      </div>
      <div className="row">
        <div className="row-label"><span>Turn</span></div>
        <div className="row-control ow-xyz">
          <ScrubNumber label="°" value={prop.angle} step={0.5} onChange={(v, phase) => set({ angle: v }, phase)} />
          {[0, 90, 180, 270].map((a) => <button key={a} className={Math.abs(((prop.angle % 360) + 360) % 360 - a) < 0.01 ? "active" : ""} onClick={() => set({ angle: a })}>{a}°</button>)}
        </div>
      </div>
      </div>
      <p className="muted ow-note">Its collision isn't the prop's: the chunk's tiles under it block walking, so paint them (Paint, Blocked) when
        you move or add one. A sign is a building with a proxy on the tile in front of it.</p>
    </div>
  );
}
