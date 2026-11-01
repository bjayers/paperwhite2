// An NPC's spawn data in the Overworld Editor's side panel (spawns.ts): its condition, edited with the Encounter
// Editor's chips for the season, the time and the weather, a chance and every other field of the conditions' format;
// and its instances, the NPCs its record can be, each opened on the map and in the panel.

import { documents } from "../../documents.ts";
import { fromPlain, type JsonPath, type JsonValue } from "../../../shared/json.ts";
import type { Constants, Schema } from "../../../shared/schema.ts";
import { DocForm } from "../followers/DocForm.tsx";
import { BaseField, type FormContext } from "../schema-form/form.tsx";
import { Chips, WeatherPicker } from "../encounters/ui.tsx";
import { ScrubNumber } from "./ScrubNumber.tsx";
import { SEASON_NAMES, TIME_NAMES, conditionSummary, type Condition, type SpawnEntry } from "./spawns.ts";

const label = (v: string) => v.replace("_", " ");

/** A condition's controls: chips for what changes most, then the format's every field. */
export function ConditionEditor({ value, path, schema, ctx }: { value: Condition; path: JsonPath; schema: Schema; ctx: FormContext }) {
  const set = (field: string, v: unknown) => {
    const next = { ...value } as Record<string, unknown>;
    if (v === undefined || (Array.isArray(v) && !v.length)) delete next[field];
    else next[field] = v;
    ctx.edit(path, fromPlain(next));
  };
  return (
    <div className="ow-condition">
      <div className="ow-xyz"><span className="muted">Season</span>
        <Chips all={SEASON_NAMES} on={(value.season ?? []) as typeof SEASON_NAMES[number][]} labelOf={label} onChange={(v) => set("season", v)}
               classOf={(v) => `season-chip-${v}`} />
        {!value.season && <span className="muted">any</span>}</div>
      <div className="ow-xyz"><span className="muted">Time</span>
        <Chips all={TIME_NAMES} on={(value.time ?? []) as typeof TIME_NAMES[number][]} labelOf={label} onChange={(v) => set("time", v)} />
        {!value.time && <span className="muted">any</span>}</div>
      <div className="ow-xyz"><span className="muted">Weather</span> <WeatherPicker on={value.weather ?? []} onChange={(v) => set("weather", v)} /></div>
      <div className="ow-xyz"><span className="muted">Chance</span>
        <ScrubNumber label="%" value={value.chance ?? 100} step={0.5} digits={0}
                     onChange={(n, phase) => { if (phase !== "end") set("chance", n >= 100 ? undefined : Math.max(1, Math.round(n))); }} />
        <span className="muted">a day: it holds all day, or not at all</span></div>
      <details className="ow-condition-more">
        <summary>Every field (flags, variables, zones, the lead and the party…)</summary>
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
  return (
    <div className="ow-panel-box">
      <p className="ow-note"><strong>Appears</strong> {entry?.when ? conditionSummary(entry.when) : "always (unless its flag is set)"}{" "}
        {entry?.when
          ? <button onClick={() => write({ ...entry, when: undefined })}>Remove the condition</button>
          : <button onClick={() => write({ ...(entry ?? { id: npcId }), when: { time: ["morning", "day", "evening"] } })}>Add a condition</button>}
      </p>
      {entry?.when && (
        <DocForm key={`${path}:${index}:when`} path={path} at={["npcs", index, "when"]} constants={constants} hideDescription flat
                 render={spawnRender(undefined)} onEdit={() => onEdit([path])} />
      )}
      <p className="ow-note"><strong>Instances</strong> {entry?.instances?.length
        ? <span className="muted">the field writes one into this NPC at zone entry, by weight among those that hold; its own fields are unused</span>
        : <span className="muted">none: it is itself</span>}</p>
      {entry?.instances?.map((inst, k) => (
        <p key={k} className="ow-note">
          <button className="link" onClick={() => onOpenInstance(index, k)}>{inst.name || `Instance ${k + 1}`}</button>
          <span className="muted"> {String(inst.npc.model ?? "").replace(/^OBJ_CODE_/, "")} · weight {inst.weight ?? 1} · {conditionSummary(inst.when)}</span>
        </p>
      ))}
      <button onClick={() => write({ ...(entry ?? { id: npcId }), instances: [...(entry?.instances ?? []),
        { name: `Instance ${(entry?.instances?.length ?? 0) + 1}`, weight: 1, npc: { id: npcId, ...record } }] })}>
        Add an instance (a copy of {entry?.instances?.length ? "this NPC" : "this NPC, which becomes its host"})</button>
    </div>
  );
}
