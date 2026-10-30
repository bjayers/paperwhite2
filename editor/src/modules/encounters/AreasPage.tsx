// The Areas page: the groups of areas that habitats can name (the import's, one per parent zone, and the user's own),
// which can be added, changed and removed; and every area, listed by parent zone, each with the number of Pokémon that
// have a habitat there. An area's page has its zones, its kind of rustling spots, its encounter rates and each
// method's Pokémon under the preview's context, with the current tables' shares beside them. It is a view of the
// species' habitats: change a habitat on the Pokémon page.

import { Fragment, useMemo, useState } from "react";
import type { EditorState } from "./EncounterEditor.tsx";
import { METHODS, SEASONS, SPOTS, type Area, type AreaGroup, type Spots } from "./model.ts";
import { measure, namesArea, placeOdds } from "./resolve.ts";
import { Icon, label, percent } from "./ui.tsx";

type Selected = { kind: "area"; id: string } | { kind: "group"; id: string };

export function AreasPage({ state, selected, select }: { state: EditorState; selected: string | null; select(id: string): void }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const { draft } = state;
  // Each area's number of species with a habitat there, in any season
  const counts = useMemo(() => new Map(draft.areas.map((a) => [a.id,
    [...draft.species.values()].filter((e) => e.habitats.some((h) => namesArea(h, a.id, draft.groups))).length])), [draft]);
  const q = query.trim().toLowerCase();
  const matches = (a: Area) => !q || a.name.toLowerCase().includes(q) || a.zones.some((z) => z.toLowerCase().includes(q));

  // The areas by parent zone: a heading for a parent of several areas
  const rows = useMemo(() => {
    const byParent = new Map<string, Area[]>();
    for (const a of draft.areas) byParent.set(a.parent, [...(byParent.get(a.parent) ?? []), a]);
    return [...byParent].map(([parent, areas]) => ({
      parent, name: label(parent.replace(/^ZONE_/, "").toLowerCase()),
      areas: areas.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [draft.areas]);
  const visible = rows.map((r) => ({ ...r, areas: r.areas.filter(matches) })).filter((r) => r.areas.length);
  const groups = draft.groups.filter((g) => !q || g.name.toLowerCase().includes(q));
  const current: Selected | null = group ? { kind: "group", id: group } :
    (selected ?? visible[0]?.areas[0]?.id) ? { kind: "area", id: selected ?? visible[0].areas[0].id } : null;
  const showArea = (id: string) => {
    setGroup(null);
    select(id);
  };

  const newGroup = () => {
    let n = 1;
    while (draft.groups.some((g) => g.id === `group:custom_${n}`)) n++;
    const g: AreaGroup = { id: `group:custom_${n}`, name: `New group ${n}`, areas: [], custom: true };
    state.setGroups([...draft.groups, g]);
    setGroup(g.id);
  };

  return (
    <div className="enc-split">
      <aside className="enc-list">
        <div className="enc-list-tools">
          <input className="filter" placeholder="Find an area, zone or group" value={query} onChange={(e) => setQuery(e.target.value)} />
          <p className="muted small">{draft.areas.length} areas, {draft.groups.length} groups · the number is its Pokémon in any season</p>
        </div>
        <div className="enc-list-items">
          <div className="enc-list-heading">Groups<button className="link small" onClick={newGroup}>+ New</button></div>
          {groups.map((g) => (
            <button key={g.id} className={`enc-list-item nested${current?.kind === "group" && current.id === g.id ? " selected" : ""}`}
                    onClick={() => setGroup(g.id)}>
              <span className="enc-list-name">{g.name}{g.custom ? "" : <span className="muted small"> · parent zone</span>}</span>
              <span className="count">{g.areas.length}</span>
            </button>
          ))}
          <div className="enc-list-heading">Areas</div>
          {visible.map((r) => (
            <Fragment key={r.parent}>
              {r.areas.length > 1 && <div className="enc-list-subheading">{r.name}</div>}
              {r.areas.map((a) => (
                <button key={a.id} className={`enc-list-item${r.areas.length > 1 ? " nested" : ""}${current?.kind === "area" && a.id === current.id ? " selected" : ""}`}
                        onClick={() => showArea(a.id)}>
                  <span className="enc-list-name">{a.name}</span>
                  <span className="count">{counts.get(a.id) ?? 0}</span>
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      </aside>
      <section className="enc-detail">
        {current?.kind === "group" && draft.groups.some((g) => g.id === current.id) ? (
          <GroupEditor state={state} group={draft.groups.find((g) => g.id === current.id)!} onDeleted={() => setGroup(null)} showArea={showArea} />
        ) : current?.kind === "area" && draft.areas.some((a) => a.id === current.id) ? (
          <AreaDetail state={state} area={draft.areas.find((a) => a.id === current.id)!} showGroup={setGroup} />
        ) : <p className="muted pad">Nothing matches.</p>}
      </section>
    </div>
  );
}

function GroupEditor({ state, group, onDeleted, showArea }: { state: EditorState; group: AreaGroup; onDeleted(): void; showArea(id: string): void }) {
  const { draft } = state;
  const users = [...draft.species.values()].filter((e) => e.habitats.some((h) => h.places.includes(group.id)) ||
    e.outbreaks.some((o) => o.places.includes(group.id)));
  const set = (change: Partial<AreaGroup>) => state.setGroups(draft.groups.map((g) => (g.id === group.id ? { ...g, ...change, custom: true } : g)));
  const areas = [...draft.areas].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const remove = () => {
    if (!confirm(`Remove the group ${group.name}? ${users.length ? `The ${users.length} Pokémon whose habitats name it will name its areas instead.` : ""}`)) return;
    // Habitats and outbreaks that name the group name its areas instead, so nothing moves
    const expand = (places: string[]) => [...new Set(places.flatMap((p) => (p === group.id ? group.areas : [p])))];
    const species = new Map([...draft.species].map(([id, e]) => [id, {
      ...e,
      habitats: e.habitats.map((h) => (h.places.includes(group.id) ? { ...h, places: expand(h.places) } : h)),
      outbreaks: e.outbreaks.map((o) => (o.places.includes(group.id) ? { ...o, places: expand(o.places) } : o)),
    }]));
    state.setGroups(draft.groups.filter((g) => g.id !== group.id), species);
    onDeleted();
  };
  return (
    <div className="enc-page">
      <header className="enc-species-header">
        <div>
          <input className="enc-title-input" value={group.name} onChange={(e) => set({ name: e.target.value })} />
          <p className="muted small">{group.custom ? "Your group" : "Made by the import from a parent zone"} · {group.id} ·
            named by {users.length} Pokémon's habitats or outbreaks</p>
        </div>
        <span className="spacer" />
        <button onClick={remove}>Remove the group</button>
      </header>
      <div className="enc-card">
        <h3>Areas</h3>
        <p className="small muted">A habitat that names the group appears in each of these. Adding or removing an area here changes where those habitats are.</p>
        <span className="enc-places">
          {group.areas.map((id) => (
            <span key={id} className="enc-place-chip">
              {draft.areas.find((a) => a.id === id)?.name ?? id}
              <button className="link small" title="Open the area" onClick={() => showArea(id)}>↗</button>
              <button className="icon" title="Remove from the group" onClick={() => set({ areas: group.areas.filter((a) => a !== id) })}>×</button>
            </span>
          ))}
          <select value="" onChange={(e) => e.target.value && set({ areas: [...group.areas, e.target.value] })}>
            <option value="">+ area</option>
            {areas.filter((a) => !group.areas.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </span>
      </div>
      {users.length > 0 && (
        <div className="enc-card">
          <h3>Used by</h3>
          <div className="enc-row enc-wrap">
            {users.map((e) => {
              const info = state.loaded.species.get(e.species);
              return <button key={e.species} className="enc-user" onClick={() => state.showSpecies(e.species)}><Icon info={info} />{info?.name ?? e.species}</button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AreaDetail({ state, area, showGroup }: { state: EditorState; area: Area; showGroup(id: string): void }) {
  const { draft, settings, ctx, loaded } = state;
  const inGroups = draft.groups.filter((g) => g.areas.includes(area.id));
  const seasonsDiffer = SEASONS.some((s) => JSON.stringify(area.rates[s]) !== JSON.stringify(area.rates.spring));
  const methods = METHODS.filter((m) => SEASONS.some((s) => area.rates[s][m.id]) ||
    [...draft.species.values()].some((e) => e.habitats.some((h) => namesArea(h, area.id, draft.groups) && SEASONS.some((s) => h.seasons[s]?.methods.includes(m.id)))));
  const setSpots = (spots: Spots) => state.setAreas(draft.areas.map((a) => (a.id === area.id ? { ...a, spots } : a)));
  const fixedLabel = area.spots === "grass" ? loaded.species.get(settings.rustling.grass.species)?.name ?? settings.rustling.grass.species :
    "the game's items";

  return (
    <div className="enc-page">
      <header className="enc-species-header">
        <div>
          <h2>{area.name}</h2>
          <p className="muted small">
            {area.zones.length ? area.zones.map((z) => label(z.replace(/^ZONE_/, "").toLowerCase())).join(", ") : "No zone uses it"}
          </p>
          {inGroups.length > 0 && (
            <p className="small">In {inGroups.map((g) => <button key={g.id} className="link small" onClick={() => showGroup(g.id)}>{g.name}</button>)}</p>
          )}
        </div>
        <span className="spacer" />
        <button className="link" onClick={() => state.open(`res/field/encounters/${area.id}.json`)}>Current table…</button>
      </header>

      <div className="enc-card">
        <h3>Encounter rates</h3>
        <p className="small muted">The chance per step, from the current tables{seasonsDiffer ? "; they differ by season" : ", the same all year"}. These will be the area's own settings.</p>
        <div className="scroll">
          <table className="enc-table">
            <thead><tr><th />{methods.map((m) => <th key={m.id}>{m.label}</th>)}</tr></thead>
            <tbody>
              {(seasonsDiffer ? SEASONS : (["spring"] as const)).map((s) => (
                <tr key={s}>
                  <td>{seasonsDiffer ? label(s) : "All year"}</td>
                  {methods.map((m) => <td key={m.id}>{area.rates[s][m.id] ?? "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="enc-inline">Its rustling spots are
          <select value={area.spots} onChange={(e) => setSpots(e.target.value as Spots)}>
            {SPOTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {methods.map((m) => {
        const odds = placeOdds(draft, settings, ctx, area.id, m.id);
        const measures = measure(odds);
        const before = draft.oldShares.filter((s) => s.area === area.id && s.method === m.id && s.season === ctx.season);
        const missing = before.filter((b) => !odds.some((o) => o.species === b.species && o.form === b.form));
        const hasRate = !!area.rates[ctx.season][m.id];
        return (
          <div key={m.id} className="enc-card">
            <div className="enc-row">
              <h3>{m.id === "rustling" ? SPOTS.find((s) => s.id === area.spots)!.label : m.label}</h3>
              <span className="muted small">{m.detail}</span>
              <span className="spacer" />
              <span className="small">{measures.species} species · diversity {measures.diversity.toFixed(1)}
                {measures.levels ? ` · Lv. ${measures.levels[0]}–${measures.levels[1]}` : ""}</span>
            </div>
            {m.id === "rustling" && (
              <p className="small muted">
                {fixedLabel} first, then the spots' own Pokémon and the area's {settings.rustling.tiers.map((t) => settings.tiers.find((x) => x.id === t)?.name ?? t).join(", ")} ones
                from {settings.rustling.from.map((f) => METHODS.find((x) => x.id === f)?.label ?? f).join(" and ")} (Settings).
              </p>
            )}
            {odds.length ? (
              <table className="enc-table">
                <thead><tr><th /><th>Pokémon</th><th>Rarity</th><th>Share</th><th>Before</th><th>Levels</th></tr></thead>
                <tbody>
                  {odds.map((o) => {
                    if (o.item) {
                      return <tr key="item"><td /><td>Items (the game's)</td><td>Fixed</td><td>{percent(o.share)}</td><td className="muted">—</td><td /></tr>;
                    }
                    const info = loaded.species.get(o.species);
                    const old = before.find((b) => b.species === o.species && b.form === o.form);
                    return (
                      <tr key={`${o.species}:${o.form}:${o.tier}:${o.outbreak ? "o" : ""}`} className="enc-click" onClick={() => state.showSpecies(o.species)}>
                        <td><Icon info={info} /></td>
                        <td>{info?.name ?? o.species}{o.form ? ` (form ${o.form})` : ""}{o.conditional ? <span className="muted small"> · conditional</span> : null}</td>
                        <td>{o.outbreak ? "Outbreak" : o.special ? "Fixed" : settings.tiers.find((t) => t.id === o.tier)?.name ?? o.tier}</td>
                        <td>{percent(o.share)}</td>
                        <td className="muted">{old ? percent(old.share) : "—"}</td>
                        <td>{o.levels[0] === o.levels[1] ? o.levels[0] : `${o.levels[0]}–${o.levels[1]}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <p className={`small ${hasRate ? "enc-warn" : "muted"}`}>
              Nothing appears here under the preview's context{hasRate ? ", though the method has an encounter rate here" : ""}.
            </p>}
            {missing.length > 0 && (
              <p className="small muted">
                In the current table but not now (their level, period or weather doesn't match, or the rule replaces them):{" "}
                {missing.map((b) => loaded.species.get(b.species)?.name ?? b.species).join(", ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
