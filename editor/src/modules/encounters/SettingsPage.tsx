// The Settings page: what applies to every species: the rarity tiers, the level scaling, the hidden ability's chance,
// the default battle styles, the rustling spots' rule, and how the import from the current tables picks tiers and
// levels.

import type { Dispatch, SetStateAction } from "react";
import { METHODS, type EncounterSettings, type Method, type RarityTier, type SpeciesInfo } from "./model.ts";
import { Chips, label } from "./ui.tsx";

export function SettingsPage({ settings, setSettings, reimport, species }: {
  settings: EncounterSettings;
  setSettings: Dispatch<SetStateAction<EncounterSettings>>;
  reimport(): void;
  /** Every species, for the rustling spots' special ones. */
  species: SpeciesInfo[];
}) {
  const set = (change: Partial<EncounterSettings>) => setSettings((s) => ({ ...s, ...change }));
  const setRustling = (change: Partial<EncounterSettings["rustling"]>) => set({ rustling: { ...settings.rustling, ...change } });
  const setTier = (i: number, change: Partial<RarityTier>) =>
    set({ tiers: settings.tiers.map((t, j) => (j === i ? { ...t, ...change } : t)) });
  const move = (i: number, by: number) => {
    const tiers = [...settings.tiers];
    const [tier] = tiers.splice(i, 1);
    tiers.splice(i + by, 0, tier);
    set({ tiers });
  };
  const total = settings.tiers.reduce((sum, t) => sum + t.share, 0);
  const battleTotal = settings.battles.single + settings.battles.double + settings.battles.triple;
  const number = (value: string, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

  return (
    <div className="enc-page enc-settings">
      <div className="enc-card">
        <h3>Rarity tiers</h3>
        <p className="small muted">
          Each tier takes its share of a place's encounters by one method, split evenly among its Pokémon there. A tier
          with no Pokémon in a place gives its share to the others, in proportion, so the place always makes 100%.
        </p>
        <table className="enc-table">
          <thead><tr><th>Name</th><th>ID</th><th>Share</th><th>Import from</th><th /></tr></thead>
          <tbody>
            {settings.tiers.map((t, i) => (
              <tr key={i}>
                <td><input value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} /></td>
                <td><input className="mono" value={t.id} onChange={(e) => setTier(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></td>
                <td><input type="number" min={0} max={100} step={0.5} value={t.share} onChange={(e) => setTier(i, { share: number(e.target.value) })} />%</td>
                <td>
                  {i < settings.tiers.length - 1 ? (
                    <><input type="number" min={0} max={100} step={0.5} value={settings.importThresholds[t.id] ?? 0}
                             onChange={(e) => set({ importThresholds: { ...settings.importThresholds, [t.id]: number(e.target.value) } })} />% or more</>
                  ) : <span className="muted small">the rest</span>}
                </td>
                <td className="enc-nowrap">
                  <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} title="Up">↑</button>
                  <button className="icon" disabled={i === settings.tiers.length - 1} onClick={() => move(i, 1)} title="Down">↓</button>
                  <button className="icon" disabled={settings.tiers.length < 2} title="Remove"
                          onClick={() => set({ tiers: settings.tiers.filter((_, j) => j !== i) })}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="enc-row">
          <button onClick={() => set({ tiers: [...settings.tiers, { id: `tier_${settings.tiers.length + 1}`, name: "New tier", share: 1 }] })}>Add tier</button>
          <span className={`small ${total === 100 ? "muted" : "enc-warn"}`}>The tiers add up to {total}%{total === 100 ? "" : "; places are rescaled to 100% anyway"}.</span>
        </div>
        <p className="small muted">
          "Import from" is how the draft turns a Pokémon's share of a place in the current tables into a tier: the first
          tier whose threshold it reaches, top to bottom. It only matters for the import.
        </p>
        <label className="enc-inline">Import levels: an evolving species' maximum is the level it evolves at +
          <input type="number" min={0} max={20} value={settings.importEvolutionMargin}
                 onChange={(e) => set({ importEvolutionMargin: number(e.target.value, 0, 20) })} />; an evolved one's minimum is the level it evolved at.</label>
        <div className="enc-row">
          <button onClick={reimport}>Import the current tables again with these settings…</button>
        </div>
      </div>

      <div className="enc-card">
        <h3>Levels</h3>
        <div className="enc-row">
          <label className="enc-inline">Scaled level =
            <input type="number" min={1} max={200} value={settings.levels.percent}
                   onChange={(e) => set({ levels: { ...settings.levels, percent: number(e.target.value, 1, 200) } })} />% of the party's level</label>
          <label className="enc-inline">±
            <input type="number" min={0} max={50} value={settings.levels.spread}
                   onChange={(e) => set({ levels: { ...settings.levels, spread: number(e.target.value, 0, 50) } })} /></label>
        </div>
        <p className="small muted">
          The party's level is its median (the lower middle), as the conditions engine computes it. A wild Pokémon's
          level is the scaled level plus or minus the spread, kept within its species' minimum and maximum.
        </p>
        <div className="enc-row">
          <span className="small">A species appears once its minimum is reached by</span>
          {(["party", "scaled"] as const).map((g) => (
            <label key={g} className="enc-check">
              <input type="radio" checked={settings.levels.gate === g} onChange={() => set({ levels: { ...settings.levels, gate: g } })} />
              {g === "party" ? "the party's level" : "the scaled level"}
            </label>
          ))}
        </div>
      </div>

      <div className="enc-card">
        <h3>Hidden abilities</h3>
        <label className="enc-inline">A wild Pokémon has its hidden ability
          <input type="number" min={0} max={100} value={settings.hiddenAbility} onChange={(e) => set({ hiddenAbility: number(e.target.value) })} />% of the time,
          unless its species sets its own chance.</label>
      </div>

      <div className="enc-card">
        <h3>Default battles</h3>
        <div className="enc-row">
          {(["single", "double", "triple"] as const).map((k) => (
            <label key={k} className="enc-inline">{label(k)}
              <input type="number" min={0} max={100} value={settings.battles[k]}
                     onChange={(e) => set({ battles: { ...settings.battles, [k]: number(e.target.value) } })} />%</label>
          ))}
          {battleTotal !== 100 && <span className="small enc-warn">These add up to {battleTotal}%.</span>}
        </div>
        <div className="enc-row">
          <span className="small muted">Partners:</span>
          {(["family", "area"] as const).map((p) => (
            <label key={p} className="enc-check">
              <input type="radio" checked={settings.battles.partners === p} onChange={() => set({ battles: { ...settings.battles, partners: p } })} />
              {p === "family" ? "Same family" : "Anything in the area"}
            </label>
          ))}
        </div>
        <p className="small muted">For a species that sets none. A partner must meet its own level range and conditions. Fishing is always a
          single battle; a double needs two of the party's Pokémon that can fight, a triple three.</p>
      </div>

      <div className="enc-card">
        <h3>Rustling spots</h3>
        <p className="small muted">
          Each kind gives its own thing at a fixed share, and the rest goes to the spots' own habitats and the area's
          Pokémon of these tiers found by these methods, split by tier as usual. Where there are no Pokémon, the fixed
          thing is all the spots give. Each area's kind of spots is on its Areas page.
        </p>
        <table className="enc-table">
          <tbody>
            <tr>
              <td>Shaking grass</td>
              <td>
                <select value={settings.rustling.grass.species} onChange={(e) => setRustling({ grass: { ...settings.rustling.grass, species: e.target.value } })}>
                  {species.map((s) => <option key={s.species} value={s.species}>{s.name}</option>)}
                </select>
              </td>
              <td><input type="number" min={0} max={100} value={settings.rustling.grass.share}
                         onChange={(e) => setRustling({ grass: { ...settings.rustling.grass, share: number(e.target.value) } })} />%</td>
            </tr>
            <tr>
              <td>Dust clouds</td>
              <td className="muted small">the game's items (gems, stones)</td>
              <td><input type="number" min={0} max={100} value={settings.rustling.dust.share}
                         onChange={(e) => setRustling({ dust: { share: number(e.target.value) } })} />%</td>
            </tr>
            <tr>
              <td>Bridge shadows</td>
              <td className="muted small">the game's items (feathers)</td>
              <td><input type="number" min={0} max={100} value={settings.rustling.shadow.share}
                         onChange={(e) => setRustling({ shadow: { share: number(e.target.value) } })} />%</td>
            </tr>
          </tbody>
        </table>
        <div className="enc-row">
          <span className="small">The rest from</span>
          <Chips<string> all={settings.tiers.map((t) => t.id)} on={settings.rustling.tiers}
                         labelOf={(id) => settings.tiers.find((t) => t.id === id)?.name ?? id} onChange={(tiers) => setRustling({ tiers })} />
        </div>
        <div className="enc-row">
          <span className="small">found by</span>
          <Chips<Method> all={METHODS.map((m) => m.id).filter((m) => m !== "rustling")} on={settings.rustling.from}
                         labelOf={(m) => METHODS.find((x) => x.id === m)!.label} onChange={(from) => setRustling({ from })} />
        </div>
      </div>

      <div className="enc-card">
        <h3>Outbreaks</h3>
        <label className="enc-inline">On its day, an outbreak takes
          <input type="number" min={0} max={100} value={settings.outbreakShare} onChange={(e) => set({ outbreakShare: number(e.target.value) })} />% of its
          place's encounters by its methods (the game's swarms take 40%). One place has an outbreak each day.</label>
      </div>
    </div>
  );
}
