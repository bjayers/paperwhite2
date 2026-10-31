// The Pokémon page: the list of species, sorted and filtered several ways, and the chosen one's encounter data in one
// place: its levels, battle styles, hidden ability and habitats (as a list or on the map), with each habitat's share
// under the preview's context and the file it would write.

import { Fragment, useMemo, useState } from "react";
import type { Constants } from "../../../shared/schema.ts";
import { constantLabel } from "../schema-form/form.tsx";
import type { EditorState } from "./EncounterEditor.tsx";
import { SOURCE_LABELS } from "./load.ts";
import { FamilyView } from "./FamilyView.tsx";
import { LEGENDARIES, WILD_WAYS, families, generationOf, obtainability, type Family, type Obtain } from "./lookup.ts";
import { ALL_TIMES, SEASONS, emptySeasons, newKey, presentSeasons, type Battles, type Habitat, type Season, type Slot,
  type SpeciesEncounters, type SpeciesInfo } from "./model.ts";
import { battlesOf, isLevelMet, levelRange, placeAreas, placeOdds } from "./resolve.ts";
import { SpeciesHabitatMap } from "./SpeciesHabitatMap.tsx";
import { GrottoesCard, OutbreaksCard } from "./WildExtras.tsx";
import { Chips, Icon, PlacesPicker, SlotEditor, TypeChips, label, percent, placeLabel } from "./ui.tsx";

type Sort = "dex" | "family" | "generation" | "name";
type Show = "all" | "wild" | "not_wild" | "family_not_wild" | "not_obtainable";
const SHOWS: { id: Show; label: string; title: string }[] = [
  { id: "all", label: "All Pokémon", title: "" },
  { id: "wild", label: "In the wild", title: "Has a habitat, an outbreak or a Hidden Grotto entry" },
  { id: "not_wild", label: "Not in the wild", title: "Has no habitat, outbreak or Hidden Grotto entry" },
  { id: "family_not_wild", label: "Family not in the wild", title: "No member of its family has a habitat, an outbreak or a Hidden Grotto entry" },
  { id: "not_obtainable", label: "Not obtainable", title: "No member of its family is wild, in a Hidden Grotto, traded, given or a static encounter" },
];

export function SpeciesPage({ state, constants, selected, select }: {
  state: EditorState;
  constants: Constants;
  selected: string | null;
  select(id: string): void;
}) {
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("wild");
  const [sort, setSort] = useState<Sort>("dex");
  const [type, setType] = useState("");
  const [legendaries, setLegendaries] = useState(false);
  const { loaded, draft } = state;
  const all = useMemo(() => [...loaded.species.values()].sort((a, b) => a.dex - b.dex), [loaded.species]);
  const familyOf = useMemo(() => {
    const map = new Map<string, Family>();
    for (const f of families(loaded.species).values()) for (const m of f.members) map.set(m.species, f);
    return map;
  }, [loaded.species]);
  const ways = useMemo(() => obtainability(loaded, draft, state.settings), [loaded, draft, state.settings]);
  const types = useMemo(() => [...new Set(all.flatMap((s) => s.types))].sort((a, b) => (constants.get(a) ?? 0) - (constants.get(b) ?? 0)), [all, constants]);

  const familyHas = (s: SpeciesInfo, test: (w: Obtain[]) => boolean) => familyOf.get(s.species)!.members.some((m) => test(ways.get(m.species) ?? []));
  const wild = (w: Obtain[]) => w.some((x) => WILD_WAYS.includes(x));
  const shown = (s: SpeciesInfo) => {
    const w = ways.get(s.species) ?? [];
    if (!legendaries && LEGENDARIES.has(s.species)) return false;
    switch (show) {
      case "wild": return wild(w);
      case "not_wild": return !wild(w);
      case "family_not_wild": return !familyHas(s, wild);
      case "not_obtainable": return !familyHas(s, (x) => x.length > 0);
      default: return true;
    }
  };
  const q = query.trim().toLowerCase();
  const list = all.filter((s) => shown(s) && (!type || s.types.includes(type)) && (!q || s.name.toLowerCase().includes(q) || s.folder.includes(q)));
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "family") {
    list.sort((a, b) => {
      const fa = familyOf.get(a.species)!, fb = familyOf.get(b.species)!;
      return fa.first - fb.first || fa.root.localeCompare(fb.root) || fa.members.indexOf(a) - fb.members.indexOf(b);
    });
  }
  const heading = (s: SpeciesInfo) => sort === "generation" ? generationOf(s.dex) :
    sort === "family" ? `${familyOf.get(s.species)!.members[0].name} family` : null;
  const current = selected ?? list[0]?.species ?? null;
  const familyCount = new Set(list.map((s) => familyOf.get(s.species)!.root)).size;

  return (
    <div className="enc-split">
      <aside className="enc-list">
        <div className="enc-list-tools">
          <input className="filter" placeholder="Find a Pokémon" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={show} onChange={(e) => setShow(e.target.value as Show)} title={SHOWS.find((s) => s.id === show)!.title}>
            {SHOWS.map((s) => <option key={s.id} value={s.id} title={s.title}>{s.label}</option>)}
          </select>
          <div className="enc-row">
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} title="Sort">
              <option value="dex">By number</option>
              <option value="family">By family</option>
              <option value="generation">By generation</option>
              <option value="name">By name</option>
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {types.map((t) => <option key={t} value={t}>{constantLabel(t, "TYPE_")}</option>)}
            </select>
          </div>
          <label className="enc-check"><input type="checkbox" checked={legendaries} onChange={(e) => setLegendaries(e.target.checked)} />Legendaries and mythicals</label>
          <p className="muted small">{list.length} Pokémon in {familyCount} families · {draft.species.size} in the wild</p>
        </div>
        <div className="enc-list-items">
          {list.map((s, i) => {
            const h = heading(s);
            const entry = draft.species.get(s.species);
            const other = (ways.get(s.species) ?? []).filter((w) => w !== "wild");
            return (
              <Fragment key={s.species}>
                {h && h !== (i > 0 ? heading(list[i - 1]) : null) && <div className="enc-list-heading">{h}</div>}
                <button className={`enc-list-item${s.species === current ? " selected" : ""}`} onClick={() => select(s.species)}
                        title={other.length ? `Also: ${other.map((w) => SOURCE_LABELS[w]).join(", ")}` : undefined}>
                  <Icon info={s} />
                  <span className="enc-list-name">{s.name}</span>
                  <span className="count">{entry?.habitats.length || (other.length ? "·" : "")}</span>
                </button>
              </Fragment>
            );
          })}
        </div>
      </aside>
      <section className="enc-detail">
        {current ? <SpeciesDetail key={current} state={state} info={loaded.species.get(current)!} ways={ways.get(current) ?? []}
                                  family={familyOf.get(current)!} select={select} /> :
          <p className="muted pad">No Pokémon matches.</p>}
      </section>
    </div>
  );
}

function SpeciesDetail({ state, info, ways, family, select }: {
  state: EditorState;
  info: SpeciesInfo;
  ways: Obtain[];
  family: Family;
  select(id: string): void;
}) {
  const [view, setView] = useState<"one" | "family">(() => (state.sharedFamilies.has(family.root) ? "family" : "one"));
  const { settings, ctx } = state;
  const entry = state.draft.species.get(info.species);
  const update = (change: Partial<SpeciesEncounters>) => entry && state.setSpecies(info.species, { ...entry, ...change });

  const switcher = family.members.length > 1 && (
    <div className="view-switch enc-family-switch">
      <button className={view === "one" ? "active" : ""} onClick={() => setView("one")}>{info.name}</button>
      <button className={view === "family" ? "active" : ""} onClick={() => setView("family")}>Whole family ({family.members.length})</button>
    </div>
  );
  if (view === "family" && family.members.length > 1) {
    return <FamilyView state={state} family={family} select={select} top={switcher} />;
  }

  if (!entry) {
    return (
      <div className="enc-page">
        {switcher}
        <SpeciesHeader state={state} info={info} ways={ways} />
        <p className="muted">{info.name} isn't found in the wild.</p>
        <button className="primary" onClick={() => state.setSpecies(info.species, {
          species: info.species, levels: { min: 5, max: 50 }, battles: null, hiddenAbility: null, habitats: [], outbreaks: [],
        })}>Add it to the wild</button>
        <GrottoesCard state={state} info={info} />
      </div>
    );
  }

  const met = isLevelMet(entry.levels, ctx.partyLevel, settings);
  const [lo, hi] = levelRange(entry.levels, ctx.partyLevel, settings);
  const battles = battlesOf(entry, settings);
  const battleTotal = battles.single + battles.double + battles.triple;
  const setBattles = (change: Partial<Battles>) => update({ battles: { ...battles, ...change } });

  return (
    <div className="enc-page">
      {switcher}
      <SpeciesHeader state={state} info={info} ways={ways} />

      <div className="enc-cards">
        <div className="enc-card">
          <h3>Levels</h3>
          <div className="enc-row">
            <label className="enc-inline">Min <input type="number" min={1} max={100} value={entry.levels.min}
              onChange={(e) => update({ levels: { ...entry.levels, min: Number(e.target.value) || 1 } })} /></label>
            <label className="enc-inline">Max <input type="number" min={1} max={100} value={entry.levels.max}
              onChange={(e) => update({ levels: { ...entry.levels, max: Number(e.target.value) || 1 } })} /></label>
          </div>
          <p className="small muted">
            It appears only once the {settings.levels.gate === "party" ? "party's level" : "scaled level"} reaches the minimum,
            and never above the maximum.
          </p>
          <p className={`small ${met ? "" : "enc-warn"}`}>
            At party Lv. {ctx.partyLevel}: {met ? `Lv. ${lo}–${hi}` : "doesn't appear yet"}
          </p>
          {entry.levels.min > entry.levels.max && <p className="small enc-warn">The minimum is above the maximum.</p>}
        </div>

        <div className="enc-card">
          <h3>Battles</h3>
          <label className="enc-check">
            <input type="checkbox" checked={entry.battles === null} onChange={(e) => update({ battles: e.target.checked ? null : { ...settings.battles } })} />
            Use the default
          </label>
          <div className="enc-row">
            {(["single", "double", "triple"] as const).map((k) => (
              <label key={k} className="enc-inline">{label(k)}
                <input type="number" min={0} max={100} value={battles[k]} disabled={entry.battles === null}
                       onChange={(e) => setBattles({ [k]: Math.max(0, Number(e.target.value) || 0) })} />%
              </label>
            ))}
          </div>
          {battleTotal !== 100 && <p className="small enc-warn">These add up to {battleTotal}%, not 100%.</p>}
          <p className="small muted">Fishing is always a single battle. A double needs two of the party's Pokémon that can fight, a triple three (with two, it's a double).</p>
          <div className="enc-row">
            <span className="small muted">Partners:</span>
            {(["family", "area"] as const).map((p) => (
              <label key={p} className="enc-check">
                <input type="radio" checked={battles.partners === p} disabled={entry.battles === null} onChange={() => setBattles({ partners: p })} />
                {p === "family" ? "Same family" : "Anything in the area"}
              </label>
            ))}
          </div>
        </div>

        <div className="enc-card">
          <h3>Hidden ability</h3>
          <p className="small">{info.hiddenAbility === "ABILITY_NONE" ? "None" : constantLabel(info.hiddenAbility, "ABILITY_")}</p>
          <label className="enc-check">
            <input type="checkbox" checked={entry.hiddenAbility === null}
                   onChange={(e) => update({ hiddenAbility: e.target.checked ? null : settings.hiddenAbility })} />
            Use the default ({settings.hiddenAbility}%)
          </label>
          {entry.hiddenAbility !== null && (
            <label className="enc-inline">Chance <input type="number" min={0} max={100} value={entry.hiddenAbility}
              onChange={(e) => update({ hiddenAbility: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />%</label>
          )}
        </div>
      </div>

      <Habitats state={state} info={info} entry={entry} update={update} />
      <OutbreaksCard state={state} info={info} entry={entry} update={update} />
      <GrottoesCard state={state} info={info} />

      <details className="enc-card enc-file">
        <summary>The file it would write: res/paperwhite2/encounters/species/{info.folder}.json</summary>
        <pre>{JSON.stringify(plannedFile(entry), null, 2)}</pre>
      </details>

      <button className="link" onClick={() => {
        if (confirm(`Take ${info.name} out of the wild? Its habitats are removed from the draft.`)) state.setSpecies(info.species, null);
      }}>Remove from the wild</button>
    </div>
  );
}

function SpeciesHeader({ state, info, ways }: { state: EditorState; info: SpeciesInfo; ways: Obtain[] }) {
  const sources = state.loaded.sources.get(info.species) ?? [];
  return (
    <header className="enc-species-header">
      <Icon info={info} size={64} />
      <div>
        <h2>{info.name} <span className="muted small">#{info.dex}</span></h2>
        <div className="enc-row">
          <TypeChips types={info.types} />
          {ways.map((w) => (
            <span key={w} className="enc-source" title={w === "wild" ? "Has a habitat" : sources.filter((s) => s.source === w).map((s) => s.where).join("\n")}>
              {SOURCE_LABELS[w]}
            </span>
          ))}
          {!ways.length && <span className="enc-source none">Not obtainable by itself</span>}
        </div>
      </div>
      <span className="spacer" />
      <button className="link" onClick={() => state.open(`res/pokemon/${info.folder}/data.json`)}>Species data…</button>
    </header>
  );
}

function newSlot(state: EditorState): Slot {
  return { methods: ["grass"], tier: state.settings.tiers[0].id, times: [...ALL_TIMES], weather: [] };
}

export function newHabitat(state: EditorState, entry: SpeciesEncounters): Habitat {
  const seasons = emptySeasons();
  for (const s of SEASONS) seasons[s] = newSlot(state);
  return { key: newKey(), places: [entry.habitats.at(-1)?.places[0] ?? state.draft.areas[0].id], form: 0, when: "", coupled: true, seasons };
}

export function Habitats({ state, info, entry, update }: {
  state: EditorState;
  info: SpeciesInfo;
  entry: SpeciesEncounters;
  update(change: Partial<SpeciesEncounters>): void;
}) {
  const [view, setView] = useState<"list" | "map">("list");
  const setHabitat = (key: string, h: Habitat) => update({ habitats: entry.habitats.map((x) => (x.key === key ? h : x)) });
  const add = () => update({ habitats: [...entry.habitats, newHabitat(state, entry)] });

  return (
    <div className="enc-card">
      <div className="enc-row">
        <h3>Habitats</h3>
        <div className="view-switch">
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button>
          <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Map</button>
        </div>
        <span className="muted small">{view === "list" ? `Share now: under the preview's context. Before: the current tables' share in ${label(state.ctx.season)}.` :
          "Where it lives in each season, and how it's met there."}</span>
        <span className="spacer" />
        {view === "list" && <button onClick={add}>Add habitat</button>}
      </div>
      {view === "map" ? <SpeciesHabitatMap state={state} entry={entry} /> : (
        <div className="enc-habitats">
          {entry.habitats.map((h) => <HabitatEditor key={h.key} state={state} info={info} h={h}
                                                    onChange={(next) => setHabitat(h.key, next)}
                                                    onRemove={() => update({ habitats: entry.habitats.filter((x) => x.key !== h.key) })} />)}
          {!entry.habitats.length && <p className="muted small">No habitats yet.</p>}
        </div>
      )}
    </div>
  );
}

export function HabitatEditor({ state, info, h, onChange, onRemove, hideTier = false }: {
  state: EditorState;
  info: SpeciesInfo;
  h: Habitat;
  onChange(h: Habitat): void;
  onRemove(): void;
  /** A family's shared habitat: each member's rarity is set beside it, not here. */
  hideTier?: boolean;
}) {
  const { draft, settings, ctx } = state;
  const present = presentSeasons(h);
  const first = present.length ? h.seasons[present[0]]! : newSlot(state);

  // The share now, in the context's season: this species' line in each method of each area the habitat names
  const slot = h.seasons[ctx.season];
  const areas = placeAreas(h.places, draft.groups);
  const shares = slot ? slot.methods.flatMap((m) => areas.map((a) =>
    placeOdds(draft, settings, ctx, a, m).find((o) => o.species === info.species && o.form === h.form)?.share ?? null))
    .filter((x): x is number => x !== null) : [];
  const before = draft.oldShares.filter((s) => s.species === info.species && areas.includes(s.area) && s.form === h.form && s.season === ctx.season &&
    (slot?.methods.includes(s.method) ?? false)).map((s) => s.share);
  const range = (list: number[]) => (!list.length ? null : Math.min(...list) === Math.max(...list) ? percent(list[0]) :
    `${percent(Math.min(...list))}–${percent(Math.max(...list))}`);

  const copy = (s: Slot): Slot => ({ ...s, methods: [...s.methods], times: [...s.times], weather: [...s.weather] });
  const setSeasons = (seasons: Season[]) => {
    const next = emptySeasons();
    for (const s of seasons) next[s] = h.seasons[s] ?? (h.coupled ? first : copy(first));
    onChange({ ...h, seasons: next });
  };
  const setShared = (shared: Slot) => {
    const next = emptySeasons();
    for (const s of present) next[s] = shared;
    onChange({ ...h, seasons: next });
  };
  const couple = (coupled: boolean) => {
    if (coupled && present.some((s) => JSON.stringify(h.seasons[s]) !== JSON.stringify(first)) &&
        !confirm(`Its seasons differ. Use ${label(present[0])}'s settings for all of them?`)) return;
    const next = emptySeasons();
    for (const s of present) next[s] = coupled ? first : copy(h.seasons[s]!);
    onChange({ ...h, coupled, seasons: next });
  };

  return (
    <div className="enc-habitat">
      <div className="enc-row enc-wrap">
        <PlacesPicker state={state} places={h.places} onChange={(places) => onChange({ ...h, places })} />
        {info.forms > 1 && (
          <label className="enc-inline">Form
            <select value={h.form} onChange={(e) => onChange({ ...h, form: Number(e.target.value) })}>
              {Array.from({ length: info.forms }, (_, i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
        )}
        <span className="spacer" />
        <span className="enc-share" title="Its share now, in each area and method it names / in the current tables">
          {range(shares) ?? <span className="muted">not now</span>}
          <span className="muted small"> · before {range(before) ?? "—"}</span>
        </span>
        <button className="icon" title="Remove" onClick={onRemove}>×</button>
      </div>
      <div className="enc-row">
        <Chips<Season> all={SEASONS} on={present} labelOf={label} onChange={setSeasons}
                       classOf={h.coupled ? undefined : (s) => `season-chip-${s}`} />
        <label className="enc-check" title="Checked: one set of settings for every season. Unchecked: each season has its own.">
          <input type="checkbox" checked={h.coupled} onChange={(e) => couple(e.target.checked)} />Same in every season
        </label>
      </div>
      {h.coupled ? (
        present.length ? <SlotEditor state={state} slot={first} onChange={setShared} hideTier={hideTier} /> :
          <p className="small enc-warn">It appears in no season.</p>
      ) : (
        <div className="enc-seasons">
          {present.map((s) => (
            <div key={s} className={`enc-season-slot season-${s}`}>
              <span className="enc-season-name">{label(s)}</span>
              <SlotEditor state={state} slot={h.seasons[s]!} hideTier={hideTier}
                          onChange={(next) => onChange({ ...h, seasons: { ...h.seasons, [s]: next } })} />
            </div>
          ))}
        </div>
      )}
      <details className="enc-when">
        <summary className="small muted">{h.when.trim() ? "More conditions (set)" : "More conditions"}</summary>
        <textarea rows={3} placeholder='Conditions-engine clauses, for example { "flags": { "set": ["EVENT_FLAG_..."] } }'
                  value={h.when} onChange={(e) => onChange({ ...h, when: e.target.value })} className={validJson(h.when) ? "" : "invalid"} />
      </details>
      {h.places.some((p) => p.startsWith("group:")) && (
        <p className="small muted">{h.places.map((p) => placeLabel(state, p, true)).join(" · ")}</p>
      )}
    </div>
  );
}

function validJson(text: string): boolean {
  if (!text.trim()) return true;
  try {
    const v = JSON.parse(text);
    return typeof v === "object" && v !== null && !Array.isArray(v);
  } catch {
    return false;
  }
}

function slotFile(slot: Slot) {
  return {
    methods: slot.methods,
    rarity: slot.tier,
    times: slot.times,
    ...(slot.weather.length ? { weather: slot.weather } : {}),
  };
}

/** The species' file in the planned format: what the editor will write once the build reads it. */
function plannedFile(entry: SpeciesEncounters) {
  return {
    $schema: "../species.schema.json",
    levels: entry.levels,
    ...(entry.battles ? { battles: entry.battles } : {}),
    ...(entry.hiddenAbility !== null ? { hidden_ability: entry.hiddenAbility } : {}),
    habitats: entry.habitats.map((h) => {
      const present = presentSeasons(h);
      return {
        places: h.places,
        ...(h.form ? { form: h.form } : {}),
        ...(h.coupled ? { seasons: present, ...(present.length ? slotFile(h.seasons[present[0]]!) : {}) } :
          { by_season: Object.fromEntries(present.map((s) => [s, slotFile(h.seasons[s]!)])) }),
        ...(h.when.trim() && validJson(h.when) ? { when: JSON.parse(h.when) } : {}),
      };
    }),
  };
}
