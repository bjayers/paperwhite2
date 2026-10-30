// A whole family on one page: each member's levels, and either each member's own habitats, or habitats the family
// shares. Shared habitats are linked copies in each member's data (Habitat.link): the places, seasons, methods,
// periods, weather and conditions are the same for every member, and each member keeps its own rarity (and its own
// levels, so the evolved members appear where the party is strong enough). It is the editor's way of showing them;
// each member's file still has its own copy.

import type { ReactNode } from "react";
import type { EditorState } from "./EncounterEditor.tsx";
import { importLevels } from "./convert.ts";
import type { Family } from "./lookup.ts";
import { SEASONS, newKey, presentSeasons, type Habitat, type SpeciesEncounters, type SpeciesInfo } from "./model.ts";
import { namesArea } from "./resolve.ts";
import { Habitats, HabitatEditor, newHabitat } from "./SpeciesPage.tsx";
import { Icon, label } from "./ui.tsx";

function newEntry(state: EditorState, info: SpeciesInfo): SpeciesEncounters {
  return { species: info.species, levels: importLevels(info.species, { min: 1, max: 100 }, state.loaded.species, state.settings),
    battles: null, hiddenAbility: null, habitats: [], outbreaks: [] };
}

/** A copy of a habitat for a member, with the member's own tier where it already had the place and method. */
function copyFor(state: EditorState, h: Habitat, own: SpeciesEncounters | undefined, link: string, key = newKey()): Habitat {
  const seasons = { ...h.seasons };
  for (const s of SEASONS) {
    const slot = h.seasons[s];
    if (!slot) continue;
    const match = own?.habitats.find((x) => h.places.some((p) => namesArea(x, p, state.draft.groups) || x.places.includes(p)) &&
      x.seasons[s]?.methods.some((m) => slot.methods.includes(m)));
    seasons[s] = { ...slot, tier: match?.seasons[s]?.tier ?? slot.tier };
  }
  return { ...h, key, link, seasons };
}

export function FamilyView({ state, family, select, top }: {
  state: EditorState;
  family: Family;
  select(id: string): void;
  /** Shown first: the switch back to one member. */
  top?: ReactNode;
}) {
  const { draft, settings } = state;
  const shared = state.sharedFamilies.has(family.root);
  const members = family.members;
  const entryOf = (m: SpeciesInfo) => draft.species.get(m.species);
  const lead = members.find((m) => entryOf(m)?.habitats.length) ?? members[0];
  const leadEntry = entryOf(lead);

  // Makes every member's habitats linked copies of one member's
  const share = (source: SpeciesInfo) => {
    const from = entryOf(source);
    if (!from) return;
    if (!confirm(`Give every member of the family ${source.name}'s habitats? Their own habitats are replaced; each keeps its rarity where it had the same place.`)) return;
    const links = from.habitats.map((h) => h.link ?? newKey());
    const entries = members.map((m) => {
      const own = entryOf(m);
      const entry = own ?? newEntry(state, m);
      return { ...entry, habitats: from.habitats.map((h, i) => (m.species === source.species ? { ...h, link: links[i] } : copyFor(state, h, own, links[i]))) };
    });
    state.setSpeciesMany(entries);
    state.setShared(family.root, true);
  };

  // A change to the lead's copy of a shared habitat goes to every member's copy, which keeps its own tiers
  const propagate = (link: string, next: Habitat | null) => {
    state.setSpeciesMany(members.map((m) => {
      const entry = entryOf(m) ?? newEntry(state, m);
      const copy = entry.habitats.find((h) => h.link === link);
      if (!next) return { ...entry, habitats: entry.habitats.filter((h) => h.link !== link) };
      if (!copy) return { ...entry, habitats: [...entry.habitats, copyFor(state, next, undefined, link)] };
      const seasons = { ...next.seasons };
      for (const s of SEASONS) if (next.seasons[s]) seasons[s] = { ...next.seasons[s]!, tier: copy.seasons[s]?.tier ?? next.seasons[s]!.tier };
      return { ...entry, habitats: entry.habitats.map((h) => (h.link === link ? { ...next, key: h.key, link, seasons } : h)) };
    }));
  };

  const setTier = (m: SpeciesInfo, link: string, season: (typeof SEASONS)[number] | null, tier: string) => {
    const entry = entryOf(m);
    if (!entry) return;
    state.setSpecies(m.species, { ...entry, habitats: entry.habitats.map((h) => {
      if (h.link !== link) return h;
      const seasons = { ...h.seasons };
      for (const s of SEASONS) if (seasons[s] && (season === null || s === season)) seasons[s] = { ...seasons[s]!, tier };
      return { ...h, seasons };
    }) });
  };

  const linked = !!leadEntry?.habitats.length && leadEntry.habitats.every((h) => h.link &&
    members.every((m) => entryOf(m)?.habitats.some((x) => x.link === h.link)));

  return (
    <div className="enc-page">
      {top}
      <header className="enc-species-header">
        <div className="enc-family-icons">
          {members.map((m) => (
            <button key={m.species} className="enc-family-member" onClick={() => select(m.species)} title={`Open ${m.name}`}>
              <Icon info={m} size={48} /><span className="small">{m.name}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="enc-card">
        <h3>Levels</h3>
        <table className="enc-table">
          <thead><tr><th /><th>Pokémon</th><th>Min</th><th>Max</th></tr></thead>
          <tbody>
            {members.map((m) => {
              const entry = entryOf(m);
              return (
                <tr key={m.species}>
                  <td><Icon info={m} /></td>
                  <td>{m.name}</td>
                  {entry ? (
                    <>
                      <td><input type="number" min={1} max={100} value={entry.levels.min}
                                 onChange={(e) => state.setSpecies(m.species, { ...entry, levels: { ...entry.levels, min: Number(e.target.value) || 1 } })} /></td>
                      <td><input type="number" min={1} max={100} value={entry.levels.max}
                                 onChange={(e) => state.setSpecies(m.species, { ...entry, levels: { ...entry.levels, max: Number(e.target.value) || 1 } })} /></td>
                    </>
                  ) : <td colSpan={2}><button onClick={() => state.setSpecies(m.species, newEntry(state, m))}>Add it to the wild</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="enc-card">
        <div className="enc-row">
          <label className="enc-check strong">
            <input type="checkbox" checked={shared} onChange={(e) => state.setShared(family.root, e.target.checked)} />
            Same habitats for the whole family
          </label>
          <span className="muted small">Each member keeps its own levels and rarity.</span>
        </div>
        {shared && !linked && (
          <div className="enc-row enc-wrap">
            <span className="small enc-warn">The members' habitats aren't shared yet. Use the habitats of</span>
            {members.filter((m) => entryOf(m)?.habitats.length).map((m) => (
              <button key={m.species} onClick={() => share(m)}>{m.name} ({entryOf(m)!.habitats.length})</button>
            ))}
          </div>
        )}
      </div>

      {shared && linked && leadEntry ? (
        <div className="enc-card">
          <div className="enc-row">
            <h3>Shared habitats</h3>
            <span className="spacer" />
            <button onClick={() => propagate(newKey(), { ...newHabitat(state, leadEntry), link: undefined })}>Add habitat</button>
          </div>
          <div className="enc-habitats">
            {leadEntry.habitats.map((h) => (
              <div key={h.key}>
                <HabitatEditor state={state} info={lead} h={h} hideTier onChange={(next) => propagate(h.link!, next)} onRemove={() => propagate(h.link!, null)} />
                <RarityTable state={state} members={members} link={h.link!} setTier={setTier} />
              </div>
            ))}
          </div>
        </div>
      ) : members.map((m) => {
        const entry = entryOf(m);
        return (
          <section key={m.species} className="enc-family-section">
            <h3 className="enc-row"><Icon info={m} />{m.name}</h3>
            {entry ? <Habitats state={state} info={m} entry={entry} update={(change) => state.setSpecies(m.species, { ...entry, ...change })} /> :
              <p className="muted small">Not in the wild.</p>}
          </section>
        );
      })}
      {!members.some((m) => settings && entryOf(m)) && <p className="muted small">No member is in the wild.</p>}
    </div>
  );
}

/** Each member's rarity in a shared habitat: one for every season when it is coupled, else one per season. */
function RarityTable({ state, members, link, setTier }: {
  state: EditorState;
  members: SpeciesInfo[];
  link: string;
  setTier(m: SpeciesInfo, link: string, season: (typeof SEASONS)[number] | null, tier: string): void;
}) {
  const copies = members.map((m) => ({ m, h: state.draft.species.get(m.species)?.habitats.find((x) => x.link === link) }));
  const first = copies.find((c) => c.h)?.h;
  if (!first) return null;
  const seasons = first.coupled ? null : presentSeasons(first);
  return (
    <table className="enc-table enc-rarity-table">
      <thead><tr><th>Rarity</th>{seasons ? seasons.map((s) => <th key={s} className={`season-text-${s}`}>{label(s)}</th>) : <th>Every season</th>}</tr></thead>
      <tbody>
        {copies.filter((c) => c.h).map(({ m, h }) => (
          <tr key={m.species}>
            <td>{m.name}</td>
            {(seasons ?? [presentSeasons(h!)[0]]).map((s) => (
              <td key={s}>
                <select value={h!.seasons[s]?.tier ?? ""} onChange={(e) => setTier(m, link, seasons ? s : null, e.target.value)}>
                  {state.settings.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
