// The Pokémon Editor: every species (res/pokemon/<species>/data.json, docs/data.md, Species) with its sprite in its
// normal and shiny colors, its base stats as bars with their total, its types, abilities and other settings, its
// Pokédex data, its learnset (by level, TMs, tutors, egg moves), and its evolutions, with the whole family's tree; and
// under each species its alternate forms (forms.ts), each with a page of its own (FormPage.tsx), and Add form; and the
// whole new species Paper White 2 adds (AddedSpecies.tsx): Add Pokémon on the list, and an added species' card, cry,
// icon and stills. Every file is edited through the document store, so it is checked by the build's validator on save;
// adding and removing forms is tools/paperwhite2/pokemon_form.py's, and adding, retiring and removing species
// tools/paperwhite2/pokemon_species.py's.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AddedSpecies, type PokemonFormsInfo, type PokemonSpeciesInfo } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import type { JsonMap, JsonValue } from "../../../shared/json.ts";
import type { Constants } from "../../../shared/schema.ts";
import { SearchSelect } from "../../shell/SearchSelect.tsx";
import type { ToolProps } from "../types.ts";
import { PalettePreview } from "../palettes/PaletteEditor.tsx";
import { parsePal, type Rgb } from "../palettes/pal.ts";
import { readIndexedPng, type IndexedImage } from "../palettes/png.ts";
import { constantLabel, constantOptions } from "../schema-form/form.tsx";
import { evolutionText } from "./evolutionText.ts";
import { DocForm, useHeld } from "../followers/DocForm.tsx";
import { SpeciesIcon, speciesFolder } from "./SpeciesIcon.tsx";
import { useToolActive } from "../active.ts";
import { useToolParams } from "../../navigation.ts";
import { FormIcon, FormPage, FormsCard, MirrorToggle, Row, SERVICES, WonderTradeRow } from "./FormPage.tsx";
import { FollowerSpritesCard } from "./FollowerSprites.tsx";
import { BattleSpriteArt } from "./BattleSpriteArt.tsx";
import { isOriginalForm, listSpecies, type Listed } from "./forms.ts";
import { AddedSpeciesArt, AddedSpeciesCard, AddPokemonDialog, CryCard, FollowerCard } from "./AddedSpecies.tsx";

const SCHEMA = "res/pokemon/species.schema.json";
const STATS = [["hp", "HP"], ["attack", "Attack"], ["defense", "Defense"], ["special_attack", "Sp. Atk"],
  ["special_defense", "Sp. Def"], ["speed", "Speed"]] as const;

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

/** A species' evolutions, each with its species, method, parameter and, where the species has forms, the only form
 * that evolves that way ("form": CheckEvolveSpecies clears the others' for a Pokémon of another form), so any method
 * can be one form's. */
function Evolutions({ path, data, constants, formNames }: { path: string; data: JsonMap; constants: Constants; formNames: string[] }) {
  const evolutions = ((data.get("evolutions") as JsonValue[] | undefined) ?? []).map(map);
  const at = (i: number, key: string) => ["evolutions", i, key];
  const forms = formNames.length > 1;
  return (
    <div className="pkm-evolutions">
      {forms && evolutions.length > 0 && (
        <div className="pkm-evolution pkm-evolution-forms pkm-evolution-head">
          <span /><span className="muted">Evolves into</span><span className="muted">Method</span><span className="muted">Parameter</span>
          <span className="muted" title="Only a Pokémon of this form evolves this way; Any for every form. It keeps its form number.">Only form</span><span />
        </div>
      )}
      {evolutions.map((evo, i) => {
        const method = String(evo.get("method") ?? "EVO_METHOD_LEVEL");
        const kind = paramKind(method);
        const param = evo.get("param");
        const form = evo.get("form");
        return (
          <div key={i} className={`pkm-evolution${forms ? " pkm-evolution-forms" : ""}`}>
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
            {forms && (
              <select className="pkm-only-form" value={form === undefined ? "" : String(form)} aria-label="Only form"
                      title="Only a Pokémon of this form evolves this way"
                      onChange={(e) => documents.edit(path, at(i, "form"), e.target.value === "" ? undefined : Number(e.target.value))}>
                <option value="">Any form</option>
                {formNames.map((name, n) => <option key={n} value={n}>{n}: {name}</option>)}
                {typeof form === "number" && form >= formNames.length && <option value={form}>{form}: (no such form)</option>}
              </select>
            )}
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
  const bySpecies = useMemo(() => new Map(list.filter((l) => l.form === 0).map((l) => [l.species, l])), [list]);
  const parents = useMemo(() => {
    const out = new Map<string, string>();
    for (const l of list) if (l.form === 0) for (const e of l.evolutions) if (e.species && !out.has(e.species)) out.set(e.species, l.species);
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
                <span className="muted pkm-family-how">{evolutionText(e)}{e.form !== undefined ? ` (${entry.formNames[e.form] ?? `form ${e.form}`} only)` : ""} →</span>
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

/** A record's data sections: stats, abilities and the rest, evolutions with the family (a species' only: a form takes
 * its species' evolutions, which its page shows), learnset. */
function RecordSections({ path, entry, list, constants, onOpen }: {
  path: string; entry: Listed; list: Listed[]; constants: Constants; onOpen(species: string): void;
}) {
  const { data, error } = useHeld(path);
  if (error) return <p className="pkm-error">{error}</p>;
  if (!(data instanceof Map)) return <p className="muted pkm-empty">Reading…</p>;
  const form = entry.form > 0;
  const field = (key: string, label?: string) => data.has(key) && (
    <div key={key} className="pkm-field">
      <span className="muted">{label ?? key.replace(/_/g, " ")}</span>
      <DocForm path={path} at={[key]} constants={constants} hideDescription />
    </div>
  );
  return (
    <>
      {form && (
        <section className="pkm-card">
          <h3>Its own data <span className="muted">{path}</span></h3>
          <div className="pkm-top-fields">{field("types")}</div>
        </section>
      )}
      <section className="pkm-card pkm-stats-card">
        <Stats path={path} data={data} label="Base stats" max={255} />
        <Stats path={path} data={data} label="EV yields" max={3} />
      </section>
      <section className="pkm-card">
        <h3>Abilities, breeding and the rest</h3>
        <div className="pkm-fields">
          {["abilities", "hidden_ability", "held_items", "gender_ratio", "catch_rate", "base_exp", "growth_rate", "egg_groups",
            "hatch_cycles", "base_friendship", "flee_rate", "color", "height", "weight", "evolution_stage", "baby_species",
            "regional_dex_number", "asymmetric", "palette_forms", "cry_volume", "underground", "name_article"].map((k) => field(k))}
        </div>
      </section>
      {!form && <section className="pkm-card">
        <h3>Evolutions</h3>
        {entry.count > 1 && <p className="muted pkm-note">An evolution for one form only: pick it in Only form (an Alolan
          Vulpix by an Ice Rock, a plain one by a Fire Stone). Any method can be one form's. The evolved Pokémon keeps its
          form number. Each form's page shows the evolutions it takes.</p>}
        <Evolutions path={path} data={data} constants={constants} formNames={entry.formNames} />
        <h4>The family</h4><Family species={entry.species} list={list} onOpen={onOpen} />
      </section>}
      <section className="pkm-card">
        <h3>Learnset</h3>
        <div className="pkm-learnset">
          <div><h4>By level</h4><LevelMoves path={path} data={data} constants={constants} /></div>
          <div>
            <h4>TMs and HMs</h4><DocForm path={path} at={["learnset", "by_tm"]} constants={constants} hideDescription />
            <h4>Tutors</h4><DocForm path={path} at={["learnset", "by_tutor"]} constants={constants} hideDescription />
            {map(data.get("learnset")).has("egg_moves") && <><h4>Egg moves</h4><DocForm path={path} at={["learnset", "egg_moves"]} constants={constants} hideDescription /></>}
          </div>
        </div>
      </section>
    </>
  );
}

/** The number a species shows: its Pokédex number, "???" for an added one without one, "—" out of the Pokédex. */
export function shownNumber(l: Listed): string {
  return l.display !== null ? String(l.display).padStart(3, "0") : !l.added ? "" : l.inDex ? "???" : "—";
}

function SpeciesPage({ entry, list, info, speciesInfo, constants, onOpen, onSelect, onChanged, onReuse }: {
  entry: Listed; list: Listed[]; info: PokemonFormsInfo | null; speciesInfo: PokemonSpeciesInfo | null; constants: Constants;
  onOpen(species: string): void; onSelect(key: string): void; onChanged(select?: string): void; onReuse(added: AddedSpecies): void;
}) {
  const { data, error } = useHeld(entry.speciesPath);
  const [spriteEpoch, setSpriteEpoch] = useState(0);
  if (error) return <p className="pkm-error">{error}</p>;
  if (!(data instanceof Map)) return <p className="muted pkm-empty">Reading…</p>;
  const forms = list.filter((l) => l.folder === entry.folder && l.form > 0);
  const added = speciesInfo?.species.find((s) => s.species === entry.species) ?? null;
  return (
    <div className="pkm-page">
      <div className="pkm-top">
        <Sprite key={spriteEpoch} folder={entry.folder} />
        <div>
          <h2><span className="muted">{entry.added ? `No. ${shownNumber(entry)}` : `#${entry.number}`}</span> {String(data.get("name") ?? entry.name)}
            {entry.added && <span className="pkm-tag pkm-title-tag">added · ID {entry.number}</span>}
            {entry.retired && <span className="pkm-tag pkm-tag-hidden pkm-title-tag">hidden</span>}</h2>
          <p className="muted pkm-note">{entry.speciesPath}</p>
          <div className="pkm-top-fields">
            {(["name", "types"] as const).map((key) => data.has(key) && (
              <div key={key} className="pkm-field">
                <span className="muted">{key}</span>
                <DocForm path={entry.speciesPath} at={[key]} constants={constants} hideDescription />
              </div>
            ))}
          </div>
          {entry.number > 0 && <div className="pkm-rows pkm-top-rows">{entry.added && !entry.inDex
            ? <Row label="Wonder Trade"><span className="muted">Never: {entry.retired ? "it is retired" : "it isn't in the Pokédex"}.</span></Row>
            : <WonderTradeRow entry={entry} original={info?.original ?? {}} />}</div>}
          {entry.number > 0 && <MirrorToggle entry={entry} speciesName={String(data.get("name") ?? entry.name)} onChanged={onChanged} />}
        </div>
      </div>
      {added && <AddedSpeciesCard entry={entry} added={added} info={speciesInfo} onChanged={onChanged} onReuse={() => onReuse(added)} />}
      {entry.number > 0 && <FormsCard entry={entry} forms={forms} info={info} onOpen={onSelect} onChanged={onChanged} />}
      {entry.number > 0 && <BattleSpriteArt species={entry.species} form={0} folder={entry.folder} speciesName={String(data.get("name") ?? entry.name)}
        onWritten={() => { setSpriteEpoch((n) => n + 1); onChanged(entry.key); }} />}
      {entry.added && <AddedSpeciesArt entry={entry} onWritten={() => { setSpriteEpoch((n) => n + 1); onChanged(entry.key); }} />}
      {added ? <FollowerCard list={list} added={added} onChanged={() => onChanged(entry.key)} />
        : entry.number > 0 && <FollowerSpritesCard species={entry.species} form={0} name={String(data.get("name") ?? entry.name)} />}
      {entry.number > 0 && <CryCard entry={entry} added={added} constants={constants} onChanged={() => onChanged(entry.key)} />}
      <RecordSections path={entry.speciesPath} entry={entry} list={list} constants={constants} onOpen={onOpen} />
      {data.has("pokedex") && (
        <section className="pkm-card">
          <h3>Pokédex</h3>
          <DocForm path={entry.speciesPath} at={["pokedex"]} constants={constants} hideDescription />
        </section>
      )}
    </div>
  );
}

export function PokemonEditor({ constants }: ToolProps) {
  const toolActive = useToolActive();
  const [list, setList] = useState<Listed[] | null>(null);
  const [info, setInfo] = useState<PokemonFormsInfo | null>(null);
  const [speciesInfo, setSpeciesInfo] = useState<PokemonSpeciesInfo | null>(null);
  const [adding, setAdding] = useState(false);
  const [reusing, setReusing] = useState<AddedSpecies | null>(null);
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const { docs } = useDocuments();

  useEffect(() => {
    let live = true;
    // (the added species' numbers, retirement and Pokédex flag from pokemon_species.py info, which reads them whole)
    Promise.all([api.data(SCHEMA, ["name", "evolutions", "forms", "pokedex.form_name", "pokedex.forms"]),
      api.pokemonSpecies().catch(() => null)]).then(([files, species]) => {
      if (!live) return;
      setSpeciesInfo(species);
      setList(listSpecies(files, constants, species?.species ?? []));
    });
    api.pokemonForms().then((i) => live && setInfo(i), () => live && setInfo(null));
    return () => { live = false; };
  }, [constants, epoch]);
  // A species' or form's file changed on disk (the server's poll: a form change's files, a save, a commit undone): the
  // list read again, since the server lists a new form_<n>.json only once its poll has seen it
  useEffect(() => documents.onFiles((paths) => {
    if (paths.some((p) => /^res\/pokemon\/.+\.(json|wav)$/.test(p))) setEpoch((n) => n + 1);
  }), []);
  /** After a form change: the list and the forms' facts read again, and the page given chosen. */
  const changed = useCallback((select?: string) => {
    setEpoch((n) => n + 1);
    if (select) setChosen(select);
  }, []);

  // (the Follower cards' rows too, whose walking sprite is picked there)
  const editable = (p: string) => p.startsWith("res/pokemon/") || p === SERVICES || p.startsWith("res/field/actors/followers/");
  const unsaved = [...docs.values()].filter((d) => d.dirty && editable(d.path));
  const save = useCallback(async () => {
    const paths = documents.dirtyPaths().filter(editable);
    for (const p of paths) await documents.save(p);
    if (paths.some((p) => p.endsWith("/data.json"))) setEpoch((n) => n + 1);
  }, []);
  const entry = list?.find((l) => l.key === chosen) ?? null;
  const undoPath = entry ? (entry.form && entry.recordPath ? entry.recordPath : entry.speciesPath) : null;
  useEffect(() => {
    if (!toolActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); e.stopPropagation(); save(); }
      else if ((key === "z" || key === "y") && undoPath && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); e.stopPropagation();
        if (key === "y" || e.shiftKey) documents.redo(undoPath); else documents.undo(undoPath);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, undoPath, toolActive]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (list ?? []).filter((l) => !q || l.name.toLowerCase().includes(q) || String(l.number) === q || String(l.display) === q
      || l.folder.includes(q) || (q === "added" && l.added));
  }, [list, filter]);
  const openSpecies = (species: string) => {
    const found = list?.find((l) => l.form === 0 && l.folder === speciesFolder(species));
    if (found) setChosen(found.key);
  };
  // A link from another editor: #tool/pokemon?species=SPECIES_...[&form=N] (the Move and Ability Editors' lists)
  const params = useToolParams("pokemon");
  useEffect(() => {
    const species = params.get("species");
    const form = Number(params.get("form") ?? 0);
    const hit = species && list?.find((l) => l.species === species && l.form === form);
    if (hit) { setChosen(hit.key); setFilter(""); }
  }, [params, list]);
  const dirtyMark = (l: Listed) => (docs.get(l.form ? l.recordPath ?? "" : l.speciesPath)?.dirty ? " •" : "");

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
          <div className="pkm-list-head">
            <input className="filter" placeholder={`Filter ${list?.length ?? 0} species and forms…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="primary" onClick={() => setAdding(true)} title="A whole new species, copied from a template">+ Add Pokémon</button>
          </div>
          <div className="pkm-list-items">
            {shown.map((l) => (
              <button key={l.key} className={`pkm-item${l.form ? " pkm-item-form" : ""}${l.key === chosen ? " selected" : ""}`} onClick={() => setChosen(l.key)}>
                {l.form ? <FormIcon entry={l} size={24} epoch={epoch} /> : <SpeciesIcon species={l.species} size={24} />}
                <span className="muted pkm-number">{l.form ? "" : l.added ? shownNumber(l) : l.number || ""}</span>
                <span className="pkm-name">{l.form ? l.name.slice(l.name.indexOf(":") + 2) : l.name}{dirtyMark(l)}</span>
                {((l.form > 0 && info && !isOriginalForm(info.original, l.folder, l.form)) || (!l.form && l.added)) && <span className="pkm-tag">added</span>}
                {!l.form && l.retired && <span className="pkm-tag pkm-tag-hidden">hidden</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="pkm-detail">
          {entry && entry.form > 0 ? (
            <FormPage key={`${entry.key}@${entry.recordPath ?? ""}`} entry={entry} list={list ?? []} info={info} constants={constants}
              onChanged={changed} onOpen={openSpecies}
              sprite={(folder, e) => <Sprite key={`${folder}@${e}`} folder={folder} />}
              record={(path) => <RecordSections path={path} entry={entry} list={list ?? []} constants={constants} onOpen={openSpecies} />} />
          ) : entry ? (
            <SpeciesPage key={entry.key} entry={entry} list={list ?? []} info={info} speciesInfo={speciesInfo} constants={constants} onOpen={openSpecies}
              onSelect={setChosen} onChanged={changed} onReuse={setReusing} />
          ) : <p className="muted pkm-empty">Choose a Pokémon.</p>}
        </div>
      </div>
      {(adding || reusing) && (
        <AddPokemonDialog list={list ?? []} info={speciesInfo} reuse={reusing ?? undefined}
          onClose={() => { setAdding(false); setReusing(null); }}
          onDone={(folder) => { setAdding(false); setReusing(null); changed(folder || undefined); }} />
      )}
    </div>
  );
}
