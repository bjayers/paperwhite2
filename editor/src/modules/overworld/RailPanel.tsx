// A rail point's or line's fields in the Overworld Editor's side panel: the rail file's own form (rails.schema.json)
// at the point or line, a place in tiles for a point's position, and for a line its curve (straight, an arc in x and
// z, or in three dimensions, and the arc's center) and its length against what its shape measures.

import { ScrubNumber, type ScrubPhase } from "./ScrubNumber.tsx";
import { documents } from "../../documents.ts";
import type { JsonPath, JsonValue } from "../../../shared/json.ts";
import type { Constants } from "../../../shared/schema.ts";
import { DocForm } from "../followers/DocForm.tsx";
import type { FormContext } from "../schema-form/form.tsx";
import { RAIL_DIR_NAMES, measuredLength, type RailMap } from "./rails.ts";

const FX = 4096;
const TILE_FX = 16 * FX;

/** x, y and z in fx32 as tiles. */
function VecTiles({ value, onChange }: { value: number[]; onChange(v: number[], phase: ScrubPhase): void }) {
  return (
    <div className="row-control ow-xyz">
      {["X", "Height", "Z"].map((label, i) => (
        <ScrubNumber key={label} label={label} value={(value[i] ?? 0) / TILE_FX} step={0.05} digits={3}
                     onChange={(v, phase) => { const out = [...value]; out[i] = Math.round(v * TILE_FX); onChange(out, phase); }} />
      ))}
      <div className="hint">In tiles (the file keeps fx32, 65536 a tile).</div>
    </div>
  );
}

export function RailPanel({ rails, path, part, constants, onEdit, onConnect, connecting, onFitLength }: {
  rails: RailMap;
  /** The rail file, res/field/rails/<rails>/rails.json. */
  path: string;
  part: { type: "point" | "line"; index: number };
  constants: Constants;
  onEdit(): void;
  /** Starts a new line from this point: the next point clicked ends it. */
  onConnect(): void;
  connecting: boolean;
  onFitLength(length: number): void;
}) {
  const list = part.type === "point" ? "points" : "lines";
  // A drag's first change is a step for undo, the others amend it
  const change = (at: JsonPath, v: JsonValue, phase: ScrubPhase) => {
    if (phase === "end") return;
    if (phase === "move") { documents.amend(path, at, v); return; }
    documents.edit(path, at, v);
    onEdit();
  };
  const render: FormContext["render"] = (at: JsonPath, value: JsonValue) => {
    if (at[0] !== list || at[1] !== part.index) return undefined;
    if (part.type === "point" && at.length === 3 && at[2] === "pos" && Array.isArray(value))
      return <VecTiles value={value as number[]} onChange={(v, phase) => change(at, v, phase)} />;
    if (at.length === 3 && at[2] === "dir" && typeof value === "number")
      return (
        <select value={value} onChange={(e) => { documents.edit(path, at, Number(e.target.value)); onEdit(); }}>
          {RAIL_DIR_NAMES.map((n, i) => <option key={i} value={i}>{i}: {n}</option>)}
        </select>
      );
    return undefined;
  };
  const line = part.type === "line" ? rails.lines[part.index] : null;
  const curve = line ? rails.curves[line.curve] : null;
  const measured = line ? measuredLength(rails, part.index) : 0;
  const editCurve = (field: string, v: JsonValue, phase: ScrubPhase = "typed") => { if (line) change(["curves", line.curve, field], v, phase); };
  return (
    <div>
      {part.type === "point" && (
        <section className="ow-panel-box ow-section">
          <h5>Point <span className="muted">{part.index}</span></h5>
          <div className="ow-section-actions">
            <button onClick={onConnect} className={connecting ? "active" : ""}>{connecting ? "Click the line's other point…" : "New line from here"}</button>
            <span className="muted">Drag the point to move it at its height; its lines follow.</span>
          </div>
        </section>
      )}
      {line && (
        <section className="ow-panel-box ow-section">
          <h5>Line <span className="muted">{line.length} tiles</span></h5>
          <div className="ow-condition ow-event-rows">
            <span className="ow-condition-label">Length</span>
            <span className="ow-event-control">
              <span>{line.length} tiles; its shape measures {Math.round(measured * 10) / 10}</span>
              {Math.round(measured) !== line.length && Math.round(measured) > 0 && (
                <button onClick={() => onFitLength(Math.round(measured))} title="Sets the length and resizes the line's attributes, repeating its last row">
                  Set it to {Math.round(measured)}</button>
              )}
            </span>
            {curve && (
              <>
                <span className="ow-condition-label">Curve</span>
                <span className="ow-event-control">
                  <span className="view-switch">
                    {(["straight", "arc, flat", "arc in 3D"] as const).map((name, h) => (
                      <button key={h} className={curve.handler === h ? "active" : ""} onClick={() => editCurve("handler", h)}
                              title={h === 1 ? "an arc in x and z, its height blended" : undefined}>{name}</button>
                    ))}
                  </span>
                  <span className="muted hint">curve {line.curve}{curve.handler === 1 ? ": an arc in x and z, its height blended along it" : ""}</span>
                </span>
                {curve.handler !== 0 && (
                  <>
                    <span className="ow-condition-label">Center</span>
                    <VecTiles value={curve.center} onChange={(v, phase) => editCurve("center", v, phase)} />
                  </>
                )}
              </>
            )}
          </div>
        </section>
      )}
      <section className="ow-panel-box ow-section">
        <h5>{part.type === "point" ? "Point's fields" : "Line's fields"}</h5>
        <DocForm key={`${list}:${part.index}`} path={path} at={[list, part.index]} constants={constants} hideDescription flat render={render} onEdit={onEdit} />
      </section>
    </div>
  );
}
