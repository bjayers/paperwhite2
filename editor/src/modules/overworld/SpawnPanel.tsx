// An NPC's spawn data in the Overworld Editor's side panel (spawns.ts): its condition, edited with the Encounter
// Editor's chips for the season, the time and the weather, a chance and every other field of the conditions' format;
// and its instances, the NPCs its record can be, each opened on the map and in the panel.

import { documents } from "../../documents.ts";
import { fromPlain, type JsonPath, type JsonValue } from "../../../shared/json.ts";
import type { Constants, Schema } from "../../../shared/schema.ts";
import { DocForm } from "../followers/DocForm.tsx";
import { BaseField, type FormContext } from "../schema-form/form.tsx";
import { Chips, WeatherPicker } from "../encounters/ui.tsx";
import { ScrubNumber, type ScrubPhase } from "./ScrubNumber.tsx";
import { SEASON_NAMES, TIME_NAMES, conditionSummary, type Condition, type Instance, type Rolls, type SpawnEntry } from "./spawns.ts";

const label = (v: string) => v.replace("_", " ");

/** A condition's controls: chips for what changes most, then the format's every field, a label beside each. */
export function ConditionEditor({ value, path, schema, ctx }: { value: Condition; path: JsonPath; schema: Schema; ctx: FormContext }) {
  const set = (field: string, v: unknown) => {
    const next = { ...value } as Record<string, unknown>;
    if (v === undefined || (Array.isArray(v) && !v.length)) delete next[field];
    else next[field] = v;
    ctx.edit(path, fromPlain(next));
  };
  return (
    <div className="ow-condition">
      <span className="ow-condition-label">Season</span>
      <span><Chips all={SEASON_NAMES} on={(value.season ?? []) as typeof SEASON_NAMES[number][]} labelOf={label} onChange={(v) => set("season", v)}
                   classOf={(v) => `season-chip-${v}`} />{!value.season && <span className="muted"> any</span>}</span>
      <span className="ow-condition-label">Time</span>
      <span><Chips all={TIME_NAMES} on={(value.time ?? []) as typeof TIME_NAMES[number][]} labelOf={label} onChange={(v) => set("time", v)} />
        {!value.time && <span className="muted"> any</span>}</span>
      <span className="ow-condition-label">Weather</span>
      <span><WeatherPicker on={value.weather ?? []} onChange={(v) => set("weather", v)} /></span>
      <span className="ow-condition-label">Chance</span>
      <span className="ow-xyz">
        <ScrubNumber label="%" value={value.chance ?? 100} step={0.5} digits={0}
                     onChange={(n, phase) => { if (phase !== "end") set("chance", n >= 100 ? undefined : Math.max(1, Math.round(n))); }} />
        <span className="muted">of days it holds (rolled once a day)</span>
      </span>
      <details className="ow-condition-more">
        <summary>More conditions: flags, variables, zones, the lead and the party</summary>
        <BaseField schema={schema} value={fromPlain(value)} path={path} ctx={ctx} />
      </details>
    </div>
  );
}

/** The spawn file's form at a path, with the condition editor for "when". */
export function spawnRender(base: FormContext["render"]): FormContext["render"] {
  return (path, value, schema, ctx) => {
    if (path[path.length - 1] === "when" && value instanceof Map) {
      return <ConditionEditor value={Object.fromEntries([...value].map(([k, v]) => [k, toPlainValue(v)])) as Condition} path={path} schema={schema} ctx={ctx} />;
    }
    return base?.(path, value, schema, ctx);
  };
}

function toPlainValue(v: JsonValue): unknown {
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [k, toPlainValue(x)]));
  if (Array.isArray(v)) return v.map(toPlainValue);
  return v && typeof v === "object" && "value" in v ? (v as { value: number }).value : v;
}

/** An NPC's condition and instances, below its fields. */
export function SpawnSection({ path, entries, npcId, npcRecord, constants, onEdit, onOpenInstance }: {
  /** The zone's spawn file, made when first edited. */
  path: string;
  entries: SpawnEntry[];
  npcId: number;
  /** The NPC's own record, the first instance's start. */
  npcRecord: Record<string, unknown>;
  constants: Constants;
  onEdit(paths: string[]): void;
  onOpenInstance(entry: number, instance: number): void;
}) {
  const index = entries.findIndex((e) => e.id === npcId);
  const entry = index >= 0 ? entries[index] : null;
  /** The file's entries with this NPC's changed (or added, or dropped when empty). */
  const write = (next: SpawnEntry | null) => {
    const list = [...entries];
    if (index >= 0) {
      if (next && (next.when || next.instances?.length)) list[index] = next;
      else list.splice(index, 1);
    } else if (next) list.push(next);
    if (!documents.get(path)) documents.create(path, "res/paperwhite2/overworld/overworld.schema.json", fromPlain({ $schema: "overworld.schema.json", npcs: [] }));
    documents.edit(path, ["npcs"], fromPlain(list));
    onEdit([path]);
  };
  const { id: _id, ...record } = npcRecord;
  const addInstance = () => write({ ...(entry ?? { id: npcId }), instances: [...(entry?.instances ?? []),
    { name: `Instance ${(entry?.instances?.length ?? 0) + 1}`, weight: 1, npc: { id: npcId, ...record } }] });
  return (
    <>
      <section className="ow-panel-box ow-section">
        <h5>Appears <span className="muted">{entry?.when ? conditionSummary(entry.when) : "always (unless its flag is set)"}</span></h5>
        <div className="ow-section-actions">
          {entry?.when
            ? <button onClick={() => write({ ...entry, when: undefined })}>Remove the condition</button>
            : <button onClick={() => write({ ...(entry ?? { id: npcId }), when: { time: ["morning", "day", "evening"] } })}>Add a condition</button>}
        </div>
        {entry?.when && (
          <DocForm key={`${path}:${index}:when`} path={path} at={["npcs", index, "when"]} constants={constants} hideDescription flat
                   render={spawnRender(undefined)} onEdit={() => onEdit([path])} />
        )}
      </section>
      {(entry?.when || entry?.instances?.length) && (
        <section className="ow-panel-box ow-section">
          <h5>Rolls</h5>
          <div className="ow-condition">
            <span className="ow-condition-label">Hold for</span>
            <select value={entry.rolls ?? "hour"} onChange={(e) => write({ ...entry, rolls: e.target.value === "hour" ? undefined : e.target.value as Rolls })}>
              <option value="hour">the hour</option>
              <option value="period">the time of day</option>
              <option value="day">the day</option>
              <option value="entry">each zone entry</option>
            </select>
          </div>
          <p className="muted ow-note">How long a chance in its condition and its instance's pick hold before they're rolled again. The game
            checks again when the hour or the time of day changes, and changes the NPC only while it's out of the camera's view.</p>
        </section>
      )}
      <section className="ow-panel-box ow-section">
        <h5>Instances <span className="muted">{entry?.instances?.length ?? 0}</span></h5>
        <div className="ow-section-actions">
          <button onClick={addInstance}>Add an instance</button>
          <span className="muted">{entry?.instances?.length
            ? "At zone entry, and when the hour or the time of day changes, the game writes one into this NPC, by weight among those that hold; this NPC's own fields are unused."
            : "A copy of this NPC, which then becomes its host: the game shows one of its instances instead of it."}</span>
        </div>
        {entry?.instances?.map((inst, k) => (
          <div key={k} className="ow-instance-row">
            <button className="link" onClick={() => onOpenInstance(index, k)}>{inst.name || `Instance ${k + 1}`}</button>
            <span className="muted">{String(inst.npc.model ?? "").replace(/^OBJ_CODE_/, "")} · weight {inst.weight ?? 1} · {conditionSummary(inst.when)}</span>
          </div>
        ))}
      </section>
    </>
  );
}

/** An instance's panel: its name, its weight and its condition first, then the NPC it is. */
export function InstancePanel({ path, entry, instance, inst, constants, onEdit, npcFields }: {
  path: string;
  entry: number;
  instance: number;
  inst: Instance;
  constants: Constants;
  onEdit(): void;
  /** The NPC fields' own controls (height, model, script) at the instance's record. */
  npcFields: FormContext["render"];
}) {
  const base = ["npcs", entry, "instances", instance];
  const set = (field: string, v: JsonValue | undefined, phase: ScrubPhase = "typed") => {
    if (phase === "end") return;
    if (phase === "move") { documents.amend(path, [...base, field], v); return; }
    documents.edit(path, [...base, field], v);
    onEdit();
  };
  return (
    <>
      <section className="ow-panel-box ow-section">
        <h5>Instance</h5>
        <div className="ow-condition">
          <span className="ow-condition-label">Name</span>
          <input value={inst.name ?? ""} placeholder={`Instance ${instance + 1}`} onChange={(e) => set("name", e.target.value || undefined)} />
          <span className="ow-condition-label">Weight</span>
          <span className="ow-xyz">
            <ScrubNumber label="×" value={inst.weight ?? 1} step={0.1} digits={0}
                         onChange={(n, phase) => set("weight", Math.max(1, Math.min(65535, Math.round(n))), phase)} />
            <span className="muted">its share among the instances that hold</span>
          </span>
        </div>
      </section>
      <section className="ow-panel-box ow-section">
        <h5>Appears <span className="muted">{conditionSummary(inst.when)}</span></h5>
        <div className="ow-section-actions">
          {inst.when
            ? <button onClick={() => set("when", undefined)}>Remove the condition</button>
            : <button onClick={() => set("when", fromPlain({ time: ["morning", "day", "evening"] }))}>Add a condition</button>}
        </div>
        {inst.when && (
          <DocForm key={`${path}:${entry}:${instance}:when`} path={path} at={[...base, "when"]} constants={constants} hideDescription flat
                   render={spawnRender(undefined)} onEdit={onEdit} />
        )}
      </section>
      <section className="ow-panel-box ow-section">
        <h5>Its NPC</h5>
        <DocForm key={`${path}:${entry}:${instance}:npc`} path={path} at={[...base, "npc"]} constants={constants} hideDescription flat
                 render={npcFields} onEdit={onEdit} />
      </section>
    </>
  );
}
