// The wild Pokémon of a zone's area at a glance, over the Overworld Editor's map: every habitat of the new encounter
// data (res/paperwhite2/encounters/species/<species>.json) that names the area or a group of it, with its methods,
// seasons, times, rarity, levels, weather and extra conditions, filtered by a season, a time and a method and sorted
// by any column. A reference for what's realistic to put in the area; the Encounter Editor edits them.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { SpeciesIcon } from "../pokemon/SpeciesIcon.tsx";
import { METHODS, SEASONS, TIMES, WEATHERS, type Method, type Season, type Time } from "../encounters/model.ts";
import { Chips, label, timeLabel } from "../encounters/ui.tsx";

const SPECIES_SCHEMA = "res/paperwhite2/encounters/species.schema.json";
const GROUPS = "res/paperwhite2/encounters/groups.json";
const SETTINGS = "res/paperwhite2/encounters/settings.json";

interface Slot { methods?: Method[]; rarity?: string; times?: Time[]; weather?: string[] }
interface HabitatFile extends Slot { places: string[]; form?: number; seasons?: Season[]; by_season?: Partial<Record<Season, Slot>>; when?: unknown }
interface SpeciesFile { levels: { min: number; max: number }; habitats: HabitatFile[]; overworld?: { appears?: string } }

/** One habitat's slot in the area: the species, its seasons, and what the slot says. */
interface Row {
  key: string;
  species: string;
  name: string;
  form: number;
  seasons: Season[];
  methods: Method[];
  rarity: string;
  times: Time[];
  weather: string[];
  levels: { min: number; max: number };
  when: string;
  appears: string;
}

type Column = "name" | "methods" | "seasons" | "times" | "rarity" | "levels";
const COLUMNS: { id: Column; label: string }[] = [
  { id: "name", label: "Pokémon" }, { id: "methods", label: "Methods" }, { id: "seasons", label: "Seasons" },
  { id: "times", label: "Times" }, { id: "rarity", label: "Rarity" }, { id: "levels", label: "Levels" },
];

export function WildPanel({ zone, onClose }: { zone: string; onClose(): void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [tiers, setTiers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [times, setTimes] = useState<Time[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [sort, setSort] = useState<{ by: Column; up: boolean }>({ by: "rarity", up: true });

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    (async () => {
      const header = JSON.parse((await api.file(`res/field/zones/${zone}.json`)).text) as { encounters?: string };
      const id = header.encounters?.replace(/^ENCOUNTERS_/, "").toLowerCase() ?? null;
      const [groupsFile, settingsFile, species] = await Promise.all([
        api.file(GROUPS).then((f) => JSON.parse(f.text) as { groups: { id: string; areas: string[] }[] }, () => ({ groups: [] })),
        api.file(SETTINGS).then((f) => JSON.parse(f.text) as { tiers?: { id: string }[] }, () => ({ tiers: [] })),
        api.data(SPECIES_SCHEMA),
      ]);
      if (!live) return;
      setArea(id);
      setTiers((settingsFile.tiers ?? []).map((t) => t.id));
      if (!id) { setRows([]); return; }
      const names = (place: string) => {
        const g = place.replace(/^group:/, "");
        return place === id || !!groupsFile.groups.find((x) => x.id === g)?.areas.includes(id);
      };
      const found: Row[] = [];
      for (const { path, data } of species) {
        const folder = path.replace(/^.*\//, "").replace(/\.json$/, "");
        const file = data as unknown as SpeciesFile;
        file.habitats?.forEach((h, i) => {
          if (!h.places.some(names)) return;
          const slots: [Season[], Slot][] = h.by_season
            ? (Object.entries(h.by_season) as [Season, Slot][]).map(([s, slot]) => [[s], slot])
            : [[h.seasons ?? [...SEASONS], h]];
          slots.forEach(([ss, slot], k) => found.push({
            key: `${folder}:${i}:${k}`, species: `SPECIES_${folder.toUpperCase()}`, name: label(folder), form: h.form ?? 0,
            seasons: ss, methods: slot.methods ?? [], rarity: slot.rarity ?? "", times: slot.times ?? [...TIMES],
            weather: slot.weather ?? [], levels: file.levels, when: h.when ? JSON.stringify(h.when) : "",
            appears: file.overworld?.appears ?? "both",
          }));
        });
      }
      setRows(found);
    })().catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [zone]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const rank = (r: Row, by: Column): string | number => {
      switch (by) {
        case "name": return r.name;
        case "methods": return METHODS.findIndex((m) => r.methods.includes(m.id));
        case "seasons": return SEASONS.findIndex((s) => r.seasons.includes(s));
        case "times": return TIMES.findIndex((t) => r.times.includes(t));
        case "rarity": return tiers.indexOf(r.rarity) < 0 ? 99 : tiers.indexOf(r.rarity);
        case "levels": return r.levels.min;
      }
    };
    return rows
      .filter((r) => (!seasons.length || r.seasons.some((s) => seasons.includes(s))) && (!times.length || r.times.some((t) => times.includes(t)))
        && (!methods.length || r.methods.some((m) => methods.includes(m))))
      .sort((a, b) => {
        const x = rank(a, sort.by), y = rank(b, sort.by);
        const c = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
        return (sort.up ? c : -c) || a.name.localeCompare(b.name);
      });
  }, [rows, seasons, times, methods, sort, tiers]);

  return (
    <div className="ow-wild-panel">
      <div className="me-overworld-head">
        <strong>Wild Pokémon</strong>
        <span className="muted">{area ? `area ${area}` : "no encounter area"}{rows ? ` · ${shown.length} of ${rows.length}` : ""}</span>
        <span className="spacer" />
        <button onClick={onClose}>Close</button>
      </div>
      <div className="ow-condition ow-wild-filters">
        <span className="ow-condition-label">Season</span>
        <span><Chips<Season> all={SEASONS} on={seasons} labelOf={label} onChange={setSeasons} classOf={(v) => `season-chip-${v}`} />{!seasons.length && <span className="muted"> any</span>}</span>
        <span className="ow-condition-label">Time</span>
        <span><Chips<Time> all={TIMES} on={times} labelOf={timeLabel} onChange={setTimes} />{!times.length && <span className="muted"> any</span>}</span>
        <span className="ow-condition-label">Method</span>
        <span><Chips<Method> all={METHODS.map((m) => m.id)} on={methods} labelOf={(m) => METHODS.find((x) => x.id === m)!.short} onChange={setMethods} />
          {!methods.length && <span className="muted"> any</span>}</span>
      </div>
      {error ? <p className="ow-error">{error}</p> : !rows ? <p className="muted">Reading the encounters…</p> : !rows.length ? (
        <p className="muted">No habitat names this area. The Encounter Editor adds them.</p>
      ) : (
        <div className="ow-wild-table-wrap">
          <table className="ow-wild-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.id} onClick={() => setSort({ by: c.id, up: sort.by === c.id ? !sort.up : true })} title="Sort by this">
                    {c.label}{sort.by === c.id ? (sort.up ? " ▲" : " ▼") : ""}
                  </th>
                ))}
                <th>Conditions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key}>
                  <td><span className="ow-wild-name"><SpeciesIcon species={r.species} size={24} /> {r.name}{r.form ? <span className="muted"> form {r.form}</span> : null}
                    {r.appears !== "both" && <span className="muted small"> ({r.appears === "steps" ? "steps only" : "overworld only"})</span>}</span></td>
                  <td>{r.methods.map((m) => METHODS.find((x) => x.id === m)?.short ?? m).join(", ")}</td>
                  <td>{r.seasons.length === SEASONS.length ? "all" : r.seasons.map(label).join(", ")}</td>
                  <td>{r.times.length === TIMES.length ? "all" : r.times.map(timeLabel).join(", ")}</td>
                  <td>{label(r.rarity)}</td>
                  <td>{r.levels.min === r.levels.max ? r.levels.min : `${r.levels.min}–${r.levels.max}`}</td>
                  <td className="muted small">
                    {[r.weather.length ? r.weather.map((w) => WEATHERS.find((x) => x.id === w)?.label ?? w).join("/") : "", r.when].filter(Boolean).join("; ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Levels are the species' gate and cap; the game scales them to the party. The Encounter Editor edits these.</p>
    </div>
  );
}
