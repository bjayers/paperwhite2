// A camera area's fields in the Overworld Editor's side panel: its file's form (cameras.schema.json) at the area, with
// angles in degrees, distances and offsets in units and the field of view as the whole vertical angle, and the
// preview: the game's camera at a point across the area, which the map shows in the DS's 4:3 frame.

import { useState } from "react";
import { documents } from "../../documents.ts";
import type { JsonPath, JsonValue } from "../../../shared/json.ts";
import type { Constants } from "../../../shared/schema.ts";
import { DocForm } from "../followers/DocForm.tsx";
import type { FormContext } from "../schema-form/form.tsx";
import { FX, degrees, fromDegrees, type CameraArea } from "./cameras.ts";

function NumberBox({ value, onChange }: { value: number; onChange(v: number): void }) {
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <input inputMode="decimal" className="ow-number-box" value={typed ?? String(Math.round(value * 100) / 100)}
           onChange={(e) => {
             const n = Number(e.target.value.trim());
             const ok = e.target.value.trim() !== "" && Number.isFinite(n);
             setTyped(ok ? null : e.target.value);
             if (ok) onChange(n);
           }}
           onBlur={() => setTyped(null)} />
  );
}

type Unit = { show(v: number): number; store(v: number): number; label: string };
const DEGREES: Unit = { show: degrees, store: fromDegrees, label: "°" };
const FOV: Unit = { show: (v) => 2 * degrees(v), store: (v) => fromDegrees(v / 2), label: "° high" };
const UNITS: Unit = { show: (v) => v / FX, store: (v) => Math.round(v * FX), label: "units" };
const PLAIN: Unit = { show: (v) => v, store: (v) => Math.round(v), label: "units" };

/** The unit a field of an area shows in, by its name. */
function unitOf(kind: string, field: string): Unit | null {
  if (field === "pitch" || field === "yaw" || field === "angle") return DEGREES;
  if (field === "fov") return FOV;
  if (field === "distance") return kind === "circle" ? PLAIN : UNITS;
  if (["target_offset", "radius", "center", "target", "position"].includes(field)) return UNITS;
  return null;
}

export function CameraPanel({ path, index, area, constants, onEdit, previewing, onPreview, t, onT }: {
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
}) {
  const render: FormContext["render"] = (at: JsonPath, value: JsonValue) => {
    if (at[0] !== "areas" || at[1] !== index || at.length < 4) return undefined;
    const kind = String(at[2]), field = String(at[3]);
    const unit = unitOf(kind, field);
    if (!unit) return undefined;
    const set = (sub: JsonPath, v: number) => { documents.edit(path, [...at, ...sub], unit.store(v)); onEdit(); };
    const box = (v: number, sub: JsonPath) => <NumberBox value={unit.show(v)} onChange={(n) => set(sub, n)} />;
    if (at.length === 4 && typeof value === "number") return <span className="ow-xyz">{box(value, [])} <span className="muted">{unit.label}</span></span>;
    if (at.length === 4 && Array.isArray(value)) {
      const pair = kind === "rect" || field === "angle" || field === "radius";
      return (
        <div className="row-control ow-xyz">
          {(value as JsonValue[]).map((v, i) => Array.isArray(v)
            ? <span key={i}>{pair ? (i ? "last row" : "first row") : ""} {(v as number[]).map((x, j) => <label key={j}>{"xyz"[j]} {box(x, [i, j])}</label>)}</span>
            : <label key={i}>{pair && value.length === 2 ? (kind === "rect" ? (i ? "last row" : "first row") : (i ? "to" : "from")) : "xyz"[i]} {box(v as number, [i])}</label>)}
          <span className="muted">{unit.label}</span>
        </div>
      );
    }
    return undefined;
  };
  return (
    <div>
      <div className="ow-panel-box">
        <label className="ow-check"><input type="checkbox" checked={previewing} onChange={(e) => onPreview(e.target.checked)} /> Preview the game's camera</label>
        {previewing && area.rect && (
          <label className="ow-inline" title="Where the player stands across the area: its first row to its last">
            first row <input type="range" min={0} max={1} step={0.01} value={t} onChange={(e) => onT(Number(e.target.value))} /> last row
          </label>
        )}
        <p className="muted ow-note">The map shows what the camera sees, in the DS's 4:3 frame, with the player on the area's middle
          {area.rect ? " column" : " angle"}. The game's 3D and lighting differ a little from the editor's.</p>
      </div>
      <DocForm key={`${path}:${index}`} path={path} at={["areas", index]} constants={constants} hideDescription flat render={render} onEdit={onEdit} />
    </div>
  );
}
