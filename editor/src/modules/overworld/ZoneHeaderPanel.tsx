// The zone's header in the Overworld Editor's side panel (res/field/zones/<zone>.json, zone.schema.json): every field
// of it in headed groups, each with the schema's description as its hint and the schema's constants as its choices.
// It edits the file through the document store, so undo, Save with the build's check and changes on disk work as for
// the events. What the Weather Editor and the Encounter Editor edit is linked, and the file itself opens in the Data
// files form for anything else.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents } from "../../documents.ts";
import { fromPlain, type JsonPath, type JsonValue } from "../../../shared/json.ts";
import { validate, type Constants, type Schema, type SchemaError } from "../../../shared/schema.ts";
import { navigate } from "../../navigation.ts";
import { SearchSelect } from "../../shell/SearchSelect.tsx";
import { useHeld } from "../followers/DocForm.tsx";
import { BaseField, defaultFor, type FormContext } from "../schema-form/form.tsx";
import { weatherLabel } from "../weather/weathers.ts";
import { headerLayout, type HeaderField } from "./zoneHeader.ts";

const CALENDAR_SCHEMA = "res/field/weather_calendar/weather_calendar.schema.json";
const OPEN_KEY = "paperwhite2.overworld.zoneHeaderOpen";
const SEASONS = ["spring", "summer", "autumn", "winter"];

const remembered = (): boolean => {
  try { return localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
};

export function zoneHeaderPath(zone: string): string {
  return `res/field/zones/${zone}.json`;
}

/** The weathers by header value, from the calendar schema's enum (include/system/zone_weather.h's order). */
function useWeathers(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    api.schema(CALENDAR_SCHEMA).then((s) => { if (live) setNames((s.$defs?.weather?.enum ?? []) as string[]); }, () => {});
    return () => { live = false; };
  }, []);
  return names;
}

export function ZoneHeaderPanel({ zone, constants, onEdit, open: openFile }: {
  zone: string;
  constants: Constants;
  /** Told of each edit, to record it in the editor's undo. */
  onEdit(path: string): void;
  /** Opens a file in the Data files form. */
  open?(path: string): void;
}) {
  const path = zoneHeaderPath(zone);
  const [shown, setShown] = useState(remembered);
  const toggle = (next: boolean) => {
    setShown(next);
    try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch { /* the choice is only a convenience */ }
  };
  const { data, schema, error, dirty } = useHeld(path);
  const weathers = useWeathers();
  const errors = useMemo(() => (data !== null && schema ? validate(data, schema, constants) : []), [data, schema, constants]);
  const ctx: FormContext | null = useMemo(() => schema ? {
    root: schema, constants, errors,
    edit: (p: JsonPath, v: JsonValue | undefined) => { documents.edit(path, p, v); onEdit(path); },
    amend: (p: JsonPath, v: JsonValue | undefined) => documents.amend(path, p, v),
  } : null, [schema, constants, errors, path, onEdit]);
  const header = data instanceof Map ? data : null;
  const place = typeof header?.get("place") === "string" ? String(header.get("place")).replace(/^PLACE_/, "").toLowerCase().replace(/_/g, " ") : null;

  return (
    <details className="ow-zone-header" open={shown} onToggle={(e) => { if (e.currentTarget.open !== shown) toggle(e.currentTarget.open); }}>
      <summary>
        <strong>Zone header</strong>
        <span className="muted"> {place ? `${place} · ` : ""}{zone}.json{dirty ? " · unsaved" : ""}{errors.length ? ` · ${errors.length} to fix` : ""}</span>
      </summary>
      {shown && (error ? <p className="ow-error">{path}: {error}</p>
        : !header || !schema || !ctx ? <p className="muted ow-note">Reading {path}…</p>
        : (
          <>
            <p className="muted ow-note">Saved with the rest (Ctrl+S); the build's check runs on it.</p>
            {headerLayout(schema).map((group) => (
              <section key={group.title} className="ow-panel-box ow-section">
                <h5>{group.title} <span className="muted">{group.about}</span></h5>
                <div className="ow-condition ow-header-grid">
                  {group.fields.map((f) => (
                    <HeaderRow key={f.key} field={f} schema={schema} header={header} ctx={ctx} weathers={weathers} errors={errors} />
                  ))}
                </div>
              </section>
            ))}
            <div className="ow-section-actions">
              <button onClick={() => openFile?.(path)} disabled={!openFile} title="The whole file as the generic form, or as text">Open {zone}.json in Data files</button>
              <span className="muted small">for anything this section doesn't show</span>
            </div>
          </>
        ))}
    </details>
  );
}

function HeaderRow({ field, schema, header, ctx, weathers, errors }: {
  field: HeaderField; schema: Schema; header: Map<string, JsonValue>; ctx: FormContext; weathers: string[]; errors: SchemaError[];
}) {
  const property = schema.properties?.[field.key] ?? {};
  const path: JsonPath = [field.key];
  const value = header.get(field.key);
  const optional = !schema.required?.includes(field.key);
  const hint = [property.description, field.note].filter((s): s is string => !!s).map((s) => (/[.!?]$/.test(s) ? s : `${s}.`)).join(" ");
  const here = errors.filter((e) => e.path[0] === field.key);

  let control;
  if (value === undefined) {
    control = (
      <span className="ow-xyz">
        <button onClick={() => ctx.edit(path, defaultFor(property, ctx))}>Set it</button>
        <span className="muted hint">left out of the file</span>
      </span>
    );
  } else if (field.control === "weather" && weathers.length) {
    control = <WeatherControl value={value} weathers={weathers} onChange={(n) => ctx.edit(path, n)} />;
  } else if (field.control === "bgm") {
    control = <MusicControl value={value} property={property} path={path} ctx={ctx} />;
  } else if (field.control === "fly") {
    control = (
      <div className="ow-header-fly">
        {(["x", "y", "z"] as const).map((axis) => (
          <div key={axis} className="ow-header-axis"><span>{axis.toUpperCase()}</span>
            <BaseField schema={property.properties?.[axis] ?? {}} value={value instanceof Map ? value.get(axis) ?? 0 : 0} path={[...path, axis]} ctx={ctx} />
          </div>
        ))}
      </div>
    );
  } else {
    control = <BaseField schema={{ ...property, description: undefined }} value={value} path={path} ctx={ctx} />;
  }
  return (
    <>
      <span className="ow-condition-label" title={field.key}>{field.label}</span>
      <div className="ow-header-control" data-field={field.key}>
        {control}
        {optional && value !== undefined && (
          <button className="icon" title="Leave this field out of the file" onClick={() => ctx.edit(path, undefined)}>×</button>
        )}
        {field.control === "encounters" && <button className="link" onClick={() => navigate("encounters")}>Encounter Editor</button>}
        {field.control === "weather" && <button className="link" title="Sets the weather by date, which beats this" onClick={() => navigate("weather")}>Weather Editor</button>}
        {hint && <div className="muted hint">{hint}</div>}
        {here.map((e, i) => <div key={i} className="field-error">{e.message}</div>)}
      </div>
    </>
  );
}

function WeatherControl({ value, weathers, onChange }: { value: JsonValue; weathers: string[]; onChange(n: number): void }) {
  const n = typeof value === "number" ? value : 0;
  const options = weathers.map((w, i) => ({ value: String(i), label: weatherLabel(w), detail: String(i) }));
  if (n >= weathers.length) options.push({ value: String(n), label: "Not in the game's list", detail: String(n) });
  return <SearchSelect value={String(n)} options={options} onChange={(v) => onChange(Number(v))} placeholder="A weather" />;
}

/** The music: one song, or one for each season. */
function MusicControl({ value, property, path, ctx }: { value: JsonValue; property: Schema; path: JsonPath; ctx: FormContext }) {
  const seasonal = value instanceof Map;
  const [song, seasons] = property.anyOf ?? [];
  return (
    <div className="ow-header-music">
      <span className="view-switch">
        <button className={!seasonal ? "active" : ""} onClick={() => {
          if (seasonal) ctx.edit(path, value.get("spring") ?? defaultFor(song, ctx));
        }}>One song</button>
        <button className={seasonal ? "active" : ""} title={seasons?.description} onClick={() => {
          if (!seasonal) ctx.edit(path, fromPlain(Object.fromEntries(SEASONS.map((s) => [s, value]))));
        }}>By season</button>
      </span>
      {seasonal ? (
        <div className="ow-condition ow-header-seasons">
          {SEASONS.map((s) => (
            <SeasonSong key={s} season={s} value={value.get(s) ?? 0} song={song} path={[...path, s]} ctx={ctx} />
          ))}
        </div>
      ) : <BaseField schema={song ?? {}} value={value} path={path} ctx={ctx} />}
    </div>
  );
}

function SeasonSong({ season, value, song, path, ctx }: { season: string; value: JsonValue; song: Schema; path: JsonPath; ctx: FormContext }) {
  return (
    <>
      <span className="ow-condition-label">{season[0].toUpperCase() + season.slice(1)}</span>
      <BaseField schema={song} value={value} path={path} ctx={ctx} />
    </>
  );
}
