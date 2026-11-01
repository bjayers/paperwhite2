// A camera area's fields in the Overworld Editor's side panel: its file's form (cameras.schema.json) at the area, with
// angles in degrees, distances and offsets in units and the field of view as the whole vertical angle, each a box
// whose label drags to change it while the preview follows; the way a rect blends (front to back along z, or left
// to right along x, which the game tells by a width of 1) and a swap of its two ends; and the preview: the game's
// camera at a point across the area, which the map shows in the DS's 4:3 frame.

import { documents } from "../../documents.ts";
import type { JsonPath, JsonValue } from "../../../shared/json.ts";
import { fromPlain } from "../../../shared/json.ts";
import type { Constants } from "../../../shared/schema.ts";
import { DocForm } from "../followers/DocForm.tsx";
import type { FormContext } from "../schema-form/form.tsx";
import { FX, degrees, fromDegrees, type CameraArea, type RectArea } from "./cameras.ts";
import { ScrubNumber, type ScrubPhase } from "./ScrubNumber.tsx";

type Unit = { show(v: number): number; store(v: number): number; label: string; step: number };
const DEGREES: Unit = { show: degrees, store: fromDegrees, label: "°", step: 0.25 };
const FOV: Unit = { show: (v) => 2 * degrees(v), store: (v) => fromDegrees(v / 2), label: "° high", step: 0.1 };
const UNITS: Unit = { show: (v) => v / FX, store: (v) => Math.round(v * FX), label: "units", step: 0.5 };
const PLAIN: Unit = { show: (v) => v, store: (v) => Math.round(v), label: "units", step: 0.5 };

/** The unit a field of an area shows in, by its name. */
function unitOf(kind: string, field: string): Unit | null {
  if (field === "pitch" || field === "yaw" || field === "angle") return DEGREES;
  if (field === "fov") return FOV;
  if (field === "distance") return kind === "circle" ? PLAIN : UNITS;
  if (["target_offset", "radius", "center", "target", "position"].includes(field)) return UNITS;
  return null;
}

/** A rect's size in tiles across x and z, whichever way it blends. */
export function rectSize(r: RectArea): { alongX: boolean; w: number; d: number } {
  return r.width === 1 ? { alongX: true, w: r.height, d: r.unk06 } : { alongX: false, w: r.width, d: r.height };
}

export function CameraPanel({ path, index, area, constants, onEdit, previewing, onPreview, t, onT, onDraw, drawing }: {
  /** The area file, res/field/cameras/areas/<zone>.json or rail_areas/<rails>.json. */
  path: string;
  index: number;
  area: CameraArea;
  constants: Constants;
  onEdit(): void;
  previewing: boolean;
  onPreview(on: boolean): void;
  /** Where across a rect area the preview stands: 0 its first row, 1 its last. */
  t: number;
  onT(t: number): void;
  /** Starts drawing the rect on the map. */
  onDraw(): void;
  drawing: boolean;
}) {
  // A drag's first change is a step for undo, the others amend it; the step is recorded when the drag ends
  const change = (at: JsonPath, v: JsonValue, phase: ScrubPhase) => {
    if (phase === "end") { onEdit(); return; }
    if (phase === "move") documents.amend(path, at, v);
    else documents.edit(path, at, v);
    if (phase === "typed") onEdit();
  };
  const render: FormContext["render"] = (at: JsonPath, value: JsonValue) => {
    if (at[0] !== "areas" || at[1] !== index || at.length < 4) return undefined;
    const kind = String(at[2]), field = String(at[3]);
    const unit = unitOf(kind, field);
    if (!unit) return undefined;
    const box = (v: number, sub: JsonPath, label: string) => (
      <ScrubNumber key={sub.join(".")} value={unit.show(v)} step={unit.step} label={label}
                   onChange={(n, phase) => change([...at, ...sub], unit.store(n), phase)} />
    );
    if (at.length === 4 && typeof value === "number") return <span className="ow-xyz">{box(value, [], unit.label)}</span>;
    if (at.length === 4 && Array.isArray(value)) {
      const ends = (i: number) => (kind === "rect" ? (i ? "last row" : "first row") : i ? "to" : "from");
      const pair = kind === "rect" || field === "angle" || field === "radius";
      return (
        <div className="row-control ow-xyz">
          {(value as JsonValue[]).map((v, i) => Array.isArray(v)
            ? <div key={i} className="ow-xyz"><span className="muted">{ends(i)}</span>{(v as number[]).map((x, j) => box(x, [i, j], "xyz"[j]))}</div>
            : box(v as number, [i], pair && value.length === 2 ? ends(i) : "xyz"[i]))}
          <span className="muted">{unit.label}</span>
        </div>
      );
    }
    return undefined;
  };
  const r = area.rect;
  const size = r ? rectSize(r) : null;
  /** The rect blending the other way: the same tiles, its two settings kept. */
  const setAlongX = (alongX: boolean) => {
    if (!r || !size || alongX === size.alongX) return;
    const base = ["areas", index, "rect"];
    if (alongX) {
      documents.edit(path, base, fromPlain({ ...r, width: 1, height: size.w, unk06: size.d }));
    } else {
      // Along z a width of 1 would read as along x, so the rect is at least 2 tiles wide
      documents.edit(path, base, fromPlain({ ...r, width: Math.max(2, size.w), height: size.d, unk06: 1 }));
    }
    onEdit();
  };
  const swapEnds = () => {
    if (!r) return;
    documents.edit(path, ["areas", index, "rect"], fromPlain({
      ...r, pitch: [r.pitch[1], r.pitch[0]], yaw: [r.yaw[1], r.yaw[0]], distance: [r.distance[1], r.distance[0]],
      target_offset: [r.target_offset[1], r.target_offset[0]], fov: [r.fov[1], r.fov[0]],
    }));
    onEdit();
  };
  return (
    <div>
      <div className="ow-panel-box ow-sticky">
        <label className="ow-check"><input type="checkbox" checked={previewing} onChange={(e) => onPreview(e.target.checked)} /> Preview the game's camera</label>
        {previewing && r && (
          <label className="ow-inline" title="Where the player stands across the area: its first row to its last">
            first row <input type="range" min={0} max={1} step={0.01} value={t} onChange={(e) => onT(Number(e.target.value))} /> last row
          </label>
        )}
        <p className="muted ow-note">The map shows what the camera sees, in the DS's 4:3 frame, with the player across the area's middle.
          Drag a value's label to change it and watch the preview. The game's 3D and lighting differ a little from the editor's.</p>
      </div>
      {r && size && (
        <div className="ow-panel-box">
          <p className="ow-note"><strong>{size.w} × {size.d} tiles</strong> from {r.x}, {r.z}.{" "}
            <button onClick={onDraw} className={drawing ? "active" : ""}>{drawing ? "Drag on the map…" : "Draw on the map"}</button></p>
          <label className="ow-inline" title="The camera blends from the first setting to the last as the player crosses the area this way">Blends
            <select value={size.alongX ? "x" : "z"} onChange={(e) => setAlongX(e.target.value === "x")}>
              <option value="z">front to back (north to south)</option>
              <option value="x">left to right (west to east)</option>
            </select>
          </label>{" "}
          {(() => {
            const same = JSON.stringify([r.pitch[0], r.yaw[0], r.distance[0], r.target_offset[0], r.fov[0]]) ===
              JSON.stringify([r.pitch[1], r.yaw[1], r.distance[1], r.target_offset[1], r.fov[1]]);
            return (
              <button onClick={swapEnds} disabled={same}
                      title={same ? "Both rows have the same camera, so there's nothing to swap yet: change one row's values first"
                        : "The other way round: the last row's camera at the first row and the first's at the last"}>Swap first and last</button>
            );
          })()}
          <p className="muted ow-note">On the map, the arrow runs from the first row (green edge) to the last (orange edge); drag the
            area to move it, or its edges and corners to resize it.</p>
        </div>
      )}
      <DocForm key={`${path}:${index}`} path={path} at={["areas", index]} constants={constants} hideDescription flat render={render} onEdit={onEdit} />
    </div>
  );
}
