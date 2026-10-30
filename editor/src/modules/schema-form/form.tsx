// A form for any data from its schema: every field the schema names, with its description, the right control for
// its type, dropdowns of constants for x-constant fields, and the errors the build would report, where they are.

import { memo, useMemo, useState, type ReactNode } from "react";
import { JsonFloat, numberOf, typeOf, type JsonMap, type JsonPath, type JsonValue } from "../../../shared/json.ts";
import { resolve, validate, type Constants, type Schema, type SchemaError } from "../../../shared/schema.ts";
import { SearchSelect, type Option } from "../../shell/SearchSelect.tsx";

export interface FormContext {
  root: Schema;
  constants: Constants;
  errors: SchemaError[];
  edit(path: JsonPath, value: JsonValue | undefined): void;
}

const COLLAPSE_ITEMS = 24;

/** Names people use for a value's kind, in place of JSON's. */
export function kindName(type: string, schema: Schema): string {
  if (type === "string") return schema["x-constant"] ? "Constant" : "Text";
  return { integer: "Number", number: "Decimal", boolean: "Yes/No", null: "None", object: "Group", array: "List" }[type] ?? type;
}

/** Abbreviations that read better in capitals wherever they appear as a word. */
const ACRONYMS = new Set(["ai", "bg", "bgm", "ev", "evs", "exp", "hm", "hp", "id", "ids", "iv", "ivs", "npc", "npcs",
  "pp", "rgb", "se", "tm", "ui", "xy"]);

export function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase()
    .split(" ").map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w)).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function constantLabel(name: string, prefix: string): string {
  return humanize(name.startsWith(prefix) ? name.slice(prefix.length) : name).replace(/\b(\w)/g, (c) => c.toUpperCase());
}

const optionCache = new WeakMap<Constants, Map<string, Option[]>>();

export function constantOptions(constants: Constants, prefix: string): Option[] {
  let byPrefix = optionCache.get(constants);
  if (!byPrefix) optionCache.set(constants, (byPrefix = new Map()));
  let options = byPrefix.get(prefix);
  if (!options) {
    options = [...constants]
      .filter(([name]) => name.startsWith(prefix))
      .sort((a, b) => a[1] - b[1])
      .map(([name, value]) => ({ value: name, label: constantLabel(name, prefix), detail: String(value) }));
    byPrefix.set(prefix, options);
  }
  return options;
}

const samePath = (a: JsonPath, b: JsonPath) => a.length === b.length && a.every((k, i) => String(k) === String(b[i]));
const within = (inner: JsonPath, outer: JsonPath) => inner.length >= outer.length && outer.every((k, i) => String(k) === String(inner[i]));

function ErrorText({ errors, path }: { errors: SchemaError[]; path: JsonPath }) {
  const here = errors.filter((e) => samePath(e.path, path));
  if (!here.length) return null;
  return <div className="field-error">{here.map((e) => e.message).join("; ")}</div>;
}

/** A value to start a new field or item with: the first choice, the smallest number, the required fields. */
export function defaultFor(schema: Schema, ctx: Pick<FormContext, "root" | "constants">): JsonValue {
  const s = resolve(schema, ctx.root);
  if (s.anyOf?.length) return defaultFor(s.anyOf[0], ctx);
  if (s.enum?.length) return fromPlain(s.enum[0]);
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  switch (type) {
    case "object": {
      const map: JsonMap = new Map();
      for (const key of s.required ?? []) map.set(key, defaultFor(s.properties?.[key] ?? {}, ctx));
      return map;
    }
    case "array": {
      const items: JsonValue[] = [];
      for (let i = 0; i < (s.minItems ?? 0); i++) items.push(defaultFor(s.prefixItems?.[i] ?? s.items ?? {}, ctx));
      return items;
    }
    case "string": {
      const prefix = s["x-constant"];
      return prefix ? (constantOptions(ctx.constants, prefix)[0]?.value ?? "") : "";
    }
    case "integer":
      return Math.max(s.minimum ?? 0, 0);
    case "number":
      return new JsonFloat(Math.max(s.minimum ?? 0, 0));
    case "boolean":
      return false;
  }
  return null;
}

function fromPlain(v: unknown): JsonValue {
  if (Array.isArray(v)) return v.map(fromPlain);
  if (v && typeof v === "object") return new Map(Object.entries(v).map(([k, x]) => [k, fromPlain(x)]));
  return v as JsonValue;
}

function typesOf(s: Schema): string[] {
  return s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
}

/** One value of any kind. */
export const Field = memo(function Field({ schema, value, path, ctx }: {
  schema: Schema;
  value: JsonValue;
  path: JsonPath;
  ctx: FormContext;
}) {
  const s = resolve(schema, ctx.root);
  if (s.anyOf) return <AnyOfField schema={s} value={value} path={path} ctx={ctx} />;
  if (s.enum) return <EnumField schema={s} value={value} path={path} ctx={ctx} />;
  const types = typesOf(s);
  const actual = typeOf(value);
  const fits = (t: string) => t === actual || (t === "number" && actual === "integer");
  // A field that may hold several types (a constant or a hex ID or a number): switch between them.
  if (types.length > 1) {
    const current = types.find(fits) ?? types[0];
    return (
      <div className="multi-type">
        <select className="type-switch" value={current} title="What kind of value this is"
                onChange={(e) => ctx.edit(path, defaultFor({ ...s, type: e.target.value }, ctx))}>
          {types.map((t) => <option key={t} value={t}>{kindName(t, s)}</option>)}
        </select>
        <Field schema={{ ...s, type: current }} value={value} path={path} ctx={ctx} />
      </div>
    );
  }
  const type = types[0] ?? (actual === "integer" ? "integer" : actual);
  switch (type) {
    case "object":
      return value instanceof Map ? <ObjectField schema={s} value={value} path={path} ctx={ctx} /> : <Mismatch value={value} />;
    case "array":
      return Array.isArray(value) ? <ArrayField schema={s} value={value} path={path} ctx={ctx} /> : <Mismatch value={value} />;
    case "string":
      return <StringField schema={s} value={value} path={path} ctx={ctx} />;
    case "integer":
    case "number":
      return <NumberField schema={s} type={type} value={value} path={path} ctx={ctx} />;
    case "boolean":
      return (
        <label className="checkbox">
          <input type="checkbox" checked={value === true} onChange={(e) => ctx.edit(path, e.target.checked)} />
          {value === true ? "Yes" : "No"}
        </label>
      );
    case "null":
      return <span className="muted">none</span>;
  }
  return <Mismatch value={value} />;
});

function Mismatch({ value }: { value: JsonValue }) {
  return <code className="mismatch" title="The form can't show this value; use the Text view">{typeOf(value)}</code>;
}

function StringField({ schema, value, path, ctx }: { schema: Schema; value: JsonValue; path: JsonPath; ctx: FormContext }) {
  const prefix = schema["x-constant"];
  const invalid = ctx.errors.some((e) => samePath(e.path, path));
  if (prefix) {
    return (
      <SearchSelect value={typeof value === "string" ? value : ""} options={constantOptions(ctx.constants, prefix)}
                    invalid={invalid} onChange={(v) => ctx.edit(path, v)}
                    allowCustom={schema["x-hex"] ? (t) => /^0x[0-9a-fA-F]+$/.test(t) : undefined}
                    placeholder={`A ${prefix}* constant${schema["x-hex"] ? " or a hex ID" : ""}`} />
    );
  }
  const text = typeof value === "string" ? value : "";
  const long = text.length > 60 || text.includes("\n");
  return long ? (
    <textarea className={invalid ? "invalid" : ""} value={text} rows={Math.min(8, text.split("\n").length + 1)}
              onChange={(e) => ctx.edit(path, e.target.value)} />
  ) : (
    <input className={invalid ? "invalid" : ""} value={text} onChange={(e) => ctx.edit(path, e.target.value)} />
  );
}

function NumberField({ schema, type, value, path, ctx }: {
  schema: Schema; type: string; value: JsonValue; path: JsonPath; ctx: FormContext;
}) {
  const n = numberOf(value);
  const [typed, setTyped] = useState<string | null>(null);
  const invalid = ctx.errors.some((e) => samePath(e.path, path)) || typed !== null;
  const hex = schema["x-hex"] && typeof value === "number" && value > 255;
  return (
    <span className="number">
      <input className={invalid ? "invalid" : ""} inputMode="decimal"
             value={typed ?? (n === undefined ? "" : String(n))}
             min={schema.minimum} max={schema.maximum}
             onChange={(e) => {
               const text = e.target.value.trim();
               const parsed = /^-?0x[0-9a-f]+$/i.test(text) ? parseInt(text, 16) : Number(text);
               const ok = text !== "" && Number.isFinite(parsed) && (type === "number" || Number.isInteger(parsed));
               setTyped(ok ? null : e.target.value);
               if (!ok) return;
               // A value that was written with a point stays one ("3.0"), and so does any "number" field.
               ctx.edit(path, value instanceof JsonFloat || type === "number" ? new JsonFloat(parsed) : parsed);
             }}
             onBlur={() => setTyped(null)} />
      {(schema.minimum !== undefined || schema.maximum !== undefined) && (
        <span className="muted range">{schema.minimum ?? "…"} to {schema.maximum ?? "…"}</span>
      )}
      {hex && <span className="muted range">0x{(value as number).toString(16).padStart(4, "0")}</span>}
    </span>
  );
}

function EnumField({ schema, value, path, ctx }: { schema: Schema; value: JsonValue; path: JsonPath; ctx: FormContext }) {
  const options = schema.enum ?? [];
  const index = options.findIndex((o) => JSON.stringify(o) === JSON.stringify(value instanceof JsonFloat ? value.value : value));
  const prefix = schema["x-constant"];
  const label = (o: unknown) => (o === null ? "(none)" : typeof o === "string" && prefix ? constantLabel(o, prefix) : String(o));
  return (
    <select value={index} className={index < 0 ? "invalid" : ""} onChange={(e) => ctx.edit(path, fromPlain(options[Number(e.target.value)]))}>
      {index < 0 && <option value={-1}>{JSON.stringify(value)} (not allowed)</option>}
      {options.map((o, i) => <option key={i} value={i}>{label(o)}</option>)}
    </select>
  );
}

function AnyOfField({ schema, value, path, ctx }: { schema: Schema; value: JsonValue; path: JsonPath; ctx: FormContext }) {
  const options = schema.anyOf!;
  // The option the value fits, or the first one.
  const fitting = options.findIndex((o) => !validate(value, o, ctx.constants, ctx.root).length);
  const chosen = fitting < 0 ? 0 : fitting;
  const name = (o: Schema, i: number) => {
    const r = resolve(o, ctx.root);
    return r.title ?? r.description?.split(/[.:;]/)[0] ?? (typesOf(r).map((t) => kindName(t, r)).join(" or ") || `Choice ${i + 1}`);
  };
  return (
    <div className="any-of">
      {options.length > 1 && (
        <select className="type-switch" value={chosen} onChange={(e) => ctx.edit(path, defaultFor(options[Number(e.target.value)], ctx))}>
          {options.map((o, i) => <option key={i} value={i}>{name(o, i)}</option>)}
        </select>
      )}
      <Field schema={{ ...options[chosen], description: undefined }} value={value} path={path} ctx={ctx} />
    </div>
  );
}

function Row({ label, description, required, children, onRemove, path, ctx }: {
  label: ReactNode; description?: string; required?: boolean; children: ReactNode; onRemove?: () => void;
  path: JsonPath; ctx: FormContext;
}) {
  return (
    <div className="row" data-path={path.join(".")}>
      <div className="row-label" title={description}>
        <span>{label}</span>
        {required && <span className="required" title="Required">•</span>}
        {onRemove && <button className="icon" title="Remove this field" onClick={onRemove}>×</button>}
      </div>
      <div className="row-control">
        {children}
        {description && <div className="hint">{description}</div>}
        <ErrorText errors={ctx.errors} path={path} />
      </div>
    </div>
  );
}

function ObjectField({ schema, value, path, ctx }: { schema: Schema; value: JsonMap; path: JsonPath; ctx: FormContext }) {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const known = Object.keys(properties).filter((k) => k !== "$schema");
  const present = known.filter((k) => value.has(k));
  const missing = known.filter((k) => !value.has(k));
  const extra = [...value.keys()].filter((k) => !(k in properties) && k !== "$schema");
  const nested = path.length > 0;

  const add = (key: string) => {
    // New fields go where the schema lists them, so the file keeps the usual order.
    const order = Object.keys(properties);
    const entries = [...value.entries(), [key, defaultFor(properties[key], ctx)] as [string, JsonValue]];
    entries.sort((a, b) => rank(order, a[0]) - rank(order, b[0]));
    ctx.edit(path, new Map(entries));
  };

  const body = (
    <div className="object">
      {present.map((key) => (
        <Row key={key} label={humanize(key)} description={resolve(properties[key], ctx.root).description}
             required={required.has(key)} path={[...path, key]} ctx={ctx}
             onRemove={required.has(key) ? undefined : () => ctx.edit([...path, key], undefined)}>
          <Field schema={properties[key]} value={value.get(key)!} path={[...path, key]} ctx={ctx} />
        </Row>
      ))}
      {extra.map((key) => (
        <Row key={key} label={<code>{key}</code>} description="Not in the schema" path={[...path, key]} ctx={ctx}
             onRemove={() => ctx.edit([...path, key], undefined)}>
          <Field schema={typeof schema.additionalProperties === "object" ? schema.additionalProperties : {}}
                 value={value.get(key)!} path={[...path, key]} ctx={ctx} />
        </Row>
      ))}
      {missing.length > 0 && (
        <div className="add-fields">
          <span className="muted">Add:</span>
          {missing.map((key) => (
            <button key={key} className="chip" title={resolve(properties[key], ctx.root).description} onClick={() => add(key)}>
              + {humanize(key)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
  if (!nested) return body;
  const problems = ctx.errors.filter((e) => within(e.path, path)).length;
  return (
    <details className="group" open={path.length < 3}>
      <summary>
        {schema.title ?? summaryOf(value)}
        {problems > 0 && <span className="badge error">{problems}</span>}
      </summary>
      {body}
    </details>
  );
}

function rank(order: string[], key: string): number {
  const i = order.indexOf(key);
  return i < 0 ? order.length : i;
}

function summaryOf(value: JsonValue): string {
  if (value instanceof Map) {
    const first = [...value].find(([, v]) => typeof v === "string" || typeof v === "number");
    return first ? `${humanize(first[0])}: ${String(first[1])}` : `${value.size} fields`;
  }
  if (Array.isArray(value)) return `${value.length} items`;
  return String(value);
}

function ArrayField({ schema, value, path, ctx }: { schema: Schema; value: JsonValue[]; path: JsonPath; ctx: FormContext }) {
  const [showAll, setShowAll] = useState(value.length <= COLLAPSE_ITEMS);
  const prefix = schema.prefixItems ?? [];
  const itemSchema = (i: number) => (i < prefix.length ? prefix[i] : schema.items ?? {});
  const fixed = schema.minItems !== undefined && schema.minItems === schema.maxItems;
  const canAdd = !fixed && value.length < (schema.maxItems ?? Infinity) && (schema.items || prefix.length > value.length);
  const canRemove = !fixed && value.length > (schema.minItems ?? 0);
  const shown = showAll ? value : value.slice(0, COLLAPSE_ITEMS);
  const simple = useMemo(() => value.every((v) => !(v instanceof Map) && !Array.isArray(v)), [value]);

  const move = (from: number, to: number) => {
    const copy = value.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    ctx.edit(path, copy);
  };

  return (
    <div className={`array${simple ? " simple" : ""}`}>
      {shown.map((item, i) => (
        <div className="item" key={i}>
          <span className="index">{i < prefix.length ? humanize(resolve(prefix[i], ctx.root).title ?? String(i)) : i}</span>
          <div className="item-body">
            <Field schema={itemSchema(i)} value={item} path={[...path, i]} ctx={ctx} />
            <ErrorText errors={ctx.errors} path={[...path, i]} />
          </div>
          {!fixed && (
            <span className="item-actions">
              <button className="icon" title="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
              <button className="icon" title="Move down" disabled={i === value.length - 1} onClick={() => move(i, i + 1)}>↓</button>
              <button className="icon" title="Remove" disabled={!canRemove} onClick={() => ctx.edit([...path, i], undefined)}>×</button>
            </span>
          )}
        </div>
      ))}
      <div className="array-footer">
        {!showAll && (
          <button className="link" onClick={() => setShowAll(true)}>Show all {value.length} items</button>
        )}
        {canAdd && (
          <button className="chip" onClick={() => ctx.edit([...path, value.length], defaultFor(itemSchema(value.length), ctx))}>
            + Add
          </button>
        )}
        {!value.length && !canAdd && <span className="muted">empty</span>}
      </div>
    </div>
  );
}
