// Small pieces the Encounter Editor's pages share: a species' icon, labels, the context bar, the time and place
// pickers and a season's slot editor.

import { useMemo } from "react";
import { api } from "../../api.ts";
import { constantLabel } from "../schema-form/form.tsx";
import type { EditorState } from "./EncounterEditor.tsx";
import { METHODS, SEASONS, TIME_GROUPS, TIMES, WEATHERS, type Context, type EncounterSettings, type Method, type Slot, type SpeciesInfo,
  type Time } from "./model.ts";
import { scaledLevel } from "./resolve.ts";

export const label = (name: string) => name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
export const timeLabel = (t: Time) => (t === "late_night" ? "Late night" : label(t));
export const percent = (n: number) => (n >= 10 || n === 0 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2)) + "%";

export const weatherLabel = (id: string) => WEATHERS.find((w) => w.id === id)?.label ?? id;

export function Icon({ info, size = 32 }: { info: SpeciesInfo | undefined; size?: number }) {
  if (!info) return <span className="enc-icon" style={{ width: size, height: size }} />;
  return (
    <span className="enc-icon" title={info.name} style={{
      width: size, height: size, backgroundImage: `url(${api.assetUrl(`res/pokemon/${info.folder}/icon.png`)})`,
      backgroundSize: `${size}px ${size * 2}px`,
    }} />
  );
}

export function TypeChips({ types }: { types: string[] }) {
  return (
    <span className="enc-types">
      {types.map((t) => <span key={t} className={`enc-type t-${t.slice(5).toLowerCase()}`}>{constantLabel(t, "TYPE_")}</span>)}
    </span>
  );
}

export function ContextBar({ ctx, setCtx, settings }: {
  ctx: Context;
  setCtx(c: Context): void;
  settings: EncounterSettings;
}) {
  return (
    <div className="enc-context" title="What the shares, levels and the map are computed under">
      <span className="muted small">Preview under</span>
      <select value={ctx.season} onChange={(e) => setCtx({ ...ctx, season: e.target.value as Context["season"] })}>
        {SEASONS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
      </select>
      <select value={ctx.time} onChange={(e) => setCtx({ ...ctx, time: e.target.value as Time })}>
        {TIME_GROUPS.map((g) => (
          <optgroup key={g.name} label={g.name}>
            {g.times.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}
          </optgroup>
        ))}
      </select>
      <select value={ctx.weather} onChange={(e) => setCtx({ ...ctx, weather: e.target.value })}>
        {WEATHERS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
      </select>
      <label className="enc-inline">
        Party Lv.
        <input type="number" min={1} max={100} value={ctx.partyLevel}
               onChange={(e) => setCtx({ ...ctx, partyLevel: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
      </label>
      <span className="muted small">scaled Lv. {scaledLevel(ctx.partyLevel, settings)}</span>
      <label className="enc-check" title="A day when a place has its outbreak">
        <input type="checkbox" checked={ctx.outbreak} onChange={(e) => setCtx({ ...ctx, outbreak: e.target.checked })} />Outbreaks
      </label>
    </div>
  );
}

/** The periods as Day and Night, each a box that sets its periods together, with the periods under it. */
export function TimePicker({ times, onChange }: { times: Time[]; onChange(times: Time[]): void }) {
  const set = (list: Time[], on: boolean) => {
    const next = new Set(times);
    for (const t of list) on ? next.add(t) : next.delete(t);
    onChange(TIMES.filter((t) => next.has(t)));
  };
  return (
    <div className="enc-times">
      {TIME_GROUPS.map((g) => {
        const count = g.times.filter((t) => times.includes(t)).length;
        return (
          <div key={g.name} className="enc-time-group">
            <label className="enc-check strong">
              <input type="checkbox" checked={count === g.times.length}
                     ref={(el) => {
                       if (el) el.indeterminate = count > 0 && count < g.times.length;
                     }}
                     onChange={(e) => set(g.times, e.target.checked)} />
              {g.name}
            </label>
            {g.times.map((t) => (
              <label key={t} className="enc-check sub">
                <input type="checkbox" checked={times.includes(t)} onChange={(e) => set([t], e.target.checked)} />
                {timeLabel(t)}
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function Chips<T extends string>({ all, on, labelOf, onChange, classOf }: {
  all: readonly T[];
  on: T[];
  labelOf(v: T): string;
  onChange(v: T[]): void;
  /** A class for a chip that is on, such as its season's colour. */
  classOf?(v: T): string;
}) {
  return (
    <span className="enc-chips">
      {all.map((v) => (
        <button key={v} className={`chip${on.includes(v) ? ` active ${classOf?.(v) ?? ""}` : ""}`}
                onClick={() => onChange(on.includes(v) ? on.filter((x) => x !== v) : all.filter((x) => x === v || on.includes(x)))}>
          {labelOf(v)}
        </button>
      ))}
    </span>
  );
}

/** An area's or a group's name; a group's says how many areas it has when asked. */
export function placeLabel(state: EditorState, place: string, withCount = false): string {
  const group = state.draft.groups.find((g) => g.id === place);
  if (group) return withCount ? `${group.name} (all ${group.areas.length})` : `${group.name} (all)`;
  return state.draft.areas.find((a) => a.id === place)?.name ?? place;
}

/** The places a habitat names: chips to remove, and a list to add an area or a whole group. */
export function PlacesPicker({ state, places, onChange }: { state: EditorState; places: string[]; onChange(places: string[]): void }) {
  const { areas, groups } = state.draft;
  const sorted = useMemo(() => [...areas].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [areas]);
  const add = (place: string) => {
    if (!place || places.includes(place)) return;
    // A group replaces its own areas
    const group = groups.find((g) => g.id === place);
    onChange([...places.filter((p) => !group?.areas.includes(p)), place]);
  };
  return (
    <span className="enc-places">
      {places.map((p) => (
        <span key={p} className={`enc-place-chip${p.startsWith("group:") ? " group" : ""}`}>
          {placeLabel(state, p)}
          <button className="link small" title="Open the area" onClick={() => state.showArea(groups.find((g) => g.id === p)?.areas[0] ?? p)}>↗</button>
          {places.length > 1 && <button className="icon" title="Remove" onClick={() => onChange(places.filter((x) => x !== p))}>×</button>}
        </span>
      ))}
      <select value="" onChange={(e) => add(e.target.value)} title="Add a place">
        <option value="">+ place</option>
        <optgroup label="Groups (every area)">
          {groups.map((g) => <option key={g.id} value={g.id} disabled={places.includes(g.id)}>{g.name} ({g.areas.length})</option>)}
        </optgroup>
        <optgroup label="Areas">
          {sorted.map((a) => <option key={a.id} value={a.id} disabled={places.includes(a.id)}>{a.name}</option>)}
        </optgroup>
      </select>
    </span>
  );
}

/** One season's settings (or every season's, for a coupled habitat): methods, rarity, periods and weather. */
export function SlotEditor({ state, slot, onChange, hideTier = false }: {
  state: EditorState;
  slot: Slot;
  onChange(slot: Slot): void;
  hideTier?: boolean;
}) {
  return (
    <div className="enc-slot">
      <span className="enc-slot-methods">
        <Chips<Method> all={METHODS.map((m) => m.id)} on={slot.methods} labelOf={(m) => METHODS.find((x) => x.id === m)!.label}
                       onChange={(methods) => methods.length && onChange({ ...slot, methods })} />
      </span>
      {!hideTier && (
        <select value={slot.tier} onChange={(e) => onChange({ ...slot, tier: e.target.value })} title="Rarity">
          {state.settings.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          {!state.settings.tiers.some((t) => t.id === slot.tier) && <option value={slot.tier}>{slot.tier} (no such tier)</option>}
        </select>
      )}
      <TimePicker times={slot.times} onChange={(times) => onChange({ ...slot, times })} />
      <WeatherPicker on={slot.weather} onChange={(weather) => onChange({ ...slot, weather })} />
    </div>
  );
}

export function WeatherPicker({ on, onChange }: { on: string[]; onChange(w: string[]): void }) {
  return (
    <details className="enc-weather">
      <summary className="chip">{on.length ? on.map(weatherLabel).join(", ") : "Any weather"}</summary>
      <div className="enc-weather-list">
        <label className="enc-check"><input type="checkbox" checked={!on.length} onChange={() => onChange([])} />Any</label>
        {WEATHERS.map((w) => (
          <label key={w.id} className="enc-check">
            <input type="checkbox" checked={on.includes(w.id)}
                   onChange={(e) => onChange(e.target.checked ? WEATHERS.map((x) => x.id).filter((x) => x === w.id || on.includes(x)) : on.filter((x) => x !== w.id))} />
            {w.label}
          </label>
        ))}
      </div>
    </details>
  );
}

/** A slot in a few words, for the habitat map: methods, rarity, periods and weather. */
export function slotSummary(state: EditorState, slot: Slot): string {
  const methods = slot.methods.map((m) => METHODS.find((x) => x.id === m)?.short ?? m).join("/");
  const tier = state.settings.tiers.find((t) => t.id === slot.tier)?.name ?? slot.tier;
  const day = TIME_GROUPS[0].times.every((t) => slot.times.includes(t));
  const night = TIME_GROUPS[1].times.every((t) => slot.times.includes(t));
  const times = day && night ? "" : day && slot.times.length === 3 ? "Day" : night && slot.times.length === 2 ? "Night" : slot.times.map(timeLabel).join("+");
  const weather = slot.weather.length ? slot.weather.map(weatherLabel).join("/") : "";
  return [methods, tier, times, weather].filter(Boolean).join(" · ");
}
