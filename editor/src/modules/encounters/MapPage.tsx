// The Map page: Unova's places from the town map over the game's own map art, each shaded by a measure of its wild
// Pokémon under the preview's context: how many species, how even their shares are, where one Pokémon lives, or
// whether a way of meeting Pokémon there (its encounter rate isn't 0) has nothing to meet. A place's areas are those of
// its zone and of the zones whose parent it is. The ranked list beside the map keeps its height; clicking a place (on
// the map or in the list) lists its Pokémon under it until another is clicked, with a button to open its area.

import { useMemo, useState } from "react";
import type { EditorState } from "./EncounterEditor.tsx";
import { areasByPlace } from "./lookup.ts";
import { METHODS, type Method } from "./model.ts";
import { measure, placeOdds, type Odds } from "./resolve.ts";
import { RegionMap, SCHEMES, schemeColor, schemeGradient, type SchemeId } from "./RegionMap.tsx";
import { Chips, Icon, label, percent } from "./ui.tsx";

const GROUPS: { id: string; label: string; methods: Method[] }[] = [
  { id: "land", label: "On land", methods: ["grass", "dark_grass", "rustling"] },
  { id: "water", label: "On water", methods: ["surf", "rippling_surf"] },
  { id: "fishing", label: "Fishing", methods: ["fishing", "rippling_fishing"] },
  { id: "all", label: "Everything", methods: METHODS.map((m) => m.id) },
  ...METHODS.map((m) => ({ id: m.id, label: m.label, methods: [m.id] as Method[] })),
];

type Metric = "species" | "diversity" | "pokemon" | "empty";
const METRICS: { id: Metric; label: string; note: string }[] = [
  { id: "species", label: "Number of species", note: "Darker or later in the scheme is more. A hollow place has nothing by these methods now." },
  { id: "diversity", label: "Diversity (effective species)", note: "4 Pokémon at equal shares read 4; one Pokémon at 97% reads close to 1." },
  { id: "pokemon", label: "Where one Pokémon lives", note: "Its share of each place's encounters by these methods." },
  { id: "empty", label: "Methods with nothing to meet", note: "1: a method has an encounter rate here (in this season) but no Pokémon now; 0: every method with a rate has some." },
];

interface PlaceResult {
  zone: string;
  name: string;
  areas: string[];
  odds: Odds[];
  value: number;
  /** For the empty measure: the areas and methods with a rate but nothing to meet. */
  empty: string[];
}

export function MapPage({ state }: { state: EditorState }) {
  const { loaded, draft, settings, ctx } = state;
  const [group, setGroup] = useState("land");
  const [metric, setMetric] = useState<Metric>("species");
  const [scheme, setScheme] = useState<SchemeId>("accent");
  const [art, setArt] = useState(true);
  const [pokemon, setPokemon] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  // The methods the empty measure leaves out
  const [omitted, setOmitted] = useState<Method[]>([]);
  const methods = GROUPS.find((g) => g.id === group)!.methods;
  const byPlace = useMemo(() => areasByPlace(loaded), [loaded]);
  const rates = useMemo(() => new Map(draft.areas.map((a) => [a.id, a.rates])), [draft.areas]);

  const results: PlaceResult[] = useMemo(() => loaded.places.map((place) => {
    const areas = byPlace.get(place.zone) ?? [];
    // A place's odds: each area and method's own, averaged over those that have any, so places of several zones
    // compare with places of one
    const empty: string[] = [];
    const parts: Odds[][] = [];
    for (const a of areas) {
      for (const m of methods) {
        const odds = placeOdds(draft, settings, ctx, a, m);
        if (odds.some((o) => !o.item)) parts.push(odds.filter((o) => !o.item));
        else if (rates.get(a)?.[ctx.season][m] && !omitted.includes(m) && !odds.length) empty.push(`${label(a)}: ${METHODS.find((x) => x.id === m)!.label}`);
      }
    }
    const merged = new Map<string, Odds>();
    for (const part of parts) {
      for (const o of part) {
        const key = `${o.species}:${o.form}`;
        const prev = merged.get(key);
        merged.set(key, prev ? { ...prev, share: prev.share + o.share / parts.length,
          levels: [Math.min(prev.levels[0], o.levels[0]), Math.max(prev.levels[1], o.levels[1])] } : { ...o, share: o.share / parts.length });
      }
    }
    const odds = [...merged.values()].sort((a, b) => b.share - a.share);
    const m = measure(odds);
    const value = metric === "species" ? m.species : metric === "diversity" ? m.diversity : metric === "empty" ? (empty.length ? 1 : 0) :
      odds.filter((o) => o.species === pokemon).reduce((sum, o) => sum + o.share, 0);
    return { zone: place.zone, name: label(place.zone.replace(/^ZONE_/, "").toLowerCase()), areas, odds, value, empty };
  }), [loaded.places, byPlace, methods, draft, settings, ctx, metric, pokemon, rates, omitted]);

  const max = metric === "empty" ? 1 : Math.max(1, ...results.map((r) => r.value));
  const byZone = new Map(results.map((r) => [r.zone, r]));
  const shown = pinned ? byZone.get(pinned) : hover ? byZone.get(hover) : undefined;
  const ranked = results.filter((r) => r.areas.length).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const wild = useMemo(() => [...draft.species.keys()].map((id) => loaded.species.get(id)!).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name)), [draft.species, loaded.species]);
  const format = (v: number) => (metric === "pokemon" ? percent(v) : metric === "diversity" ? v.toFixed(1) : String(v));

  return (
    <div className="enc-map-page">
      <div className="enc-row enc-map-tools">
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
          {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        {metric === "pokemon" && (
          <select value={pokemon} onChange={(e) => setPokemon(e.target.value)}>
            <option value="">Choose a Pokémon</option>
            {wild.map((s) => <option key={s.species} value={s.species}>{s.name}</option>)}
          </select>
        )}
        <select value={scheme} onChange={(e) => setScheme(e.target.value as SchemeId)} title="Colours">
          {SCHEMES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <label className="enc-check"><input type="checkbox" checked={art} onChange={(e) => setArt(e.target.checked)} />Map art</label>
      </div>
      {metric === "empty" && (
        <div className="enc-row enc-map-tools">
          <span className="small">Leave out</span>
          <Chips<Method> all={methods} on={omitted} labelOf={(m) => METHODS.find((x) => x.id === m)!.label} onChange={setOmitted} />
        </div>
      )}
      <p className="muted small enc-map-note">{METRICS.find((m) => m.id === metric)!.note}</p>
      <div className="enc-map-layout">
        <div className="enc-map">
          <RegionMap places={loaded.places} art={art} hover={pinned ?? hover} onHover={setHover} onClick={(p) => setPinned(p.zone)}
                     styleOf={(p) => {
                       const r = byZone.get(p.zone)!;
                       if (!r.areas.length) return art ? null : { title: r.name };
                       const title = `${r.name}: ${format(r.value)}`;
                       if (r.value === 0 && metric !== "empty") return { title };
                       return { ...schemeColor(scheme, r.value / max), title };
                     }} />
          <div className="enc-map-legend small muted">
            <span>0</span><span className="enc-map-ramp" style={{ background: schemeGradient(scheme) }} /><span>{format(max)}</span>
          </div>
        </div>
        <aside className="enc-map-side">
          <div className="enc-card enc-ranked-card">
            <h3>Ranked</h3>
            <ol className="enc-ranked small">
              {ranked.map((r) => (
                <li key={r.zone} className={(pinned ?? hover) === r.zone ? "hover" : ""} onMouseEnter={() => setHover(r.zone)}
                    onClick={() => setPinned(r.zone)}>
                  <span>{r.name}</span><span className="muted">{format(r.value)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="enc-card">
            {shown ? (
              <>
                <div className="enc-row">
                  <h3>{shown.name}</h3>
                  <span className="spacer" />
                  {shown.areas[0] && <button onClick={() => state.showArea(shown.areas[0])}>Open area</button>}
                  {pinned && <button className="icon" title="Unpin" onClick={() => setPinned(null)}>×</button>}
                </div>
                <p className="small muted">{shown.areas.length ? `Areas: ${shown.areas.map(label).join(", ")}` : "No encounter areas"}</p>
                {shown.empty.length > 0 && <p className="small enc-warn">Nothing to meet: {shown.empty.join("; ")}</p>}
                <table className="enc-table">
                  <tbody>
                    {shown.odds.map((o) => (
                      <tr key={`${o.species}:${o.form}`} className="enc-click" onClick={() => state.showSpecies(o.species)}>
                        <td><Icon info={loaded.species.get(o.species)} /></td>
                        <td>{loaded.species.get(o.species)?.name ?? o.species}</td>
                        <td>{percent(o.share)}</td>
                        <td className="muted">Lv. {o.levels[0]}–{o.levels[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!shown.odds.length && <p className="small muted">Nothing by these methods now.</p>}
              </>
            ) : <p className="muted small">Click a place, on the map or in the list, to list its Pokémon here.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
