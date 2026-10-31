// The Trainer Editor: every trainer (res/trainers/data/<trainer>.json, docs/data.md, Trainers) with the class's sprite,
// the trainer's settings, the party as cards (species, level, form, ability and gender slots, difficulty, and the
// held items and moves when the party has them), and what the trainer says, each line in the talk window's preview.
// Every file is edited through the document store, so it is checked by the build's validator on save.

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
import { SpeciesIcon } from "../pokemon/SpeciesIcon.tsx";
import { TextBox } from "../text/TextBox.tsx";

const SCHEMA = "res/trainers/data/trainer.schema.json";
const DATA = "res/trainers/data";
const SPRITES = "res/trainers/sprites/front";

interface Listed {
  path: string;
  name: string;
  cls: string;
  levels: number[];
}

function ClassSprite({ cls }: { cls: string }) {
  const [sprite, setSprite] = useState<{ image: IndexedImage; colors: Rgb[] } | null>(null);
  useEffect(() => {
    let live = true;
    setSprite(null);
    const folder = `${SPRITES}/${cls.replace(/^TRAINER_CLASS_/, "").toLowerCase()}`;
    Promise.all([api.asset(`${folder}/single.png`).then(readIndexedPng), api.file(`${folder}/normal.pal`)])
      .then(([image, pal]) => live && setSprite({ image, colors: parsePal(pal.text) }))
      .catch(() => live && setSprite(null));
    return () => { live = false; };
  }, [cls]);
  return sprite ? <PalettePreview image={sprite.image} colors={sprite.colors} offset={0} zoom={1} transparent highlight={null} />
    : <span className="trn-sprite-missing muted">No sprite</span>;
}

/** "Leader Roxie" and "Roxie" as "Leader Roxie"; "Ace Trainer" and "Angi" as "Ace Trainer Angi". */
const title = (cls: string, name: string) => {
  const label = constantLabel(cls, "TRAINER_CLASS_");
  return label.toLowerCase().endsWith(name.toLowerCase()) ? label : `${label} ${name}`;
};

const map = (v: JsonValue | undefined) => (v instanceof Map ? v : new Map<string, JsonValue>());

function PartyCard({ path, index, mon, constants, withItems, withMoves, count }: {
  path: string;
  index: number;
  mon: JsonMap;
  constants: Constants;
  withItems: boolean;
  withMoves: boolean;
  count: number;
}) {
  const at = (key: string) => ["party", index, key];
  const num = (key: string, min: number, max: number) => (
    <label className="trn-field"><span>{key[0].toUpperCase() + key.slice(1)}</span>
      <input type="number" min={min} max={max} value={Number(mon.get(key) ?? 0)}
             onChange={(e) => documents.edit(path, at(key), Math.max(min, Math.min(max, Number(e.target.value) || 0)))} />
    </label>
  );
  const species = String(mon.get("species") ?? "SPECIES_NONE");
  const moves = (mon.get("moves") as JsonValue[] | undefined) ?? [];
  const move = (i: number, value: string) => {
    const next = [0, 1, 2, 3].map((j) => (j === i ? value : String(moves[j] ?? "MOVE_NONE")));
    while (next.length && next[next.length - 1] === "MOVE_NONE") next.pop();
    documents.edit(path, at("moves"), next);
  };
  const shift = (to: number) => {
    const doc = documents.get(path);
    const party = [...((map(doc?.data ?? null).get("party") as JsonValue[]) ?? [])];
    const [taken] = party.splice(index, 1);
    party.splice(to, 0, taken);
    documents.edit(path, ["party"], party);
  };
  return (
    <div className="trn-mon">
      <div className="trn-mon-head">
        <SpeciesIcon species={species} />
        <SearchSelect value={species} options={constantOptions(constants, "SPECIES_")} onChange={(v) => documents.edit(path, at("species"), v)} />
        <span className="trn-mon-actions">
          <button className="icon" title="Earlier" disabled={index === 0} onClick={() => shift(index - 1)}>↑</button>
          <button className="icon" title="Later" disabled={index === count - 1} onClick={() => shift(index + 1)}>↓</button>
          <button className="icon" title="Remove" onClick={() => documents.edit(path, ["party", index], undefined)}>×</button>
        </span>
      </div>
      <div className="trn-mon-fields">
        {num("level", 1, 100)}
        {num("form", 0, 65535)}
        <label className="trn-field" title="Sets the Pokémon's individual values"><span>Difficulty</span>
          <input type="number" min={0} max={255} value={Number(mon.get("difficulty") ?? 0)}
                 onChange={(e) => documents.edit(path, at("difficulty"), Math.max(0, Math.min(255, Number(e.target.value) || 0)))} /></label>
        <label className="trn-field" title="Picks the ability when not 0"><span>Ability</span>
          <input type="number" min={0} max={15} value={Number(mon.get("ability") ?? 0)}
                 onChange={(e) => documents.edit(path, at("ability"), Math.max(0, Math.min(15, Number(e.target.value) || 0)))} /></label>
        <label className="trn-field" title="Picks the gender when not 0"><span>Gender</span>
          <input type="number" min={0} max={15} value={Number(mon.get("gender") ?? 0)}
                 onChange={(e) => documents.edit(path, at("gender"), Math.max(0, Math.min(15, Number(e.target.value) || 0)))} /></label>
      </div>
      {withItems && (
        <label className="trn-row"><span className="muted">Item</span>
          <SearchSelect value={String(mon.get("item") ?? "ITEM_NONE")} options={constantOptions(constants, "ITEM_")} onChange={(v) => documents.edit(path, at("item"), v)} />
        </label>
      )}
      {withMoves ? (
        <div className="trn-moves">
          {[0, 1, 2, 3].map((i) => (
            <SearchSelect key={i} value={String(moves[i] ?? "MOVE_NONE")} options={constantOptions(constants, "MOVE_")} onChange={(v) => move(i, v)} />
          ))}
        </div>
      ) : <p className="muted trn-note">The moves of its level.</p>}
    </div>
  );
}

function TrainerPage({ path, constants }: { path: string; constants: Constants }) {
  const { data, error } = useHeld(path);
  if (error) return <p className="trn-error">{error}</p>;
  if (!(data instanceof Map)) return <p className="muted">Reading…</p>;
  const party = ((data.get("party") as JsonValue[] | undefined) ?? []).map(map);
  const messages = ((data.get("messages") as JsonValue[] | undefined) ?? []).map(map);
  const withItems = party.some((m) => m.has("item"));
  const withMoves = party.some((m) => m.has("moves"));
  const cls = String(data.get("class") ?? "");

  // A party has items or moves for all its Pokémon or for none
  const setAll = (key: "item" | "moves", on: boolean) => {
    const next = party.map((m) => {
      const copy = new Map(m);
      if (on && !copy.has(key)) copy.set(key, key === "item" ? "ITEM_NONE" : []);
      if (!on) copy.delete(key);
      return copy;
    });
    documents.edit(path, ["party"], next);
  };
  const addMon = () => {
    const last = party[party.length - 1];
    const mon = new Map<string, JsonValue>([["species", "SPECIES_NONE"], ["form", 0], ["level", Number(last?.get("level") ?? 5)],
      ["difficulty", 0], ["gender", 0], ["ability", 0]]);
    if (withItems) mon.set("item", "ITEM_NONE");
    if (withMoves) mon.set("moves", []);
    documents.edit(path, ["party", party.length], mon);
  };

  return (
    <div className="trn-page">
      <div className="trn-top">
        <div className="trn-sprite"><ClassSprite cls={cls} /></div>
        <div className="trn-title">
          <h2>{title(cls, String(data.get("name") ?? ""))}</h2>
          <p className="muted trn-note">{path}</p>
        </div>
      </div>
      <section className="trn-card">
        <h3>The trainer</h3>
        <div className="trn-settings">
          {["name", "class", "battle_style", "money", "reward", "heals", "items", "ai_flags"].map((key) => data.has(key) && (
            <div key={key} className="trn-setting">
              <span className="muted">{key.replace(/_/g, " ")}</span>
              <DocForm path={path} at={[key]} constants={constants} hideDescription />
            </div>
          ))}
        </div>
      </section>
      <section className="trn-card">
        <h3>Party <span className="muted">{party.length} of 6</span></h3>
        <div className="trn-toggles">
          <label><input type="checkbox" checked={withItems} onChange={(e) => setAll("item", e.target.checked)} /> Held items</label>
          <label><input type="checkbox" checked={withMoves} onChange={(e) => setAll("moves", e.target.checked)} /> Its own moves (else the moves of their levels)</label>
        </div>
        <div className="trn-party">
          {party.map((mon, i) => (
            <PartyCard key={i} path={path} index={i} mon={mon} constants={constants} withItems={withItems} withMoves={withMoves} count={party.length} />
          ))}
          {party.length < 6 && <button className="trn-add" onClick={addMon}>+ Add a Pokémon</button>}
        </div>
      </section>
      <section className="trn-card">
        <h3>What the trainer says</h3>
        {messages.length === 0 && <p className="muted trn-note">Nothing.</p>}
        {messages.map((m, i) => {
          const type = m.get("type");
          const text = String(m.get("text") ?? "");
          return (
            <div key={i} className="trn-message">
              <div className="muted trn-note">{typeof type === "string" ? constantLabel(type, "TRMSG_") : `Moment ${String(type)}`}</div>
              <textarea className="trn-text" value={text} rows={Math.max(3, text.split("\n").length + 1)}
                        onChange={(e) => documents.edit(path, ["messages", i, "text"], e.target.value)} />
              <TextBox text={text} />
            </div>
          );
        })}
      </section>
    </div>
  );
}

export function TrainerEditor({ constants }: ToolProps) {
  const [list, setList] = useState<Listed[] | null>(null);
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const { docs } = useDocuments();

  useEffect(() => {
    api.data(SCHEMA, ["name", "class", "party"]).then((files) => {
      setList(files.map(({ path, data }) => ({
        path,
        name: String(data.name ?? ""),
        cls: String(data.class ?? ""),
        levels: ((data.party as { level?: number }[] | undefined) ?? []).map((p) => Number(p.level ?? 0)),
      })).sort((a, b) => a.path.localeCompare(b.path)));
    });
  }, []);

  const unsaved = [...docs.values()].filter((d) => d.dirty && d.path.startsWith(`${DATA}/`));
  const save = useCallback(async () => {
    for (const p of documents.dirtyPaths().filter((p) => p.startsWith(`${DATA}/`))) await documents.save(p);
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
    return (list ?? []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.cls.toLowerCase().includes(q.replace(/ /g, "_")) ||
      t.path.includes(q));
  }, [list, filter]);

  return (
    <div className="trn-editor">
      <header className="trn-header">
        <h2>Trainer Editor</h2>
        <span className="spacer" />
        {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
        <button onClick={() => unsaved.forEach((d) => documents.reload(d.path))} disabled={!unsaved.length}>Revert</button>
        <button className="primary" onClick={save} disabled={!unsaved.length} title="Ctrl+S">Save</button>
      </header>
      {unsaved.filter((d) => d.saveError).map((d) => <div key={d.path} className="trn-error trn-bar">{d.path}: {d.saveError}</div>)}
      <div className="trn-split">
        <div className="trn-list">
          <input className="filter" placeholder={`Filter ${list?.length ?? 0} trainers by name or class…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="trn-list-items">
            {shown.map((t) => (
              <button key={t.path} className={`trn-item${t.path === chosen ? " selected" : ""}`} onClick={() => setChosen(t.path)}>
                <span className="trn-item-name">{title(t.cls, t.name)}{docs.get(t.path)?.dirty ? " •" : ""}</span>
                <span className="muted trn-item-levels">{t.levels.length ? `${t.levels.length} · Lv. ${Math.max(...t.levels)}` : "no party"}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="trn-detail">
          {chosen ? <TrainerPage key={chosen} path={chosen} constants={constants} /> : <p className="muted trn-empty">Choose a trainer.</p>}
        </div>
      </div>
    </div>
  );
}

