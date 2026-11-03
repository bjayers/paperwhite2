// A species' wanderer settings, outbreaks and Hidden Grotto entries, on its page beside its habitats. Outbreaks are part of the new
// encounter data (its file's "outbreaks"); the grottoes keep their own files (res/field/grottoes/), so adding a species
// to one replaces the entry it is put in.

import { useState } from "react";
import type { EditorState } from "./EncounterEditor.tsx";
import { ALL_TIMES, METHODS, SEASONS, newKey, type Method, type Outbreak, type Overworld, type Season, type SpeciesEncounters,
  type SpeciesInfo } from "./model.ts";
import { Chips, PlacesPicker, TimePicker, label } from "./ui.tsx";

const APPEARS: { value: NonNullable<Overworld["appears"]>; label: string; note: string }[] = [
  { value: "both", label: "Both", note: "Seen walking in grass, and met by a step in grass." },
  { value: "steps", label: "Steps only", note: "Only met by a step in grass, never seen walking in it. The wanderers' odds of the others grow to fill its share." },
  { value: "overworld", label: "Overworld only", note: "Only seen walking in grass, never met by a step. The steps' odds of the others grow to fill its share." },
];
const WANDERS: { value: NonNullable<Overworld["wanders"]>; label: string; note: string }[] = [
  { value: "random", label: "Random", note: "Wanders tile to tile at random, with pauses." },
  { value: "aggressive", label: "Aggressive", note: "Within 5 tiles of the player, comes toward it, a little faster, and walks into it. Never leaves its grass." },
  { value: "passive", label: "Passive", note: "Within 4 tiles of the player, keeps away from it, and never walks into it." },
];

/** A species as a wanderer: where it's met, how it wanders and whether it stands in grass (its file's "overworld"). */
export function OverworldCard({ entry, update }: { entry: SpeciesEncounters; update(change: Partial<SpeciesEncounters>): void }) {
  const o = entry.overworld ?? {};
  const appears = o.appears ?? "both";
  const wanders = o.wanders ?? "random";
  const grass = o.grass ?? true;
  /** One setting changed; its default is left out of the file. */
  const set = (key: keyof Overworld, value: unknown, fallback: unknown) => {
    const next: Overworld = { ...o };
    if (value === fallback) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
    update({ overworld: Object.keys(next).length ? next : null });
  };
  return (
    <div className="enc-card">
      <div className="enc-row">
        <h3>Overworld</h3>
        <span className="muted small">As a wanderer, a wild Pokémon seen walking in tall and dark grass. Under a Repel, one weaker than the lead keeps away and doesn't walk into the player.</span>
      </div>
      <div className="enc-overworld">
        <span className="enc-overworld-label">Appears</span>
        <div>
          <span className="view-switch">
            {APPEARS.map((a) => <button key={a.value} className={appears === a.value ? "active" : ""} onClick={() => set("appears", a.value, "both")}>{a.label}</button>)}
          </span>
          <p className="small muted">{APPEARS.find((a) => a.value === appears)?.note}</p>
        </div>
        <span className="enc-overworld-label">Wanders</span>
        <div>
          <span className="view-switch">
            {WANDERS.map((w) => <button key={w.value} className={wanders === w.value ? "active" : ""} disabled={appears === "steps"}
                                        onClick={() => set("wanders", w.value, "random")}>{w.label}</button>)}
          </span>
          <p className="small muted">{appears === "steps" ? "It's never seen walking." : WANDERS.find((w) => w.value === wanders)?.note}</p>
        </div>
        <span className="enc-overworld-label">Grass</span>
        <div>
          <span className="view-switch">
            <button className={grass ? "active" : ""} disabled={appears === "steps"} onClick={() => set("grass", true, true)}>Stands in it</button>
            <button className={!grass ? "active" : ""} disabled={appears === "steps"} onClick={() => set("grass", false, true)}>Floats over it</button>
          </span>
          <p className="small muted">{grass ? "Drawn standing in its grass, as an NPC is." : "Drawn over its grass without it, for one that flies or hovers."}</p>
        </div>
      </div>
    </div>
  );
}

export function OutbreaksCard({ state, info, entry, update }: {
  state: EditorState;
  info: SpeciesInfo;
  entry: SpeciesEncounters;
  update(change: Partial<SpeciesEncounters>): void;
}) {
  const set = (key: string, change: Partial<Outbreak>) =>
    update({ outbreaks: entry.outbreaks.map((o) => (o.key === key ? { ...o, ...change } : o)) });
  const add = () => update({ outbreaks: [...entry.outbreaks, { key: newKey(), places: [entry.habitats[0]?.places[0] ?? state.draft.areas[0].id],
    form: 0, methods: ["grass"], seasons: [...SEASONS], times: [...ALL_TIMES] }] });
  return (
    <div className="enc-card">
      <div className="enc-row">
        <h3>Outbreaks</h3>
        <span className="muted small">
          On the day a place has its outbreak, its Pokémon take {state.settings.outbreakShare}% of that place's encounters by
          these methods (Settings). Turn on Outbreaks in the preview bar to see them.
        </span>
        <span className="spacer" />
        <button onClick={add}>Add outbreak</button>
      </div>
      <div className="enc-habitats">
        {entry.outbreaks.map((o) => (
          <div key={o.key} className="enc-habitat">
            <div className="enc-row enc-wrap">
              <PlacesPicker state={state} places={o.places} onChange={(places) => set(o.key, { places })} />
              {info.forms > 1 && (
                <label className="enc-inline">Form
                  <select value={o.form} onChange={(e) => set(o.key, { form: Number(e.target.value) })}>
                    {Array.from({ length: info.forms }, (_, i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </label>
              )}
              <span className="spacer" />
              <button className="icon" title="Remove" onClick={() => update({ outbreaks: entry.outbreaks.filter((x) => x.key !== o.key) })}>×</button>
            </div>
            <div className="enc-slot">
              <Chips<Method> all={METHODS.map((m) => m.id)} on={o.methods} labelOf={(m) => METHODS.find((x) => x.id === m)!.label}
                             onChange={(methods) => methods.length && set(o.key, { methods })} />
              <Chips<Season> all={SEASONS} on={o.seasons} labelOf={label} onChange={(seasons) => set(o.key, { seasons })}
                             classOf={(s) => `season-chip-${s}`} />
              <TimePicker times={o.times} onChange={(times) => set(o.key, { times })} />
            </div>
          </div>
        ))}
        {!entry.outbreaks.length && <p className="muted small">No outbreaks.</p>}
      </div>
    </div>
  );
}

export function GrottoesCard({ state, info }: { state: EditorState; info: SpeciesInfo }) {
  const { grottoes } = state.draft;
  const [grotto, setGrotto] = useState(grottoes[0]?.id ?? "");
  const [slot, setSlot] = useState(0);
  const [index, setIndex] = useState(0);
  const found = grottoes.flatMap((g) => g.slots.flatMap((entries, s) => entries.map((e, i) => ({ g, s, i, e }))))
    .filter((x) => x.e.species === info.species);
  const target = grottoes.find((g) => g.id === grotto);
  const occupant = target?.slots[slot]?.[index];
  const nameOf = (species: string) => state.loaded.species.get(species)?.name ?? species;

  const setEntry = (id: string, s: number, i: number, change: Partial<(typeof found)[number]["e"]>) =>
    state.setGrottoes(grottoes.map((g) => g.id !== id ? g : { ...g, slots: g.slots.map((entries, ss) => ss !== s ? entries :
      entries.map((e, ii) => (ii === i ? { ...e, ...change } : e))) }));

  return (
    <div className="enc-card">
      <div className="enc-row">
        <h3>Hidden Grottoes</h3>
        <span className="muted small">Each grotto has three slots of four entries; each day it rolls a slot and an entry. These keep their own files.</span>
      </div>
      {found.length ? (
        <table className="enc-table">
          <thead><tr><th>Grotto</th><th>Slot</th><th>Entry</th><th>Levels</th><th>Female below</th></tr></thead>
          <tbody>
            {found.map(({ g, s, i, e }) => (
              <tr key={`${g.id}:${s}:${i}`}>
                <td>{g.name}</td>
                <td>{s + 1}</td>
                <td>{i + 1}</td>
                <td>
                  <input type="number" min={1} max={100} value={e.min} onChange={(ev) => setEntry(g.id, s, i, { min: Number(ev.target.value) || 1 })} />–
                  <input type="number" min={1} max={100} value={e.max} onChange={(ev) => setEntry(g.id, s, i, { max: Number(ev.target.value) || 1 })} />
                </td>
                <td><input type="number" min={0} max={100} value={e.femaleBelow} onChange={(ev) => setEntry(g.id, s, i, { femaleBelow: Number(ev.target.value) || 0 })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted small">In no Hidden Grotto.</p>}
      <div className="enc-row enc-wrap">
        <span className="small">Put it in</span>
        <select value={grotto} onChange={(e) => setGrotto(e.target.value)}>
          {grottoes.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <label className="enc-inline">slot
          <select value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
            {(target?.slots ?? []).map((_, s) => <option key={s} value={s}>{s + 1}</option>)}
          </select>
        </label>
        <label className="enc-inline">entry
          <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
            {(target?.slots[slot] ?? []).map((e, i) => <option key={i} value={i}>{i + 1}: {nameOf(e.species)}</option>)}
          </select>
        </label>
        <button disabled={!occupant || occupant.species === info.species}
                onClick={() => occupant && setEntry(grotto, slot, index, { species: info.species, form: 0 })}>
          {occupant ? `Replace ${nameOf(occupant.species)}` : "Add"}
        </button>
        <span className="muted small">It keeps that entry's levels.</span>
      </div>
    </div>
  );
}
