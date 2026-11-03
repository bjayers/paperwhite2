// An events entity's side panel in the Overworld Editor (NPCs, proxies, triggers, warps and level scripts), laid out
// as the Ambients panel is: a headed section for each group of its fields, a label column beside the controls, each
// control the schema form's own (constants, hex flags, types) or the editor's (its model with the sprite browser, its
// height in tiles, its script with the button that opens it), and the whole record's form under "All fields" last,
// so nothing the form edits is lost. The record's schema is res/field/events/events.schema.json.

import { useMemo, type ReactNode } from "react";
import { documents } from "../../documents.ts";
import { getIn, type JsonPath, type JsonValue } from "../../../shared/json.ts";
import { validate, type Constants } from "../../../shared/schema.ts";
import { DocForm, schemaAt, useHeld } from "../followers/DocForm.tsx";
import { BaseField, constantLabel, type FormContext } from "../schema-form/form.tsx";
import { KIND_LISTS, type EntityKind } from "./entities.ts";

/** A row: its label, its field's path in the record, a hint under it, and whether the record has it. */
interface Row {
  label: string;
  at: string[];
  hint?: string;
  shows?(record: Map<string, JsonValue>): boolean;
  /** A DIR_* field, shown as the four arrows (where it holds a constant). */
  facing?: boolean;
}
interface Section {
  title: string;
  summary?(record: Map<string, JsonValue>): string;
  rows: Row[];
}

// The four directions in DIR_* order, as the Ambients panel shows them
const FACINGS = [["DIR_UP", "↑", "Up"], ["DIR_DOWN", "↓", "Down"], ["DIR_LEFT", "←", "Left"], ["DIR_RIGHT", "→", "Right"]] as const;

const onGrid = (r: Map<string, JsonValue>) => r.has("grid");
const onRail = (r: Map<string, JsonValue>) => r.has("rail");
const text = (v: JsonValue | undefined) => (v === undefined || v === null ? "" : String(v instanceof Map ? "" : v));
const short = (v: JsonValue | undefined, prefix: string) => (typeof v === "string" ? constantLabel(v, prefix) : text(v));
const at = (r: Map<string, JsonValue>, ...keys: string[]) => getIn(r, keys) as JsonValue | undefined;
const place = (r: Map<string, JsonValue>, z = "z", units = 1) => {
  if (!onGrid(r)) return "on its rail";
  const tile = (v: JsonValue | undefined) => (typeof v === "number" ? Math.floor(v / units) : text(v));
  return `tile ${tile(at(r, "grid", "x"))}, ${tile(at(r, "grid", z))}`;
};
const RAIL_ROWS: Row[] = [
  { label: "Line", at: ["rail", "component"], hint: "the rail line it stands on", shows: onRail },
  { label: "Front", at: ["rail", "front"], hint: "its place along the line", shows: onRail },
  { label: "Side", at: ["rail", "side"], hint: "its place across it", shows: onRail },
];

const LAYOUTS: Partial<Record<EntityKind, Section[]>> = {
  npc: [
    { title: "NPC", summary: (r) => `${short(at(r, "model"), "OBJ_CODE_")}${at(r, "type") !== "ACTOR_EVENT_TYPE_NONE" ? `, ${short(at(r, "type"), "ACTOR_EVENT_TYPE_")}` : ""}`, rows: [
      { label: "ID", at: ["id"], hint: "the id its scripts use" },
      { label: "Sprite", at: ["model"] },
      { label: "Facing", at: ["direction"], facing: true },
      { label: "Kind", at: ["type"], hint: "what kind of event it is, such as a Trainer" },
      { label: "Spawn flag", at: ["flag"], hint: "set, it's hidden; 0 for none" },
    ] },
    { title: "Place", summary: (r) => place(r), rows: [
      { label: "Tile X", at: ["grid", "x"], shows: onGrid },
      { label: "Tile Z", at: ["grid", "z"], shows: onGrid },
      { label: "Height", at: ["grid", "y"], shows: onGrid },
      ...RAIL_ROWS,
    ] },
    { title: "Movement", summary: (r) => short(at(r, "movement"), "MOVE_CODE_"), rows: [
      { label: "Moves", at: ["movement"], hint: "its move code" },
      { label: "Area wide", at: ["area", "width"], hint: "tiles it can wander east and west" },
      { label: "Area deep", at: ["area", "height"], hint: "tiles it can wander north and south" },
    ] },
    { title: "Script", summary: (r) => `script ${text(at(r, "script"))}`, rows: [
      { label: "Script", at: ["script"] },
      { label: "Params", at: ["params"], hint: "its three parameters, as its kind reads them (a Trainer's sight, an item's)" },
    ] },
  ],
  proxy: [
    { title: "Proxy", summary: (r) => `script ${text(at(r, "script"))}`, rows: [
      { label: "Script", at: ["script"], hint: "the script it runs, of the zone's script file" },
      { label: "Condition", at: ["condition"] },
      { label: "Facing", at: ["direction"] },
    ] },
    { title: "Place", summary: (r) => place(r, "y"), rows: [
      { label: "Tile X", at: ["grid", "x"], shows: onGrid },
      { label: "Tile Z", at: ["grid", "y"], shows: onGrid },
      { label: "Height", at: ["grid", "z"], shows: onGrid },
      ...RAIL_ROWS,
    ] },
  ],
  trigger: [
    { title: "Trigger", summary: (r) => `script ${text(at(r, "script"))}`, rows: [
      { label: "Script", at: ["script"] },
      { label: "Variable", at: ["var"], hint: "the variable it checks" },
      { label: "Value", at: ["value"], hint: "the variable's value that enables it" },
      { label: "Type", at: ["type"] },
      { label: "Unknown", at: ["unk14"], hint: "unk14" },
    ] },
    { title: "Place", summary: (r) => place(r), rows: [
      { label: "Tile X", at: ["grid", "x"], shows: onGrid },
      { label: "Tile Z", at: ["grid", "z"], shows: onGrid },
      { label: "Width", at: ["grid", "width"], hint: "tiles east", shows: onGrid },
      { label: "Depth", at: ["grid", "height"], hint: "tiles south", shows: onGrid },
      { label: "Height", at: ["grid", "y"], shows: onGrid },
      ...RAIL_ROWS,
      { label: "Front span", at: ["rail", "front_span"], shows: onRail },
      { label: "Side span", at: ["rail", "side_span"], shows: onRail },
    ] },
  ],
  warp: [
    { title: "Warp", summary: (r) => `to ${short(at(r, "zone"), "ZONE_")}, warp ${text(at(r, "warp"))}`, rows: [
      { label: "Leads to", at: ["zone"], hint: "the zone it leads to" },
      { label: "Warp", at: ["warp"], hint: "that zone's warp it leads to" },
      { label: "Transition", at: ["transition"] },
      { label: "Unknown", at: ["unk4"], hint: "unk4" },
    ] },
    { title: "Place", summary: (r) => place(r, "z", 16), rows: [
      { label: "X", at: ["grid", "x"], hint: "in units, 16 a tile (a tile's middle is its tile times 16, plus 8)", shows: onGrid },
      { label: "Z", at: ["grid", "z"], hint: "in units, 16 a tile", shows: onGrid },
      { label: "Height", at: ["grid", "y"], shows: onGrid },
      { label: "Width", at: ["grid", "width"], hint: "tiles east", shows: onGrid },
      { label: "Depth", at: ["grid", "height"], hint: "tiles south", shows: onGrid },
      { label: "Unknown", at: ["grid", "unk0a"], hint: "unk0a", shows: onGrid },
      ...RAIL_ROWS,
      { label: "Front span", at: ["rail", "front_span"], shows: onRail },
      { label: "Side span", at: ["rail", "side_span"], shows: onRail },
      { label: "Param", at: ["rail", "param"], shows: onRail },
    ] },
  ],
  level: [
    { title: "Level script", summary: (r) => `script ${text(at(r, "script"))}`, rows: [
      { label: "Type", at: ["type"], hint: "when it runs" },
      { label: "Script", at: ["script"] },
      { label: "Conditions", at: ["conditions"], hint: "a variable's value and the script it runs then" },
    ] },
  ],
};

/** Whether a kind has a sectioned panel (the others keep their own). */
export const hasEventLayout = (kind: EntityKind) => kind in LAYOUTS;

export function EventPanel({ kind, path, index, constants, render, onEdit, children }: {
  kind: EntityKind;
  /** The zone's events file. */
  path: string;
  index: number;
  constants: Constants;
  /** The editor's own controls for some fields (entityFields: the model, the height, the script). */
  render?: FormContext["render"];
  onEdit(): void;
  /** Sections after the record's own and before All fields (an NPC's spawn data). */
  children?: ReactNode;
}) {
  const { data, schema } = useHeld(path);
  const base: JsonPath = [KIND_LISTS[kind], index];
  const errors = useMemo(() => (data !== null && schema ? validate(data, schema, constants) : []), [data, schema, constants]);
  const ctx: FormContext | null = useMemo(() => schema ? {
    root: schema, constants, errors,
    edit: (p: JsonPath, v: JsonValue | undefined) => { documents.edit(path, p, v); onEdit(); },
    amend: (p: JsonPath, v: JsonValue | undefined) => documents.amend(path, p, v),
    render, flat: true,
  } : null, [schema, constants, errors, path, render, onEdit]);
  const record = data !== null ? (getIn(data, base) as JsonValue | undefined) : undefined;
  if (!ctx || !schema || !(record instanceof Map)) return <p className="muted">Reading {path}…</p>;
  const control = (row: Row) => {
    const p = [...base, ...row.at];
    const value = getIn(data!, p) as JsonValue | undefined;
    if (value === undefined) return <span className="muted">none</span>;
    const s = schemaAt(schema, p);
    if (row.facing && (typeof value === "string" || typeof value === "number")) {
      const current = typeof value === "string" ? value : FACINGS[value]?.[0];
      return (
        <span className="view-switch">
          {FACINGS.map(([dir, arrow, name]) => (
            <button key={dir} className={current === dir ? "active" : ""} title={name} onClick={() => ctx.edit(p, dir)}>{arrow}</button>
          ))}
        </span>
      );
    }
    return render?.(p, value, s, ctx) ?? <BaseField schema={s} value={value} path={p} ctx={ctx} />;
  };
  return (
    <>
      {LAYOUTS[kind]!.map((section) => {
        const rows = section.rows.filter((r) => !r.shows || r.shows(record));
        if (!rows.length) return null;
        return (
          <section key={section.title} className="ow-panel-box ow-section">
            <h5>{section.title}{section.summary && <span className="muted">{section.summary(record)}</span>}</h5>
            <div className="ow-condition ow-event-rows">
              {rows.map((row) => (
                <RowView key={row.at.join(".")} label={row.label} hint={row.hint ?? schemaAt(schema, [...base, ...row.at]).description}>
                  {control(row)}
                </RowView>
              ))}
            </div>
          </section>
        );
      })}
      {children}
      <details className="ow-panel-box ow-section">
        <summary className="muted">All fields</summary>
        <DocForm key={`${kind}:${index}`} path={path} at={base} constants={constants} hideDescription flat render={render} onEdit={onEdit} />
      </details>
    </>
  );
}

function RowView({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <>
      <span className="ow-condition-label">{label}</span>
      <span className="ow-event-control">
        {children}
        {hint && <span className="muted hint">{hint}</span>}
      </span>
    </>
  );
}
