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
import { REACT_DEFAULTS, conditionSummary, type Ambient, type Reaction, type Rolls } from "./spawns.ts";

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
const REACTIONS: { kind: Reaction["kind"] | null; label: string; note: string }[] = [
  { kind: null, label: "None", note: "It stays whoever comes near." },
  { kind: "fly", label: "Fly away", note: "Up and away on its heading at its climb, its shadow on the ground, gone once it's far off." },
  { kind: "run", label: "Run away", note: "Away along the ground on its heading, gone once it's far off." },
  { kind: "hide", label: "Hide", note: "Down into the grass or the ground where it is." },
];
const EMOTES: { value: Reaction["emote"] | null; label: string; title: string }[] = [
  { value: null, label: "None", title: "No bubble" },
  { value: "exclamation", label: "!", title: "A \"!\", with its sound" },
  { value: "question", label: "?", title: "A \"?\"" },
  { value: "note", label: "♪", title: "A music note" },
  { value: "ellipsis", label: "…", title: "\"...\"" },
];
// The compass points of a heading, by eighths clockwise from north
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
// The offsets of a tile's middle, edges and corners, in units (as the record's x and z: east and south)
const SPOTS = [[-8, -8, "↖"], [0, -8, "↑"], [8, -8, "↗"], [-8, 0, "←"], [0, 0, "•"], [8, 0, "→"], [-8, 8, "↙"], [0, 8, "↓"], [8, 8, "↘"]] as const;

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
            <span className="muted hint">units from the tile's middle, −8 to 8 (16 a tile): 8 is the edge, so a corner sits between
              four tiles, as on top of a 2×2 tree</span>
            <span className="ow-offset-grid" title="Its tile's middle, an edge or a corner">
              {SPOTS.map(([ox, oz, arrow]) => (
                <button key={`${ox},${oz}`} className={(ambient.offset?.x ?? 0) === ox && (ambient.offset?.z ?? 0) === oz ? "active" : ""}
                        onClick={() => set("offset", ox === 0 && oz === 0 ? undefined : { x: ox, z: oz })}>{arrow}</button>
              ))}
            </span>
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
              {p.kind === "line" && (
                <>
                  <span className="ow-condition-label">Climbs</span>
                  <span className="ow-xyz">
                    <ScrubNumber label="up" value={(p.height ?? 0) / UNITS_PER_TILE} step={0.02} digits={2}
                                 onChange={(n, ph) => setPath(clean({ ...p, height: clamp(Math.round(n * UNITS_PER_TILE), 0, 1024) || undefined }), ph)} />
                    <span className="muted hint">tiles up on the way to its far end, and down on the way back: with no width or depth,
                      straight up, as up a cliff</span>
                  </span>
                </>
              )}
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

      <ReactionSection reaction={ambient.react} constants={constants} used={used} sprite={sprites[0] ?? ""}
                       onChange={(r, ph) => set("react", r, ph)} />

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

/** The species an object code shows, by its name (OBJ_CODE_POKEMON_PIDOVE, OBJ_CODE_FOLLOWER_PIDOVE_FEMALE_SHINY), where
 * the constants have it. */
function speciesOfSprite(sprite: string, constants: Constants): string | null {
  const m = /^OBJ_CODE_(?:POKEMON|FOLLOWER)_(.+?)(?:_FEMALE)?(?:_SHINY)?$/.exec(sprite);
  return m && constants.has(`SPECIES_${m[1]}`) ? `SPECIES_${m[1]}` : null;
}

/** An ambient's reaction to the player coming near: what it does, when, which way, as what, and whether it returns. */
function ReactionSection({ reaction, constants, used, sprite, onChange }: {
  reaction: Reaction | undefined;
  constants: Constants;
  used: ReadonlySet<string>;
  /** Its own (first) sprite, for its cry's species. */
  sprite: string;
  onChange(reaction: Reaction | undefined, phase?: ScrubPhase): void;
}) {
  const [picking, setPicking] = useState(false);
  const r = reaction;
  /** One setting changed, its default left out. */
  const set = (key: keyof Reaction, value: unknown, phase?: ScrubPhase) => {
    if (!r) return;
    const next = { ...r } as Record<string, unknown>;
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next as unknown as Reaction, phase);
  };
  const choice = REACTIONS.find((k) => k.kind === (r?.kind ?? null))!;
  const near = r?.near ?? REACT_DEFAULTS.near;
  const startle = r?.startle ?? near + REACT_DEFAULTS.startleMore;
  const spread = r?.spread ?? REACT_DEFAULTS.spread;
  const heading = r?.direction;
  const cry = typeof r?.cry === "string" ? r.cry : null;
  const reactSprite = typeof r?.sprite === "string" ? r.sprite : null;
  const own = speciesOfSprite(sprite, constants);
  return (
    <section className="ow-panel-box ow-section">
      <h5>Reaction <span className="muted">{r ? `${choice.label.toLowerCase()} within ${near} ${near === 1 ? "tile" : "tiles"}` : "none"}</span></h5>
      <div className="ow-section-actions">
        <span className="view-switch">
          {REACTIONS.map((k) => (
            <button key={k.label} className={(r?.kind ?? null) === k.kind ? "active" : ""} title={k.note}
                    onClick={() => onChange(k.kind ? { ...(r ?? {}), kind: k.kind } : undefined)}>{k.label}</button>
          ))}
        </span>
      </div>
      <p className="muted ow-note">{choice.note}</p>
      {r && (
        <div className="ow-condition">
          <span className="ow-condition-label">When</span>
          <span className="ow-xyz">
            <ScrubNumber label="within" value={near} step={0.05} digits={0}
                         onChange={(n, ph) => set("near", clamp(Math.round(n), 1, 15) === REACT_DEFAULTS.near ? undefined : clamp(Math.round(n), 1, 15), ph)} />
            <ScrubNumber label="running or cycling" value={startle} step={0.05} digits={0}
                         onChange={(n, ph) => set("startle", clamp(Math.round(n), 1, 15) === near + REACT_DEFAULTS.startleMore ? undefined : clamp(Math.round(n), 1, 15), ph)} />
            <span className="muted hint">tiles from the player</span>
          </span>
          {r.kind !== "hide" && (
            <>
              <span className="ow-condition-label">Heading</span>
              <span className="ow-xyz">
                <span className="view-switch">
                  <button className={heading === undefined ? "active" : ""} onClick={() => set("direction", undefined)}>Away from the player</button>
                  <button className={heading !== undefined ? "active" : ""} onClick={() => set("direction", heading ?? 0)}>Fixed</button>
                </span>
                {heading !== undefined && (
                  <ScrubNumber label="°" value={heading} step={1} digits={0}
                               onChange={(n, ph) => set("direction", ((Math.round(n) % 360) + 360) % 360, ph)} />
                )}
                <span className="muted hint">{heading === undefined ? "straight away from the player, as it comes"
                  : `${COMPASS[Math.round(heading / 45) % 8]}, clockwise from north: for the map's lie, a gap in the trees`}</span>
              </span>
              <span className="ow-condition-label">Spread</span>
              <span className="ow-xyz">
                <ScrubNumber label="±°" value={spread} step={0.5} digits={0}
                             onChange={(n, ph) => set("spread", clamp(Math.round(n), 0, 180) === REACT_DEFAULTS.spread ? undefined : clamp(Math.round(n), 0, 180), ph)} />
                <span className="muted hint">how far its heading varies either way, at random: birds flying off together scatter</span>
              </span>
              {r.kind === "fly" && (
                <>
                  <span className="ow-condition-label">Climb</span>
                  <span className="ow-xyz">
                    <ScrubNumber label="°" value={r.climb ?? REACT_DEFAULTS.climb} step={0.5} digits={0}
                                 onChange={(n, ph) => set("climb", clamp(Math.round(n), 0, 90) === REACT_DEFAULTS.climb ? undefined : clamp(Math.round(n), 0, 90), ph)} />
                    <span className="muted hint">up from the ground: 90 is straight up</span>
                  </span>
                </>
              )}
              <span className="ow-condition-label">Speed</span>
              <span className="ow-xyz">
                <ScrubNumber label="tiles a second" value={r.speed ?? REACT_DEFAULTS.speed} step={0.05} digits={0}
                             onChange={(n, ph) => set("speed", clamp(Math.round(n), 1, 32) === REACT_DEFAULTS.speed ? undefined : clamp(Math.round(n), 1, 32), ph)} />
              </span>
            </>
          )}
          <span className="ow-condition-label">Sprite</span>
          <div className="ow-ambient-sprites">
            <div className="ow-ambient-sprite">
              {reactSprite ? <SpriteImage model={reactSprite} size={40} /> : <span className="muted small">its own</span>}
              <span className="ow-ambient-sprite-name" title={reactSprite ?? ""}>
                {reactSprite ? constantLabel(reactSprite, "OBJ_CODE_").replace(/^(Pokemon|Follower) /, "") : ""}
              </span>
              <span className="ow-ambient-sprite-actions">
                <button onClick={() => setPicking(true)} title="The sprite it changes to as it reacts: a flying one for a bird that sits">Browse…</button>
                {reactSprite && <button className="icon" title="Keep its own sprite" onClick={() => set("sprite", undefined)}>×</button>}
              </span>
            </div>
          </div>
          <span className="ow-condition-label">Emote</span>
          <span className="ow-xyz">
            <span className="view-switch">
              {EMOTES.map((e) => <button key={e.label} title={e.title} className={(r.emote ?? null) === e.value ? "active" : ""}
                                         onClick={() => set("emote", e.value ?? undefined)}>{e.label}</button>)}
            </span>
            <span className="muted hint">a bubble over it as it reacts</span>
          </span>
          <span className="ow-condition-label">Cry</span>
          <span className="ow-xyz">
            <select value={cry ?? ""} onChange={(e) => set("cry", e.target.value || undefined)}>
              <option value="">none</option>
              {[...constants.keys()].filter((k) => k.startsWith("SPECIES_") && k !== "SPECIES_NONE").sort().map((k) => (
                <option key={k} value={k}>{constantLabel(k, "SPECIES_")}</option>
              ))}
            </select>
            {own && cry !== own && <button onClick={() => set("cry", own)}>Its sprite's ({constantLabel(own, "SPECIES_")})</button>}
          </span>
          <span className="ow-condition-label">Returns</span>
          <span className="ow-xyz">
            <span className="view-switch">
              <button className={!r.returns ? "active" : ""} onClick={() => set("returns", undefined)}>Not in the zone</button>
              <button className={r.returns ? "active" : ""} onClick={() => set("returns", r.returns ?? { min: 30, max: 90 })}>After a while</button>
            </span>
            {r.returns && (
              <>
                <ScrubNumber label="from" value={r.returns.min} step={0.5} digits={0}
                             onChange={(n, ph) => set("returns", { ...r.returns!, min: clamp(Math.round(n), 1, Math.min(3600, r.returns!.max)) }, ph)} />
                <ScrubNumber label="to" value={r.returns.max} step={0.5} digits={0}
                             onChange={(n, ph) => set("returns", { ...r.returns!, max: clamp(Math.round(n), Math.max(1, r.returns!.min), 3600) }, ph)} />
              </>
            )}
            <span className="muted hint">{r.returns ? "seconds, at random, counted while the player is away from its place; it comes back unseen, once its place is out of view"
              : "gone until the zone is entered again"}</span>
          </span>
        </div>
      )}
      {picking && (
        <ModelPicker constants={constants} value={reactSprite ?? ""} used={used} onClose={() => setPicking(false)}
                     onPick={(m) => { set("sprite", m); setPicking(false); }} />
      )}
    </section>
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
