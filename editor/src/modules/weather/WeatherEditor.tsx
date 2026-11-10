// The Weather Editor (docs/paperwhite2/design/weather-editor.md): each location's weather by season. A zone's default
// is its zone header's "weather" (res/field/zones/<zone>.json); a zone with a calendar (res/field/weather_calendar/
// <zone>.json, in order.json's table) has a weather on each date of each season's months, which Paper White 2 picks
// one of each day. Every file is held through the documents (no tab), so the Changes panel, Save's check by the
// build's validator, undo and changes on disk work as for open files. Indoor zones get no weather.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { fromPlain, type JsonValue } from "../../../shared/json.ts";
import type { ToolProps } from "../types.ts";
import { useToolActive } from "../active.ts";
import { zoneLabel } from "../world/world.ts";
import {
  AREAS_DIR, CALENDAR_DIR, CALENDAR_SCHEMA, MONTHS, ORDER, SEASONS, ZONES_DIR, areaStem, calendarPath, canAddCalendar,
  checkTable, emptyYear, fillSeason, isOutdoor, monthsOf, newCalendar, paint, readYear, seasonDates, seasonMonths, seasonShares,
  sharedGroups, specialRule, tableOrder, writeMonths, zoneOfStem, type Months, type Year,
} from "./calendar.ts";
import { isSpecialWeather, weatherColor, weatherLabel, weatherNote } from "./weathers.ts";

const ZONE_SCHEMA = `${ZONES_DIR}/zone.schema.json`;
const AREA_SCHEMA = `${AREAS_DIR}/area.schema.json`;

interface ZoneInfo {
  zone: string;
  stem: string;
  path: string;
  number: number;
  label: string;
  place: string | null;
  outdoor: boolean;
}

interface Loaded {
  zones: ZoneInfo[];
  byZone: Map<string, ZoneInfo>;
  weathers: string[];
  limit: { max: number; source: string };
  /** The calendar files on disk when last listed, as zones. */
  files: string[];
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const percent = (n: number, total: number) => `${Math.round((100 * n) / total)}%`;

async function load(constants: ToolProps["constants"]): Promise<Loaded> {
  const [zoneFiles, areaFiles, schema, limit, files] = await Promise.all([
    api.data(ZONE_SCHEMA, ["area", "place"]), api.data(AREA_SCHEMA, ["exterior"]), api.schema(CALENDAR_SCHEMA),
    api.weatherCalendarLimit(), listCalendars(),
  ]);
  const exterior = new Map(areaFiles.map((f) => [f.path.slice(AREAS_DIR.length + 1, -5), f.data.exterior === true]));
  const zones = zoneFiles.map(({ path, data }): ZoneInfo => {
    const stem = path.slice(ZONES_DIR.length + 1, -5);
    const zone = zoneOfStem(stem);
    const place = typeof data.place === "string" ? zoneLabel(data.place.replace(/^PLACE_/, "").toLowerCase()) : null;
    return { zone, stem, path, number: constants.get(zone) ?? -1, label: zoneLabel(stem), place,
             outdoor: isOutdoor(data.area as string | number | null, exterior) };
  }).filter((z) => z.number >= 0).sort((a, b) => a.label.localeCompare(b.label));
  const weathers = (schema.$defs?.weather?.enum ?? []) as string[];
  return { zones, byZone: new Map(zones.map((z) => [z.zone, z])), weathers, limit, files };
}

async function listCalendars(): Promise<string[]> {
  const paths = await api.list(`${CALENDAR_DIR}/*.json`);
  return paths.map((p) => p.slice(p.lastIndexOf("/") + 1, -5)).filter((s) => s !== "order" && s !== "weather_calendar.schema").map(zoneOfStem);
}

/** A held calendar's months, or null while it isn't held. */
const monthsAt = (path: string): Months | null => {
  const data = documents.get(path)?.data;
  return data instanceof Map ? monthsOf(data.get("months")) : null;
};

export function WeatherEditor({ constants }: ToolProps) {
  const toolActive = useToolActive();
  const { docs } = useDocuments();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showIndoor, setShowIndoor] = useState(false);
  /** Calendars to remove on Save (their files exist on disk). */
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Undo steps: the files each step changed together (a group painted at once)
  const past = useRef<string[][]>([]);
  const future = useRef<string[][]>([]);

  const read = useCallback(async () => {
    setError(null);
    try {
      const l = await load(constants);
      await documents.hold(ORDER);
      await Promise.all(l.files.map((z) => documents.hold(calendarPath(z))));
      setLoaded(l);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [constants]);
  useEffect(() => { void read(); }, [read]);

  const orderData = docs.get(ORDER)?.data;
  const order = useMemo(() => {
    const zones = orderData instanceof Map ? orderData.get("zones") : null;
    return Array.isArray(zones) ? zones.map(String) : [];
  }, [orderData]);

  // The calendar zones in the table's order: order.json's, then the other files', less those being removed
  const calendarZones = useMemo(() => {
    if (!loaded) return [];
    const files = loaded.files.filter((z) => !removing.has(z));
    return tableOrder(order.filter((z) => !removing.has(z)), files, (z) => loaded.byZone.get(z)?.number ?? 0xffff);
  }, [loaded, order, removing]);

  const years = useMemo(() => {
    const out = new Map<string, { year: Year; errors: string[] }>();
    if (!loaded) return out;
    for (const zone of calendarZones) {
      const data = docs.get(calendarPath(zone))?.data;
      if (!(data instanceof Map)) continue;
      out.set(zone, readYear(monthsOf(data.get("months")), loaded.weathers));
    }
    return out;
  }, [docs, calendarZones, loaded]);

  const groups = useMemo(() => sharedGroups(new Map([...years].map(([z, y]) => [z, y.year]))), [years]);
  const groupOf = (zone: string) => groups.find((g) => g.includes(zone)) ?? [zone];

  const ownPaths = useMemo(() => new Set([ORDER, ...calendarZones.map(calendarPath), ...(loaded?.zones.map((z) => z.path) ?? [])]), [calendarZones, loaded]);
  const unsaved = [...docs.values()].filter((d) => d.dirty && ownPaths.has(d.path));
  const pendingRemovals = [...removing];

  const problems = useMemo(() => {
    if (!loaded) return [];
    const list: string[] = [];
    for (const [zone, { errors }] of years) for (const e of errors) list.push(`${calendarPath(zone)}: ${e}`);
    const files = [...new Set([...loaded.files.filter((z) => !removing.has(z)), ...calendarZones.filter((z) => docs.has(calendarPath(z)))])];
    list.push(...checkTable(order.filter((z) => !removing.has(z)), files, new Set(loaded.byZone.keys()), loaded.limit.max));
    for (const zone of calendarZones) if (loaded.byZone.get(zone) && !loaded.byZone.get(zone)!.outdoor) list.push(`${zoneLabel(loaded.byZone.get(zone)!.stem)} is indoors but has a calendar`);
    return list;
  }, [years, loaded, order, calendarZones, removing, docs]);

  /** Changes zones' years as one undo step (a drag continues the last step), each from its document as it is now, so
   * changes made before a render aren't lost. */
  const setYears = useCallback((zones: string[], make: (y: Year) => Year, continuing: boolean): boolean => {
    if (!loaded) return false;
    const paths: string[] = [];
    for (const zone of zones) {
      const path = calendarPath(zone);
      const before = monthsAt(path);
      if (!before) continue;
      const old = readYear(before, loaded.weathers).year;
      const year = make(old);
      if (old.every((m, i) => m.every((w, d) => w === year[i][d]))) continue;
      const months = writeMonths(before, year, loaded.weathers);
      if (continuing) documents.amend(path, ["months"], months);
      else documents.edit(path, ["months"], months);
      paths.push(path);
    }
    if (!continuing && paths.length) { past.current.push(paths); future.current = []; }
    return paths.length > 0;
  }, [loaded]);
  const editHeader = useCallback((path: string, weather: number) => {
    documents.edit(path, ["weather"], weather);
    past.current.push([path]);
    future.current = [];
  }, []);

  const save = useCallback(async () => {
    if (problems.length) { setMessage("Not saved: fix the problems listed first."); return; }
    setSaving(true);
    setMessage(null);
    try {
      // The calendars first, then the removals, then the table that names them
      for (const d of unsaved) if (d.path !== ORDER && !(await documents.save(d.path))) throw new Error(`${d.path}: ${documents.get(d.path)?.saveError ?? "not saved"}`);
      for (const zone of pendingRemovals) {
        await api.removeFile(calendarPath(zone));
        documents.close(calendarPath(zone));
      }
      if (documents.get(ORDER)?.dirty && !(await documents.save(ORDER))) throw new Error(`${ORDER}: ${documents.get(ORDER)?.saveError ?? "not saved"}`);
      setRemoving(new Set());
      const files = await listCalendars();
      setLoaded((l) => (l ? { ...l, files } : l));
      setMessage("Saved.");
    } catch (e) {
      setMessage(`Not everything was saved: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [problems, unsaved, pendingRemovals]);

  const revert = async () => {
    if (!confirm(`Throw away the changes to ${unsaved.length + pendingRemovals.length} file(s)?`)) return;
    for (const d of unsaved) {
      if (d.version) await documents.reload(d.path);
      else documents.close(d.path);
    }
    setRemoving(new Set());
    past.current = [];
    future.current = [];
  };

  useEffect(() => {
    if (!toolActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); e.stopPropagation(); void save(); return; }
      if ((key === "z" || key === "y") && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        const redo = key === "y" || e.shiftKey;
        const step = (redo ? future : past).current.pop();
        if (!step) return;
        e.preventDefault();
        e.stopPropagation();
        for (const p of step) (redo ? documents.redo(p) : documents.undo(p));
        (redo ? past : future).current.push(step);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, toolActive]);

  const addCalendar = (zone: string, from: string | null) => {
    if (!loaded) return;
    const check = canAddCalendar(calendarZones.length, loaded.limit.max);
    if (!check.ok) { setMessage(check.message); return; }
    const path = calendarPath(zone);
    if (removing.has(zone)) {
      const next = new Set(removing);
      next.delete(zone);
      setRemoving(next);
    } else {
      const year = from ? years.get(from)?.year ?? emptyYear() : emptyYear();
      documents.create(path, CALENDAR_SCHEMA, newCalendar(year, loaded.weathers));
    }
    if (!order.includes(zone)) documents.edit(ORDER, ["zones"], fromPlain([...order, zone]));
  };

  const removeCalendar = (zone: string) => {
    const path = calendarPath(zone);
    if (!confirm(`Remove ${zoneLabel(zone.replace(/^ZONE_/, "").toLowerCase())}'s calendar? It will have its default weather every day. The file is removed when you save.`)) return;
    if (loaded?.files.includes(zone)) setRemoving(new Set([...removing, zone]));
    else documents.close(path);
    if (order.includes(zone)) documents.edit(ORDER, ["zones"], fromPlain(order.filter((z) => z !== zone)));
  };

  if (error) return <div className="we-editor"><p className="we-error we-bar">{error}</p></div>;
  if (!loaded) return <div className="we-editor"><p className="muted we-bar">Reading the zones and calendars…</p></div>;

  const q = filter.trim().toLowerCase();
  const matches = (z: ZoneInfo) => !q || z.label.toLowerCase().includes(q) || (z.place ?? "").toLowerCase().includes(q) || z.zone.toLowerCase().includes(q);
  const withCalendar = groups.map((g) => g.map((z) => loaded.byZone.get(z)).filter((z): z is ZoneInfo => !!z && matches(z))).filter((g) => g.length);
  const calendarSet = new Set(calendarZones);
  const outdoor = loaded.zones.filter((z) => z.outdoor && !calendarSet.has(z.zone) && matches(z));
  const indoor = loaded.zones.filter((z) => !z.outdoor && !calendarSet.has(z.zone) && matches(z));
  const item = (z: ZoneInfo, detail: string) => (
    <button key={z.zone} className={`we-item${z.zone === chosen ? " selected" : ""}${z.outdoor ? "" : " indoor"}`} onClick={() => setChosen(z.zone)}>
      <span className="we-item-name">{z.label}</span>
      <span className="muted we-item-detail">{detail}</span>
    </button>
  );
  const headerWeather = (z: ZoneInfo) => {
    const v = docs.get(z.path)?.data;
    return v instanceof Map ? Number(v.get("weather") ?? 0) : null;
  };
  const limitCheck = canAddCalendar(calendarZones.length, loaded.limit.max);

  return (
    <div className="we-editor">
      <header className="we-header">
        <h2>Weather</h2>
        <span className={`we-count${limitCheck.ok ? "" : " full"}`} title={`The limit is ${loaded.limit.source}`}>{calendarZones.length} / {loaded.limit.max} zones with a calendar</span>
        <span className="muted we-note">Each day Paper White 2 picks one date of the season's months; a zone's weather is that date's.</span>
        <span className="spacer" />
        {(unsaved.length + pendingRemovals.length) > 0 && <span className="muted">{unsaved.length + pendingRemovals.length} unsaved</span>}
        <button onClick={revert} disabled={!unsaved.length && !pendingRemovals.length}>Revert</button>
        <button className="primary" onClick={save} disabled={saving || (!unsaved.length && !pendingRemovals.length)} title="Ctrl+S">Save</button>
      </header>
      {message && <p className={`we-bar ${message === "Saved." ? "muted" : "we-error"}`}>{message}</p>}
      {problems.length > 0 && <div className="we-bar we-error">{problems.map((p) => <div key={p}>{p}</div>)}</div>}
      {unsaved.filter((d) => d.saveError).map((d) => <p key={d.path} className="we-error we-bar">{d.path}: {d.saveError}</p>)}
      <div className="we-split">
        <div className="we-list">
          <input className="filter" placeholder={`Filter ${loaded.zones.length} zones…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="we-list-items">
            <div className="we-group">With a calendar <span className="muted">{calendarZones.length}</span></div>
            {withCalendar.map((g, i) => (
              <div key={i} className={g.length > 1 ? "we-shared" : ""} title={g.length > 1 ? "These zones share all their dates" : undefined}>
                {g.map((z) => item(z, years.get(z.zone)?.errors.length ? "problem" : g.length > 1 ? "shared" : ""))}
              </div>
            ))}
            <div className="we-group">Outdoors, default weather <span className="muted">{outdoor.length}</span></div>
            {outdoor.map((z) => item(z, z.place && z.place !== z.label ? z.place : ""))}
            <div className="we-group">
              <button className="link" onClick={() => setShowIndoor(!showIndoor)}>{showIndoor ? "▾" : "▸"} Indoors, no weather</button>
              <span className="muted">{indoor.length}</span>
            </div>
            {showIndoor && indoor.map((z) => item(z, "indoors"))}
          </div>
        </div>
        <div className="we-detail">
          {chosen && loaded.byZone.get(chosen)
            ? <ZonePage key={chosen} info={loaded.byZone.get(chosen)!} loaded={loaded} calendarZones={calendarZones}
                        year={years.get(chosen)?.year ?? null} group={groupOf(chosen)} headerWeather={headerWeather}
                        setYears={setYears} editHeader={editHeader} onAdd={(from) => addCalendar(chosen, from)} onRemove={() => removeCalendar(chosen)}
                        onOpen={setChosen} years={years} />
            : <p className="muted we-pad">Choose a location. Zones with a calendar have a weather on each date of each season; the others have their default weather every day.</p>}
        </div>
      </div>
    </div>
  );
}

function ZonePage({ info, loaded, calendarZones, year, group, headerWeather, setYears, editHeader, onAdd, onRemove, onOpen, years }: {
  info: ZoneInfo;
  loaded: Loaded;
  calendarZones: string[];
  year: Year | null;
  group: string[];
  headerWeather: (z: ZoneInfo) => number | null;
  setYears: (zones: string[], make: (y: Year) => Year, continuing: boolean) => boolean;
  editHeader: (path: string, weather: number) => void;
  onAdd: (from: string | null) => void;
  onRemove: () => void;
  onOpen: (zone: string) => void;
  years: Map<string, { year: Year; errors: string[] }>;
}) {
  const { weathers } = loaded;
  const [brush, setBrush] = useState(Math.max(0, weathers.indexOf("WEATHER_RAIN")));
  const [together, setTogether] = useState(true);
  const [fillSeasonIndex, setFillSeasonIndex] = useState(0);
  const [fillDays, setFillDays] = useState(10);
  const [fillWeather, setFillWeather] = useState(Math.max(0, weathers.indexOf("WEATHER_RAIN")));
  const [copyFrom, setCopyFrom] = useState("");
  const stroke = useRef<{ painted: boolean } | null>(null);
  useEffect(() => { void documents.hold(info.path); }, [info.path]);
  useEffect(() => {
    const up = () => { stroke.current = null; };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const header = headerWeather(info);
  const special = specialRule(info.zone, info.number);
  const targets = together ? group : [info.zone];
  const limit = canAddCalendar(calendarZones.length, loaded.limit.max);

  const apply = (make: (y: Year) => Year, continuing = false): boolean => setYears(targets, make, continuing);
  // A stroke is one undo step: its first change an edit, the rest amend it
  const paintDate = (month: number, day: number) => {
    if (!year) return;
    const edited = apply((y) => paint(y, [{ month, day }], brush), stroke.current?.painted ?? false);
    if (stroke.current && edited) stroke.current.painted = true;
  };

  const top = (
    <div className="we-top">
      <h2>{info.label}</h2>
      {info.place && info.place !== info.label && <span className="muted">{info.place}</span>}
      {!info.outdoor && <span className="we-badge">indoors</span>}
      {year && <span className="we-badge">calendar</span>}
      {special && <span className="we-badge" title={special}>special</span>}
      <span className="spacer" />
      {info.outdoor && (year
        ? <button onClick={onRemove} title="It will have its default weather every day">Remove calendar</button>
        : <button onClick={() => onAdd(copyFrom || null)} disabled={!limit.ok} title={limit.message}>Add a calendar</button>)}
    </div>
  );

  if (!info.outdoor) {
    return (
      <div className="we-page">
        {top}
        <section className="we-box">
          <h5>No weather <span className="muted">indoors</span></h5>
          <p className="muted we-note">This zone's area ({areaStem(String((documents.get(info.path)?.data as Map<string, JsonValue> | undefined)?.get("area") ?? "?"))}) isn't an exterior area,
            so it has no weather: the game would draw rain or snow inside. Weather is only offered for zones whose area has <code>"exterior": true</code>.</p>
        </section>
      </div>
    );
  }

  const weatherOptions = (value: number, onChange: (v: number) => void) => (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {weathers.map((w, i) => <option key={w} value={i}>{weatherLabel(w)}{isSpecialWeather(w) ? " (Entralink)" : ""}</option>)}
    </select>
  );

  return (
    <div className="we-page">
      {top}
      {!limit.ok && !year && <p className="we-error we-note">{limit.message}</p>}
      {special && <p className="muted we-note">{special}</p>}

      <section className="we-box">
        <h5>Default weather <span className="muted">{header === null ? "…" : weatherLabel(weathers[header] ?? String(header))}</span></h5>
        <div className="we-grid">
          <span className="we-label">Zone header</span>
          <span className="we-control">
            {header !== null && weatherOptions(header, (v) => editHeader(info.path, v))}
            {header !== null && <Swatch weather={weathers[header] ?? ""} />}
            <span className="muted we-hint">{year
              ? "This zone's weather while the game's season isn't the current one; the calendar gives it otherwise."
              : "This zone's weather every day. Add a calendar to give it weather by date."}</span>
          </span>
        </div>
      </section>

      {!year && (
        <section className="we-box">
          <h5>Calendar <span className="muted">none</span></h5>
          <div className="we-grid">
            <span className="we-label">Start from</span>
            <span className="we-control">
              <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                <option value="">Sunny every day</option>
                {calendarZones.map((z) => <option key={z} value={z}>{loaded.byZone.get(z)?.label ?? z}'s dates</option>)}
              </select>
              <button onClick={() => onAdd(copyFrom || null)} disabled={!limit.ok}>Add a calendar</button>
              <span className="muted we-hint">{limit.message}. A copy of another zone's dates gives both the same weather on the same days.</span>
            </span>
          </div>
        </section>
      )}

      {year && (
        <>
          <section className="we-box">
            <h5>Calendar <span className="muted">click or drag dates to paint them; each date has one weather</span></h5>
            <div className="we-grid">
              <span className="we-label">Brush</span>
              <span className="we-control we-palette">
                {weathers.map((w, i) => (
                  <button key={w} className={i === brush ? "active" : ""} onClick={() => setBrush(i)} title={weatherNote(w)}>
                    <Swatch weather={w} /> {weatherLabel(w)}
                  </button>
                ))}
                <span className="muted we-hint">{weatherNote(weathers[brush])} Clear (sunny) is the eraser.</span>
              </span>
              {group.length > 1 && (
                <>
                  <span className="we-label">Group</span>
                  <span className="we-control">
                    <label><input type="checkbox" checked={together} onChange={(e) => setTogether(e.target.checked)} /> Paint all {group.length} zones that share these dates</label>
                    <span className="muted we-hint">{group.map((z) => loaded.byZone.get(z)?.label ?? z).join(", ")}: neighbours keep the same weather on the same days.</span>
                  </span>
                </>
              )}
            </div>
            <div className="we-seasons">
              {SEASONS.map((season, s) => <SeasonStrip key={season} season={s} year={year} weathers={weathers}
                onDown={(m, d) => { stroke.current = { painted: false }; paintDate(m, d); }}
                onOver={(m, d) => { if (stroke.current) paintDate(m, d); }} />)}
            </div>
          </section>

          <section className="we-box">
            <h5>Quick fill <span className="muted">dates spread evenly, the same each time</span></h5>
            <div className="we-grid">
              <span className="we-label">Season</span>
              <span className="we-control">
                <span className="view-switch">
                  {SEASONS.map((season, s) => <button key={season} className={s === fillSeasonIndex ? "active" : ""} onClick={() => setFillSeasonIndex(s)}>{cap(season)}</button>)}
                </span>
                <span className="muted we-hint">{seasonMonths(fillSeasonIndex).map((m) => cap(MONTHS[m])).join(", ")}: {seasonDates(fillSeasonIndex).length} dates.</span>
              </span>
              <span className="we-label">Fill</span>
              <span className="we-control">
                <input type="number" className="we-number" min={0} max={seasonDates(fillSeasonIndex).length} value={fillDays}
                       onChange={(e) => setFillDays(Math.max(0, Math.min(seasonDates(fillSeasonIndex).length, Math.round(Number(e.target.value) || 0))))} />
                <span>days of</span>
                {weatherOptions(fillWeather, setFillWeather)}
                <button onClick={() => apply((y) => fillSeason(y, fillSeasonIndex, fillDays, fillWeather))}>Fill</button>
                <span className="muted we-hint">The season then has {weatherLabel(weathers[fillWeather])} on exactly {fillDays} dates (about {percent(fillDays, seasonDates(fillSeasonIndex).length)} of its days),
                  replacing what those dates had. The choice is nested: 10 days are among the 20-day choice's, so a zone with more falls on every day of a zone with less.</span>
              </span>
              <span className="we-label">Clear</span>
              <span className="we-control">
                <button onClick={() => apply((y) => paint(y, seasonDates(fillSeasonIndex), 0))}>Make {cap(SEASONS[fillSeasonIndex])} sunny</button>
                <span className="muted we-hint">Every date of the season back to sunny.</span>
              </span>
              <span className="we-label">Copy</span>
              <span className="we-control">
                <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                  <option value="">Another zone…</option>
                  {calendarZones.filter((z) => !group.includes(z)).map((z) => <option key={z} value={z}>{loaded.byZone.get(z)?.label ?? z}</option>)}
                </select>
                <button disabled={!copyFrom} onClick={() => { const from = years.get(copyFrom)?.year; if (from) apply(() => from.map((m) => [...m])); }}>Copy every date</button>
                <span className="muted we-hint">The whole year, so this zone then shares its dates with that one.</span>
              </span>
            </div>
          </section>

          <section className="we-box">
            <h5>Shares its dates with <span className="muted">{group.length > 1 ? `${group.length - 1} other zone${group.length > 2 ? "s" : ""}` : "no other zone"}</span></h5>
            <div className="we-control">
              {group.filter((z) => z !== info.zone).map((z) => <button key={z} onClick={() => onOpen(z)}>{loaded.byZone.get(z)?.label ?? z}</button>)}
              <span className="muted we-hint">Zones with exactly the same dates are a group; painting with “Paint all” keeps them together. Copy another zone's dates to join its group.</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Swatch({ weather }: { weather: string }) {
  return <span className="we-swatch" style={{ background: weatherColor(weather) }} />;
}

function SeasonStrip({ season, year, weathers, onDown, onOver }: {
  season: number;
  year: Year;
  weathers: string[];
  onDown: (month: number, day: number) => void;
  onOver: (month: number, day: number) => void;
}) {
  const { total, counts } = seasonShares(year, season);
  return (
    <div className="we-season">
      <div className="we-season-name">
        <strong>{cap(SEASONS[season])}</strong>
        <span className="muted">{total} dates</span>
      </div>
      <div className="we-months">
        {seasonMonths(season).map((m) => (
          <div key={m} className="we-month">
            <span className="muted we-month-name">{cap(MONTHS[m])}</span>
            <div className="we-days">
              {year[m].map((w, d) => (
                <span key={d} className="we-day" style={{ background: weatherColor(weathers[w] ?? "") }}
                      title={`${cap(MONTHS[m])} ${d + 1}: ${weatherLabel(weathers[w] ?? String(w))}`}
                      onMouseDown={(e) => { e.preventDefault(); onDown(m, d + 1); }} onMouseEnter={() => onOver(m, d + 1)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="we-shares">
        {[...counts].map(([w, n]) => (
          <span key={w} className="we-share"><Swatch weather={weathers[w] ?? ""} /> {weatherLabel(weathers[w] ?? String(w))} {n} / {total} days ({percent(n, total)})</span>
        ))}
      </div>
    </div>
  );
}
