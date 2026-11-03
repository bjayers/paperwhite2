// An ambient's side panel in the Overworld Editor (spawns.ts's Ambient, overworld.schema.json's ambient): its sprites
// with the sprite browser, its place with its height over the ground, its path with only the settings its kind reads,
// its shadow, its condition and its rolls, laid out as the NPCs' spawn panels are, and the whole record's form last.

import { useState } from "react";
import { documents } from "../../documents.ts";
import { fromPlain, type JsonValue } from "../../../shared/json.ts";
import type { Constants } from "../../../shared/schema.ts";
import { DocForm } from "../followers/DocForm.tsx";
import { constantLabel } from "../schema-form/form.tsx";
import { ModelPicker, SpriteImage } from "./fields.tsx";
import { ScrubNumber, type ScrubPhase } from "./ScrubNumber.tsx";
import { spawnRender } from "./SpawnPanel.tsx";
import { conditionSummary, type Ambient, type Rolls } from "./spawns.ts";

type Path = NonNullable<Ambient["path"]>;
type PathKind = Path["kind"];

// The packer's and the game's defaults (tools/paperwhite2/overworld.py, paperwhite2_ambients.c)
const DEFAULT_SPEED = 45;
const DEFAULT_EVERY = 4;
const DEFAULT_SIZE = 32;
const MAX_SPRITES = 4;
const UNITS_PER_TILE = 16;

const PATHS: { kind: PathKind; label: string; note: string }[] = [
  { kind: "perch", label: "Perch", note: "Sits at its place, turning and hopping now and then." },
  { kind: "hover", label: "Hover", note: "Bobs up and down at its place." },
  { kind: "ellipse", label: "Circle", note: "Goes round an ellipse of its width by its depth, a circle where they're the same." },
  { kind: "line", label: "Line", note: "Goes to a point its width east and its depth south, and back." },
  { kind: "eight", label: "Figure eight", note: "Goes round a figure eight its width wide and its depth deep." },
];
const FACINGS = [["DIR_UP", "↑", "Up"], ["DIR_DOWN", "↓", "Down"], ["DIR_LEFT", "←", "Left"], ["DIR_RIGHT", "→", "Right"]] as const;
const SHADOWS: { value: NonNullable<Ambient["shadow"]>; label: string; note: string }[] = [
  { value: "none", label: "None", note: "No shadow." },
  { value: "feet", label: "Under its feet", note: "At its own height, as on a branch or a railing it sits on." },
  { value: "ground", label: "On the ground", note: "On the highest ground below it, as for something flying." },
];

/** The object with key replaced by value in its place (or added last, or dropped where value is undefined), and the keys
 * in drop dropped, so the file keeps its order. */
function withKey(obj: Ambient, key: string, value: unknown, drop: string[] = []): Ambient {
  const out: Record<string, unknown> = {};
  let placed = false;
  for (const [k, v] of Object.entries(obj)) {
    if (drop.includes(k) && k !== key) {
      if (!placed && value !== undefined) { out[key] = value; placed = true; }
      continue;
    }
    if (k === key) { if (value !== undefined) out[k] = value; placed = true; continue; }
    out[k] = v;
  }
  if (!placed && value !== undefined) out[key] = value;
  return out as unknown as Ambient;
}

export function AmbientPanel({ path, index, ambient, constants, ground, used, onEdit }: {
  /** The zone's spawn file. */
  path: string;
  index: number;
  ambient: Ambient;
  constants: Constants;
  /** The ground's height under it, in units, where the map is loaded. */
  ground: number | null;
  /** The sprites the zone already has, which the browser marks. */
  used: ReadonlySet<string>;
  onEdit(): void;
}) {
  const [picking, setPicking] = useState<number | null>(null);
  const base = ["ambients", index];
  /** The ambient written whole: a drag's moves amend the step its start made. */
  const write = (next: Ambient, phase: ScrubPhase = "typed") => {
    if (phase === "end") return;
    if (phase === "move") { documents.amend(path, base, fromPlain(next) as JsonValue); return; }
    documents.edit(path, base, fromPlain(next));
    onEdit();
  };
  const set = (key: keyof Ambient, value: unknown, phase?: ScrubPhase) => write(withKey(ambient, key, value), phase);
  const p: Path = ambient.path ?? { kind: "perch" };
  const setPath = (next: Path, phase?: ScrubPhase) => set("path", next, phase);

  // One sprite is stored as sprite, a set as sprites
  const sprites = (ambient.sprites ?? (ambient.sprite !== undefined ? [ambient.sprite] : [])).map(String);
  const setSprites = (list: string[]) =>
    write(list.length === 1 ? withKey(ambient, "sprite", list[0], ["sprites"]) : withKey(ambient, "sprites", list, ["sprite"]));

  const over = ground !== null ? ambient.y - ground : null;
  const facing = typeof ambient.facing === "string" ? ambient.facing : "DIR_DOWN";
  const shadow = ambient.shadow ?? "none";
  const moving = p.kind !== "perch";
  const sized = p.kind === "ellipse" || p.kind === "line" || p.kind === "eight";
  const speed = p.speed ?? DEFAULT_SPEED;
  // The directions a perch turns to: all four when it names none
  const faces: string[] = p.faces?.length ? p.faces.map(String) : FACINGS.map(([d]) => d);

  return (
    <>
      <section className="ow-panel-box ow-section">
        <h5>Ambient <span className="muted">{sprites.length > 1 ? `one of ${sprites.length} sprites` : "one sprite"}</span></h5>
        <div className="ow-condition">
          <span className="ow-condition-label">Name</span>
          <input value={ambient.name ?? ""} placeholder={`Ambient ${index + 1}`} onChange={(e) => set("name", e.target.value || undefined)} />
          <span className="ow-condition-label">Sprites</span>
          <div className="ow-ambient-sprites">
            {sprites.map((m, i) => (
              <div key={i} className="ow-ambient-sprite">
                <SpriteImage model={m} direction={facing} size={40} />
                <span className="ow-ambient-sprite-name" title={m}>{constantLabel(m, "OBJ_CODE_").replace(/^Pokemon /, "")}</span>
                <span className="ow-ambient-sprite-actions">
                  <button onClick={() => setPicking(i)} title="Choose by sprite">Browse…</button>
                  {sprites.length > 1 && <button className="icon" title="Remove from the set" onClick={() => setSprites(sprites.filter((_, k) => k !== i))}>×</button>}
                </span>
              </div>
            ))}
            {sprites.length < MAX_SPRITES && (
              <button className="ow-ambient-add" onClick={() => setPicking(sprites.length)} title="Add a sprite to the set">+ Add a sprite</button>
            )}
          </div>
          {sprites.length > 1 && (
            <><span /><span className="muted ow-note">It shows one of these, picked by its roll (Rolls, below), so the pick holds as long as the roll does.</span></>
          )}
          <span className="ow-condition-label">Facing</span>
          <span className="ow-xyz">
            <span className="view-switch">
              {FACINGS.map(([v, arrow, l]) => <button key={v} className={facing === v ? "active" : ""} title={l} onClick={() => set("facing", v)}>{arrow}</button>)}
            </span>
            <span className="muted">{FACINGS.find(([v]) => v === facing)?.[2]}, where its path doesn't turn it</span>
          </span>
        </div>
      </section>

      <section className="ow-panel-box ow-section">
        <h5>Place <span className="muted">tile {ambient.x}, {ambient.z}{over !== null ? `, ${tiles(over / UNITS_PER_TILE)} over the ground` : ""}</span></h5>
        <div className="ow-condition">
          <span className="ow-condition-label">Tile</span>
          <span className="ow-xyz">
            <ScrubNumber label="X" value={ambient.x} step={0.1} digits={0} onChange={(n, ph) => set("x", clamp(Math.round(n), 0, 65535), ph)} />
            <ScrubNumber label="Z" value={ambient.z} step={0.1} digits={0} onChange={(n, ph) => set("z", clamp(Math.round(n), 0, 65535), ph)} />
            <span className="muted hint">or drag it on the map</span>
          </span>
          <span className="ow-condition-label">In the tile</span>
          <span className="ow-xyz">
            <ScrubNumber label="X" value={ambient.offset?.x ?? 0} step={0.1} digits={1}
                         onChange={(n, ph) => set("offset", offsetWith(ambient.offset, "x", n), ph)} />
            <ScrubNumber label="Z" value={ambient.offset?.z ?? 0} step={0.1} digits={1}
                         onChange={(n, ph) => set("offset", offsetWith(ambient.offset, "z", n), ph)} />
            <span className="muted hint">units from the tile's middle, −8 to 8 (16 a tile)</span>
          </span>
          <span className="ow-condition-label">Height</span>
          <span className="ow-xyz">
            {over !== null ? (
              <>
                <ScrubNumber label="tiles" value={over / UNITS_PER_TILE} step={0.01} digits={2}
                             onChange={(n, ph) => set("y", clamp(Math.round(ground! + n * UNITS_PER_TILE), -2048, 2048), ph)} />
                <span className="muted hint" title="The file stores its height in the world, in units">over the ground under it (stored as {ambient.y} units in the world)</span>
              </>
            ) : (
              <>
                <ScrubNumber label="units" value={ambient.y} step={0.2} digits={0}
                             onChange={(n, ph) => set("y", clamp(Math.round(n), -2048, 2048), ph)} />
                <span className="muted hint">in the world (16 a tile); the map isn't loaded to give the ground's</span>
              </>
            )}
          </span>
        </div>
      </section>

      <section className="ow-panel-box ow-section">
        <h5>Movement <span className="muted">{PATHS.find((k) => k.kind === p.kind)?.label}</span></h5>
        <div className="ow-section-actions">
          <span className="view-switch">
            {PATHS.map((k) => (
              <button key={k.kind} className={p.kind === k.kind ? "active" : ""} title={k.note}
                      onClick={() => setPath(clean(k.kind === "perch" ? { kind: "perch", every: p.every, turns: p.turns, hops: p.hops, faces: p.faces }
                        : { kind: k.kind, width: k.kind === "hover" ? undefined : p.width ?? DEFAULT_SIZE,
                            depth: k.kind === "hover" ? undefined : p.depth ?? DEFAULT_SIZE, speed: p.speed, start: p.start }))}>
                {k.label}
              </button>
            ))}
          </span>
        </div>
        <p className="muted ow-note">{PATHS.find((k) => k.kind === p.kind)?.note}</p>
        <div className="ow-condition">
          {p.kind === "perch" && (
            <>
              <span className="ow-condition-label">Every</span>
              <span className="ow-xyz">
                <ScrubNumber label="seconds" value={p.every ?? DEFAULT_EVERY} step={0.05} digits={0}
                             onChange={(n, ph) => setPath(clean({ ...p, every: clamp(Math.round(n), 1, 600) }), ph)} />
                <span className="muted hint">about how often it turns or hops</span>
              </span>
              <span className="ow-condition-label">It</span>
              <span className="ow-xyz">
                <label className="ow-check"><input type="checkbox" checked={p.turns ?? true}
                  onChange={(e) => setPath(clean({ ...p, turns: e.target.checked ? undefined : false }))} /> turns</label>
                <label className="ow-check"><input type="checkbox" checked={p.hops ?? true}
                  onChange={(e) => setPath(clean({ ...p, hops: e.target.checked ? undefined : false }))} /> hops</label>
              </span>
              {(p.turns ?? true) && (
                <>
                  <span className="ow-condition-label">Turns to</span>
                  <span className="ow-xyz">
                    <span className="view-switch">
                      {FACINGS.map(([v, arrow, l]) => {
                        const on = faces.includes(v);
                        return (
                          <button key={v} className={on ? "active" : ""} title={on && faces.length === 1 ? `${l}: it turns to one direction at least` : l}
                                  onClick={() => {
                                    if (on && faces.length === 1) return;
                                    const next = FACINGS.map(([d]) => d).filter((d) => (d === v ? !on : faces.includes(d)));
                                    setPath(clean({ ...p, faces: next.length === FACINGS.length ? undefined : next }));
                                  }}>{arrow}</button>
                        );
                      })}
                    </span>
                    <span className="muted hint">{faces.length === FACINGS.length ? "any direction" : `only ${faces.map((d) => FACINGS.find(([v]) => v === d)?.[2].toLowerCase()).join(" and ")}`}</span>
                  </span>
                </>
              )}
            </>
          )}
          {sized && (
            <>
              <span className="ow-condition-label">Size</span>
              <span className="ow-xyz">
                <ScrubNumber label="wide" value={(p.width ?? 0) / UNITS_PER_TILE} step={0.02} digits={2}
                             onChange={(n, ph) => setPath({ ...p, width: clamp(Math.round(n * UNITS_PER_TILE), 0, 1024) }, ph)} />
                <ScrubNumber label="deep" value={(p.depth ?? 0) / UNITS_PER_TILE} step={0.02} digits={2}
                             onChange={(n, ph) => setPath({ ...p, depth: clamp(Math.round(n * UNITS_PER_TILE), 0, 1024) }, ph)} />
                <span className="muted hint">in tiles</span>
              </span>
            </>
          )}
          {moving && (
            <>
              <span className="ow-condition-label">Speed</span>
              <span className="ow-xyz">
                <ScrubNumber label="° a second" value={speed} step={0.5} digits={0}
                             onChange={(n, ph) => setPath(clean({ ...p, speed: clamp(Math.round(n), 0, 3600) }), ph)} />
                <span className="muted hint">{speed > 0 ? `${fmt(360 / speed)} seconds ${p.kind === "hover" ? "a bob" : "a lap"}` : "still"}</span>
              </span>
              <span className="ow-condition-label">Starts at</span>
              <span className="ow-xyz">
                <ScrubNumber label="°" value={p.start ?? 0} step={1} digits={0}
                             onChange={(n, ph) => setPath(clean({ ...p, start: ((Math.round(n) % 360) + 360) % 360 }), ph)} />
                <span className="muted hint">where on its path it begins</span>
              </span>
            </>
          )}
        </div>
      </section>

      <section className="ow-panel-box ow-section">
        <h5>Shadow <span className="muted">{SHADOWS.find((s) => s.value === shadow)?.label}</span></h5>
        <div className="ow-section-actions">
          <span className="view-switch">
            {SHADOWS.map((s) => (
              <button key={s.value} className={shadow === s.value ? "active" : ""} title={s.note}
                      onClick={() => set("shadow", s.value === "none" ? undefined : s.value)}>{s.label}</button>
            ))}
          </span>
        </div>
        <p className="muted ow-note">{SHADOWS.find((s) => s.value === shadow)?.note}</p>
      </section>

      <section className="ow-panel-box ow-section">
        <h5>Appears <span className="muted">{conditionSummary(ambient.when)}</span></h5>
        <div className="ow-section-actions">
          {ambient.when
            ? <button onClick={() => set("when", undefined)}>Remove the condition</button>
            : <button onClick={() => set("when", { time: ["morning", "day", "evening"] })}>Add a condition</button>}
          <span className="muted">The zone shows the first 8 whose conditions hold, in the list's order.</span>
        </div>
        {ambient.when && (
          <DocForm key={`${path}:ambient:${index}:when`} path={path} at={[...base, "when"]} constants={constants} hideDescription flat
                   render={spawnRender(undefined)} onEdit={onEdit} />
        )}
      </section>

      <section className="ow-panel-box ow-section">
        <h5>Rolls</h5>
        <div className="ow-condition">
          <span className="ow-condition-label">Hold for</span>
          <select value={ambient.rolls ?? "hour"} onChange={(e) => set("rolls", e.target.value === "hour" ? undefined : e.target.value as Rolls)}>
            <option value="hour">the hour</option>
            <option value="period">the time of day</option>
            <option value="day">the day</option>
            <option value="entry">each zone entry</option>
          </select>
        </div>
        <p className="muted ow-note">How long a chance in its condition, and its pick from its sprites, hold before they're rolled again. Ambients
          are picked at zone entry, and again after a battle or a menu.</p>
      </section>

      <details className="ow-panel-box ow-section">
        <summary className="muted">All fields</summary>
        <DocForm key={`${path}:ambient:${index}`} path={path} at={base} constants={constants} hideDescription flat
                 render={spawnRender(undefined)} onEdit={onEdit} />
      </details>

      {picking !== null && (
        <ModelPicker constants={constants} value={sprites[picking] ?? ""} used={used} onClose={() => setPicking(null)}
                     onPick={(m) => {
                       const list = [...sprites];
                       list[picking] = m;
                       setSprites(list);
                       setPicking(null);
                     }} />
      )}
    </>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const fmt = (n: number) => String(Math.round(n * 100) / 100);
const tiles = (n: number) => `${fmt(n)} ${fmt(n) === "1" ? "tile" : "tiles"}`;

/** A path without the fields at their defaults, so the file holds only what was set. */
function clean(p: Path): Path {
  const out = { ...p } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) if (v === undefined) delete out[k];
  if (out.every === DEFAULT_EVERY) delete out.every;
  if (out.speed === DEFAULT_SPEED) delete out.speed;
  if (out.start === 0) delete out.start;
  return out as Path;
}

/** The offset with one axis changed, clamped to the tile; without it where both are 0. */
function offsetWith(offset: Ambient["offset"], axis: "x" | "z", n: number): Ambient["offset"] | undefined {
  const next = { x: offset?.x ?? 0, z: offset?.z ?? 0, [axis]: clamp(Math.round(n * 10) / 10, -8, 8) };
  return next.x === 0 && next.z === 0 ? undefined : next;
}
