// The Map Editor's New Map dialog: one of the game's unused zones made a map of its own (tools/paperwhite2/new_map.py
// create): renamed, given a matrix of new chunks copied from a template chunk (the one chosen on the map), and the
// look and sound of the template's zone unless the dialog says otherwise.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import type { Constants } from "../../../shared/schema.ts";
import { OverworldGrid } from "./OverworldGrid.tsx";

type Unused = Awaited<ReturnType<typeof api.unusedZones>>[number];

export function NewMapDialog({ template, constants, onClose, onCreated, route }: {
  /** The chosen chunk's model constant, or null. */
  template: string | null;
  constants: Constants;
  onClose(): void;
  onCreated(file: string, models: string[]): void;
  /** Opens as a route of the overworld, with these cells picked. */
  route?: [number, number][];
}) {
  const [unused, setUnused] = useState<Unused[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState("");
  const [name, setName] = useState("");
  const [width, setWidth] = useState(1);
  const [height, setHeight] = useState(1);
  const [area, setArea] = useState("");
  const [parent, setParent] = useState("");
  const [copyProps, setCopyProps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"map" | "route">(route ? "route" : "map");
  const [cells, setCells] = useState<[number, number][]>(route ?? []);
  const [filler, setFiller] = useState("MAP_MODEL_OVERWORLD_2_MAP_OUTTREE");
  useEffect(() => {
    api.unusedZones().then((u) => { setUnused(u); if (u.length) setZone(u[0].zone); }, (e: Error) => setError(e.message));
  }, []);
  const names = (prefix: string) => [...constants.keys()].filter((k) => k.startsWith(prefix)).sort();
  const areas = useMemo(() => names("AREA_"), [constants]);
  const zones = useMemo(() => names("ZONE_"), [constants]);
  const valid = /^[a-z][a-z0-9_]*$/.test(name) && !constants.has(`ZONE_${name.toUpperCase()}`);
  const create = async () => {
    if (!template || !zone || !valid) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "route") {
        const made = await api.createRoute({ zone, name, template, cells, filler: filler || undefined, area: area || undefined, copyProps });
        onCreated(made.file, made.models);
      } else {
        const made = await api.createMap({ zone, name, template, width, height, area: area || undefined, parent: parent || undefined, copyProps });
        onCreated(made.file, made.models);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="ow-dialog me-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h4>New map</h4>
        <p className="muted ow-note">Takes one of the game's unused zones (empty leftovers no warp leads to and no code names) and makes it a
          map of its own, with a matrix of new chunks copied from a template. Its warps, events, scripts and text are the other
          editors' to fill.</p>
        <section className="me-section">
          <div className="me-row"><label>Zone to take</label>
            <select value={zone} onChange={(e) => setZone(e.target.value)} disabled={!unused}>
              {(unused ?? []).map((u) => <option key={u.zone} value={u.zone}>{u.file}{u.place ? ` (${u.place.replace(/^PLACE_/, "").toLowerCase()})` : ""}</option>)}
            </select>
          </div>
          <div className="me-row"><label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="route_24" />
          </div>
          {name && !valid && <p className="ow-error ow-note">Lower case letters, numbers and underscores, starting with a letter, and not a
            zone's name already.</p>}
          <p className="muted ow-note">The zone, its scripts and its text bank are renamed after it (ZONE_{name.toUpperCase() || "NAME"}).</p>
        </section>
        <section className="me-section">
          <h4>Where</h4>
          <label className="ow-check"><input type="radio" checked={kind === "map"} onChange={() => setKind("map")} /> A map of its own, which
            warps lead into (an interior, a cave, an island)</label>
          <label className="ow-check"><input type="radio" checked={kind === "route"} onChange={() => setKind("route")} /> A route on the
            overworld, beside the others, walked onto without a loading screen</label>
          {kind === "route" && (
            <>
              <OverworldGrid picked={cells} freeOnly onCell={({ column: c, row: r }) => setCells(
                cells.some(([x, y]) => x === c && y === r) ? cells.filter(([x, y]) => x !== c || y !== r) : [...cells, [c, r]])}
                hint={cells.length ? `Picked: ${cells.map(([c, r]) => `${c},${r}`).join(" ")}.` : undefined} />
              <div className="me-row"><label>Ring it with</label>
                <select value={filler} onChange={(e) => setFiller(e.target.value)}>
                  <option value="MAP_MODEL_OVERWORLD_2_MAP_OUTTREE">trees (outtree)</option>
                  <option value="MAP_MODEL_OVERWORLD_2_MAP_OUTTREE1">trees (outtree1)</option>
                  <option value="MAP_MODEL_OVERWORLD_2_MAP_OUTSEA">sea (outsea)</option>
                  <option value="">nothing</option>
                </select>
              </div>
              <p className="muted ow-note">Click empty or filler cells (no zone) beside a route or town. The field swaps zones as the player crosses
                into a cell, keeping the area (textures, lights) it warped in with, so use the neighbours' area. Empty cells around it get the
                filler, as the game rings its areas (the field draws nothing at an empty cell). The neighbour's edge chunk may need a path cut
                through it (Faces and Collision tabs).</p>
            </>
          )}
        </section>
        <section className="me-section">
          <h4>Chunks</h4>
          <div className="me-row"><label>Template</label>
            <span className="me-mono">{template ? template.replace(/^MAP_MODEL_/, "").toLowerCase() : "choose a chunk on the map first"}</span>
          </div>
          {kind === "map" && <div className="me-row"><label>Size</label>
            <span className="me-inline">
              <input type="number" min={1} max={8} value={width} className="me-number" onChange={(e) => setWidth(Number(e.target.value))} /> ×
              <input type="number" min={1} max={8} value={height} className="me-number" onChange={(e) => setHeight(Number(e.target.value))} /> chunks
            </span>
          </div>}
          <label className="ow-check"><input type="checkbox" checked={copyProps} onChange={(e) => setCopyProps(e.target.checked)} /> Copy the
            template's props (buildings, signs) too</label>
          <p className="muted ow-note">Each chunk starts as a copy of the template (its model and collision), to edit in the Faces, Collision and
            Tiles tabs; it packs after the game's chunks.</p>
        </section>
        <section className="me-section">
          <h4>Header</h4>
          <div className="me-row"><label>Area</label>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">the template's zone's</option>
              {areas.map((a) => <option key={a} value={a}>{a.replace(/^AREA_/, "").toLowerCase()}</option>)}
            </select>
          </div>
          {kind === "map" && <div className="me-row"><label>Parent</label>
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">itself (a map of its own)</option>
              {zones.map((z) => <option key={z} value={z}>{z.replace(/^ZONE_/, "").toLowerCase()}</option>)}
            </select>
          </div>}
          <p className="muted ow-note">The area gives the textures, lights and seasons; the parent, the town map's spot and the Pokédex's
            habitat (an interior names its town). The map type, BGM, weather, battle background and camera come from the template's zone;
            the zone's file changes them after.</p>
        </section>
        {error && <p className="ow-error ow-note">{error}</p>}
        <div className="ow-dialog-actions">
          <button className="primary" onClick={create} disabled={busy || !template || !zone || !valid || (kind === "route" && !cells.length)}>
            {busy ? "Making…" : kind === "route" ? "Make the route" : "Make the map"}</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
