// The Pokémon Editor: every species and form (res/pokemon/<species>/data.json and form_<n>/data.json, docs/data.md,
// Species) with its sprite in its normal and shiny colors, its base stats as bars with their total, its types,
// abilities and other settings, its Pokédex data, its learnset (by level, TMs, tutors, egg moves), and its evolutions,
// with the whole family's tree. Every file is edited through the document store, so it is checked by the build's
// validator on save.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import type { JsonMap, JsonValue } from "../../../shared/json.ts";
import type { Constants } from "../../../shared/schema.ts";
import { SearchSelect } from "../../shell/SearchSelect.tsx";
import type { ToolProps } from "../types.ts";
import { PalettePreview } from "../palettes/PaletteEditor.tsx";
import { parsePal, type Rgb } from "../palettes/pal.ts";
import { readIndexedPng, type IndexedImage } from "../palettes/png.ts";
import { constantLabel, constantOptions } from "../schema-form/form.tsx";
import { DocForm, useHeld } from "../followers/DocForm.tsx";
import { SpeciesIcon, speciesFolder } from "./SpeciesIcon.tsx";

const SCHEMA = "res/pokemon/species.schema.json";
const STATS = [["hp", "HP"], ["attack", "Attack"], ["defense", "Defense"], ["special_attack", "Sp. Atk"],
  ["special_defense", "Sp. Def"], ["speed", "Speed"]] as const;

interface Listed {
  path: string;
  /** "snivy", or "arceus/form_1". */
  folder: string;
  species: string;
  name: string;
  number: number;
  evolutions: { method: string; param: unknown; species: string }[];
}

const map = (v: JsonValue | undefined) => (v instanceof Map ? v : new Map<string, JsonValue>());

/** What an evolution method's parameter is: the prefix of its constants, or a number. */
function paramKind(method: string): { prefix: string | null; label: string } {
  if (/ITEM/.test(method)) return { prefix: "ITEM_", label: "Item" };
  if (/KNOWS_MOVE/.test(method)) return { prefix: "MOVE_", label: "Move" };
  if (/SPECIES/.test(method)) return { prefix: "SPECIES_", label: "Species" };
  if (/^EVO_METHOD_(LEVEL|SHEDINJA)/.test(method)) return { prefix: null, label: "Level" };
  if (/FRIENDSHIP/.test(method)) return { prefix: null, label: "Friendship" };
  if (/BEAUTY/.test(method)) return { prefix: null, label: "Beauty" };
  return { prefix: null, label: "Value" };
}

function Sprite({ folder }: { folder: string }) {
  const [shiny, setShiny] = useState(false);
  const [sprite, setSprite] = useState<{ image: IndexedImage; normal: Rgb[]; shiny: Rgb[] } | null>(null);
  useEffect(() => {
    let live = true;
    setSprite(null);
    const base = `res/pokemon/${folder}`;
    Promise.all([api.asset(`${base}/front_single.png`).then(readIndexedPng), api.file(`${base}/normal.pal`), api.file(`${base}/shiny.pal`)])
      .then(([image, n, s]) => live && setSprite({ image, normal: parsePal(n.text), shiny: parsePal(s.text) }))
      .catch(() => live && setSprite(null));
    return () => { live = false; };
  }, [folder]);
  if (!sprite) return <div className="pkm-sprite muted">No sprite</div>;
  return (
    <div className="pkm-sprite">
      <PalettePreview image={sprite.image} colors={shiny ? sprite.shiny : sprite.normal} offset={0} zoom={1} transparent highlight={null} />
      <label className="pkm-check"><input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} /> Shiny</label>
    </div>
  );
}

function Stats({ path, data, label, max }: { path: string; data: JsonMap; label: string; max: number }) {
  const key = label === "Base stats" ? "base_stats" : "ev_yields";
  const stats = map(data.get(key));
  const total = STATS.reduce((n, [k]) => n + Number(stats.get(k) ?? 0), 0);
  return (
    <div className="pkm-stats">
      <h4>{label} <span className="muted">total {total}</span></h4>
      {STATS.map(([k, name]) => {
        const value = Number(stats.get(k) ?? 0);
        return (
          <div key={k} className="pkm-stat">
            <span className="pkm-stat-name">{name}</span>
            <input type="number" min={0} max={max} value={value}
                   onChange={(e) => documents.edit(path, [key, k], Math.max(0, Math.min(max, Number(e.target.value) || 0)))} />
            {max > 3 && (
              <span className="pkm-bar"><span style={{ width: `${(value / 255) * 100}%`, background: `hsl(${Math.min(value, 180) * 0.7}, 70%, 50%)` }} /></span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LevelMoves({ path, data, constants }: { path: string; data: JsonMap; constants: Constants }) {
  const learnset = map(data.get("learnset"));
  const moves = ((learnset.get("by_level") as JsonValue[] | undefined) ?? []) as JsonValue[][];
  const set = (next: JsonValue[][]) => documents.edit(path, ["learnset", "by_level"], next);
  const sorted = (list: JsonValue[][]) => [...list].sort((a, b) => Number(a[0]) - Number(b[0]));
  return (
    <div className="pkm-level-moves">
      {moves.map((entry, i) => (
        <div key={i} className="pkm-level-move">
          <input type="number" min={0} max={100} value={Number(entry[0])}
                 onChange={(e) => set(moves.map((m, j) => (j === i ? [Math.max(0, Math.min(100, Number(e.target.value) || 0)), m[1]] : m)))}
                 onBlur={() => set(sorted(moves))} />
          <SearchSelect value={String(entry[1])} options={constantOptions(constants, "MOVE_")}
                        onChange={(v) => set(moves.map((m, j) => (j === i ? [m[0], v] : m)))} />
          <button className="icon" title="Remove" onClick={() => set(moves.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="chip" onClick={() => set(sorted([...moves, [Number(moves[moves.length - 1]?.[0] ?? 1), "MOVE_TACKLE"]]))}>+ Add a move</button>
    </div>
  );
}

function Evolutions({ path, data, constants }: { path: string; data: JsonMap; constants: Constants }) {
  const evolutions = ((data.get("evolutions") as JsonValue[] | undefined) ?? []).map(map);
  const at = (i: number, key: string) => ["evolutions", i, key];
  return (
    <div className="pkm-evolutions">
      {evolutions.map((evo, i) => {
        const method = String(evo.get("method") ?? "EVO_METHOD_LEVEL");
        const kind = paramKind(method);
        const param = evo.get("param");
        return (
          <div key={i} className="pkm-evolution">
            <SpeciesIcon species={String(evo.get("species") ?? "")} />
            <SearchSelect value={String(evo.get("species") ?? "")} options={constantOptions(constants, "SPECIES_")}
                          onChange={(v) => documents.edit(path, at(i, "species"), v)} />
            <SearchSelect value={method} options={constantOptions(constants, "EVO_METHOD_")}
                          onChange={(v) => {
                            const next = paramKind(v);
                            documents.edit(path, at(i, "method"), v);
                            if (next.prefix !== kind.prefix) documents.edit(path, at(i, "param"), next.prefix ? `${next.prefix}NONE` : 0);
                          }} />
            <label className="pkm-param"><span className="muted">{kind.label}</span>
              {kind.prefix ? (
                <SearchSelect value={String(param)} options={constantOptions(constants, kind.prefix)} onChange={(v) => documents.edit(path, at(i, "param"), v)} />
              ) : (
                <input type="number" min={0} max={65535} value={Number(param ?? 0)}
                       onChange={(e) => documents.edit(path, at(i, "param"), Math.max(0, Math.min(65535, Number(e.target.value) || 0)))} />
              )}
            </label>
            <button className="icon" title="Remove" onClick={() => documents.edit(path, ["evolutions", i], undefined)}>×</button>
          </div>
        );
      })}
      {evolutions.length < 7 && (
        <button className="chip" onClick={() => documents.edit(path, ["evolutions", evolutions.length],
          new Map<string, JsonValue>([["method", "EVO_METHOD_LEVEL"], ["param", 16], ["species", "SPECIES_NONE"]]))}>+ Add an evolution</button>
      )}
    </div>
  );
}

/** The family: the first stage, found back through who evolves into whom, and every evolution from it. */
function Family({ species, list, onOpen }: { species: string; list: Listed[]; onOpen(species: string): void }) {
  const bySpecies = useMemo(() => new Map(list.filter((l) => !l.folder.includes("/")).map((l) => [l.species, l])), [list]);
  const parents = useMemo(() => {
    const out = new Map<string, string>();
    for (const l of list) if (!l.folder.includes("/")) for (const e of l.evolutions) if (e.species && !out.has(e.species)) out.set(e.species, l.species);
    return out;
  }, [list]);
  let root = species;
  for (let i = 0; i < 4 && parents.has(root); i++) root = parents.get(root)!;
  const node = (s: string, depth: number): JSX.Element => {
    const entry = bySpecies.get(s);
    return (
      <div key={`${s}:${depth}`} className="pkm-family-node">
        <button className={`pkm-family-mon${s === species ? " current" : ""}`} onClick={() => onOpen(s)}>
          <SpeciesIcon species={s} /> {entry?.name ?? constantLabel(s, "SPECIES_")}
        </button>
        {entry && entry.evolutions.length > 0 && depth < 4 && (
          <div className="pkm-family-children">
            {entry.evolutions.map((e, i) => (
              <div key={i} className="pkm-family-branch">
                <span className="muted pkm-family-how">{constantLabel(e.method, "EVO_METHOD_")}{e.param !== 0 && e.param !== undefined ? ` ${typeof e.param === "string" ? constantLabel(e.param, /^(ITEM|MOVE|SPECIES)_/.exec(e.param)?.[0] ?? "") : e.param}` : ""} →</span>
                {node(e.species, depth + 1)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
  return <div className="pkm-family">{node(root, 0)}</div>;
}

function SpeciesPage({ entry, list, constants, onOpen }: { entry: Listed; list: Listed[]; constants: Constants; onOpen(species: string): void }) {
  const { data, error } = useHeld(entry.path);
  if (error) return <p className="pkm-error">{error}</p>;
  if (!(data instanceof Map)) return <p className="muted pkm-empty">Reading…</p>;
  const field = (key: string, label?: string) => data.has(key) && (
    <div key={key} className="pkm-field">
      <span className="muted">{label ?? key.replace(/_/g, " ")}</span>
      <DocForm path={entry.path} at={[key]} constants={constants} hideDescription />
    </div>
  );
  return (
    <div className="pkm-page">
      <div className="pkm-top">
        <Sprite folder={entry.folder} />
        <div>
          <h2><span className="muted">#{entry.number}</span> {String(data.get("name") ?? entry.name)}</h2>
          <p className="muted pkm-note">{entry.path}</p>
          <div className="pkm-top-fields">{field("name")}{field("types")}</div>
        </div>
      </div>
      <section className="pkm-card pkm-stats-card">
        <Stats path={entry.path} data={data} label="Base stats" max={255} />
        <Stats path={entry.path} data={data} label="EV yields" max={3} />
      </section>
      <section className="pkm-card">
        <h3>Abilities, breeding and the rest</h3>
        <div className="pkm-fields">
          {["abilities", "hidden_ability", "held_items", "gender_ratio", "catch_rate", "base_exp", "growth_rate", "egg_groups",
            "hatch_cycles", "base_friendship", "flee_rate", "color", "height", "weight", "evolution_stage", "baby_species",
            "regional_dex_number", "forms", "asymmetric", "palette_forms", "cry_volume", "underground", "name_article"].map((k) => field(k))}
        </div>
      </section>
      <section className="pkm-card">
        <h3>Evolutions</h3>
        <Evolutions path={entry.path} data={data} constants={constants} />
        {!entry.folder.includes("/") && <><h4>The family</h4><Family species={entry.species} list={list} onOpen={onOpen} /></>}
      </section>
      <section className="pkm-card">
        <h3>Learnset</h3>
        <div className="pkm-learnset">
          <div><h4>By level</h4><LevelMoves path={entry.path} data={data} constants={constants} /></div>
          <div>
            <h4>TMs and HMs</h4><DocForm path={entry.path} at={["learnset", "by_tm"]} constants={constants} hideDescription />
            <h4>Tutors</h4><DocForm path={entry.path} at={["learnset", "by_tutor"]} constants={constants} hideDescription />
            {map(data.get("learnset")).has("egg_moves") && <><h4>Egg moves</h4><DocForm path={entry.path} at={["learnset", "egg_moves"]} constants={constants} hideDescription /></>}
          </div>
        </div>
      </section>
      {data.has("pokedex") && (
        <section className="pkm-card">
          <h3>Pokédex</h3>
          <DocForm path={entry.path} at={["pokedex"]} constants={constants} hideDescription />
        </section>
      )}
    </div>
  );
}

export function PokemonEditor({ constants }: ToolProps) {
  const [list, setList] = useState<Listed[] | null>(null);
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const { docs } = useDocuments();

  useEffect(() => {
    api.data(SCHEMA, ["name", "evolutions"]).then((files) => {
      const out: Listed[] = files.map(({ path, data }) => {
        const folder = path.slice("res/pokemon/".length, -"/data.json".length);
        const species = `SPECIES_${folder.split("/")[0].toUpperCase()}`;
        return {
          path, folder, species,
          name: String(data.name ?? folder) + (folder.includes("/") ? ` (${folder.split("/").slice(1).join(" ").replace(/_/g, " ")})` : ""),
          number: constants.get(species) ?? 0,
          evolutions: ((data.evolutions as Listed["evolutions"] | undefined) ?? []),
        };
      });
      out.sort((a, b) => (a.number || 1e9) - (b.number || 1e9) || a.folder.localeCompare(b.folder));
      setList(out);
    });
  }, [constants]);

  const unsaved = [...docs.values()].filter((d) => d.dirty && d.path.startsWith("res/pokemon/"));
  const save = useCallback(async () => {
    for (const p of documents.dirtyPaths().filter((p) => p.startsWith("res/pokemon/"))) await documents.save(p);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); e.stopPropagation(); save(); }
      else if ((key === "z" || key === "y") && chosen && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); e.stopPropagation();
        if (key === "y" || e.shiftKey) documents.redo(chosen); else documents.undo(chosen);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, chosen]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (list ?? []).filter((l) => !q || l.name.toLowerCase().includes(q) || String(l.number) === q || l.folder.includes(q));
  }, [list, filter]);
  const entry = list?.find((l) => l.path === chosen) ?? null;
  const openSpecies = (species: string) => {
    const found = list?.find((l) => l.folder === speciesFolder(species));
    if (found) setChosen(found.path);
  };

  return (
    <div className="pkm-editor">
      <header className="pkm-header">
        <h2>Pokémon Editor</h2>
        <span className="spacer" />
        {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
        <button onClick={() => unsaved.forEach((d) => documents.reload(d.path))} disabled={!unsaved.length}>Revert</button>
        <button className="primary" onClick={save} disabled={!unsaved.length} title="Ctrl+S">Save</button>
      </header>
      {unsaved.filter((d) => d.saveError).map((d) => <div key={d.path} className="pkm-error pkm-bar">{d.path}: {d.saveError}</div>)}
      <div className="pkm-split">
        <div className="pkm-list">
          <input className="filter" placeholder={`Filter ${list?.length ?? 0} species and forms…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="pkm-list-items">
            {shown.map((l) => (
              <button key={l.path} className={`pkm-item${l.path === chosen ? " selected" : ""}`} onClick={() => setChosen(l.path)}>
                <SpeciesIcon species={l.species} size={24} />
                <span className="muted pkm-number">{l.number || ""}</span>
                <span className="pkm-name">{l.name}{docs.get(l.path)?.dirty ? " •" : ""}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pkm-detail">
          {entry ? <SpeciesPage key={entry.path} entry={entry} list={list ?? []} constants={constants} onOpen={openSpecies} />
            : <p className="muted pkm-empty">Choose a Pokémon.</p>}
        </div>
      </div>
    </div>
  );
}
