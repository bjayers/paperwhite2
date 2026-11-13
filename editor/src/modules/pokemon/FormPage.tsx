// A species' alternate forms in the Pokémon Editor: the Forms card of a species' page (its forms, and Add form), a form's
// own page (its Pokédex text, art, whether it has a data record of its own, Can't evolve and the evolutions it takes,
// the Wonder Trade), and the
// art a form imports. Adding and removing forms and their records is tools/paperwhite2/pokemon_form.py's, through the
// server (/api/pokemon-forms/*): it copies art and follower folders and writes obj_codes.txt besides the JSON, so it
// writes res/ itself and the editor reads the files it changed again. Everything else on these pages is an edit of
// the species' data.json, the form's record or services.json through the document store, saved with Save.

import React, { useEffect, useMemo, useState } from "react";
import { api, type PokemonFormChange, type PokemonFormsInfo } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import type { JsonValue } from "../../../shared/json.ts";
import type { Constants } from "../../../shared/schema.ts";
import { DocForm, useHeld } from "../followers/DocForm.tsx";
import { readIndexedPng, type IndexedImage } from "../palettes/png.ts";
import { BattleSpriteArt } from "./BattleSpriteArt.tsx";
import { SpeciesIcon } from "./SpeciesIcon.tsx";
import { formEvolutions, isOriginalForm, type Evolution, type Listed } from "./forms.ts";
import { evolutionText } from "./evolutionText.ts";
import { FollowerSpritesCard } from "./FollowerSprites.tsx";

export const SERVICES = "res/paperwhite2/pokemon_center/services.json";
const map = (v: JsonValue | undefined) => (v instanceof Map ? v : new Map<string, JsonValue>());
const list = (v: JsonValue | undefined) => (Array.isArray(v) ? v : []);

/** The files a form change can write: none may have unsaved edits, since the tool writes them on disk. */
const touched = (path: string) => path.startsWith("res/pokemon/") || path.startsWith("res/field/actors/followers/")
  || path === SERVICES || path === "generated/obj_codes.txt" || path === "generated/species.txt";

/** Runs a form change (or a species change, AddedSpecies.tsx) after checking nothing it may touch is unsaved, then
 * reads its files again. */
export async function applyFormChange<T extends PokemonFormChange>(run: () => Promise<T>): Promise<T | null> {
  const unsaved = documents.dirtyPaths().filter(touched);
  if (unsaved.length) {
    alert(`Save or revert your changes first (${unsaved.length} file${unsaved.length === 1 ? "" : "s"}: ${unsaved.slice(0, 3).join(", ")}${unsaved.length > 3 ? "…" : ""}): this writes the files on disk.`);
    return null;
  }
  let result: T;
  try {
    result = await run();
  } catch (e) {
    alert((e as Error).message);
    return null;
  }
  if (!result.check) for (const path of [...result.changed, ...result.removed]) if (documents.get(path)) await documents.reload(path);
  return result;
}

const formIcons = new Map<string, Promise<IndexedImage>>();

/** A form's party icon: form_<n>/icon.png in its own colors (an icon's PNG carries its bank's), else its species'. */
export function FormIcon({ entry, size = 32, epoch = 0 }: { entry: Pick<Listed, "folder" | "form" | "species">; size?: number; epoch?: number }) {
  const [image, setImage] = useState<IndexedImage | null | undefined>(undefined);
  const path = `res/pokemon/${entry.folder}/form_${entry.form}/icon.png`;
  useEffect(() => {
    if (!entry.form) return;
    let live = true;
    const key = `${path}@${epoch}`;
    if (!formIcons.has(key)) formIcons.set(key, api.asset(path).then(readIndexedPng));
    formIcons.get(key)!.then((i) => live && setImage(i), () => live && setImage(null));
    return () => { live = false; };
  }, [path, entry.form, epoch]);
  if (!entry.form || image === null) return <SpeciesIcon species={entry.species} size={size} />;
  return <IndexedCanvas image={image ?? null} width={32} height={32} size={size} />;
}

function IndexedCanvas({ image, width, height, size }: { image: IndexedImage | null; width: number; height: number; size: number }) {
  const ref = (canvas: HTMLCanvasElement | null) => {
    const ctx = canvas?.getContext("2d");
    if (!ctx || !image) return;
    const data = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const v = image.pixels[y * image.width + x];
      const c = image.colors[v];
      if (v && c) data.data.set([c[0], c[1], c[2], 255], (y * width + x) * 4);
    }
    ctx.putImageData(data, 0, 0);
  };
  return <canvas ref={ref} width={width} height={height} className="species-icon" style={{ width: size, height: size * (height / width) }} />;
}

/** A setting's control with its hint line under it, beside its label in a section's label column. */
export function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <span className="pkm-row-label">{label}</span>
      <div className="pkm-row-control">{children}{hint && <div className="muted pkm-hint">{hint}</div>}</div>
    </>
  );
}

/** The Wonder Trade row: a species in or out of excluded_species, a form the hack added in or out of excluded_forms.
 * The original game's alternate forms come only through wonder_trade.forms' weights, shown as they are. */
export function WonderTradeRow({ entry, original }: { entry: Listed; original: Record<string, number> }) {
  const { data } = useHeld(SERVICES);
  if (!(data instanceof Map)) return <Row label="Wonder Trade"><span className="muted">Reading services.json…</span></Row>;
  const trade = map(data.get("wonder_trade"));
  const excludedSpecies = list(trade.get("excluded_species")).map(String);
  const excludedForms = list(trade.get("excluded_forms")).map(map);
  const speciesOut = excludedSpecies.includes(entry.species);
  if (!entry.form) {
    return (
      <Row label="Wonder Trade" hint={speciesOut ? "Never received nor sent (wonder_trade.excluded_species)."
        : "Received at random, as every species not left out; its forms the hack added too, unless left out on their pages."}>
        <label className="pkm-check">
          <input type="checkbox" checked={!speciesOut} onChange={(e) => documents.edit(SERVICES, ["wonder_trade", "excluded_species"],
            e.target.checked ? excludedSpecies.filter((s) => s !== entry.species) : [...excludedSpecies, entry.species])} />
          In the random pool
        </label>
      </Row>
    );
  }
  if (speciesOut) return <Row label="Wonder Trade"><span className="muted">Not received: {entry.name.split(":")[0]} is left out (its species' page).</span></Row>;
  if (isOriginalForm(original, entry.folder, entry.form)) {
    const listed = list(trade.get("forms")).map(map).find((f) => f.get("species") === entry.species);
    const weights = list(listed?.get("weights")).map(Number);
    const text = listed?.get("season") ? "Received as the season's form."
      : weights.length ? `Received at weight ${weights[entry.form] ?? 0} of ${weights.reduce((a, b) => a + b, 0)} (wonder_trade.forms, in Data files).`
      : "Not received: the original game's alternate forms come only through wonder_trade.forms (in Data files).";
    return <Row label="Wonder Trade"><span className="muted">{text}</span></Row>;
  }
  const at = excludedForms.findIndex((f) => f.get("species") === entry.species && Number(f.get("form")) === entry.form);
  return (
    <Row label="Wonder Trade" hint={at < 0 ? "Received at random, as often as its species' first form." : "Left out (wonder_trade.excluded_forms)."}>
      <label className="pkm-check">
        <input type="checkbox" checked={at < 0} onChange={(e) => {
          const rows = list(trade.get("excluded_forms"));
          documents.edit(SERVICES, ["wonder_trade", "excluded_forms"], e.target.checked ? rows.filter((_, i) => i !== at)
            : [...rows, new Map<string, JsonValue>([["species", entry.species], ["form", entry.form]])]);
        }} />
        In the random pool
      </label>
    </Row>
  );
}

const MIRROR_HINT = "The Pokédex's pages and list, the trade and the musical flip a Pokémon's sprite to face the other way unless "
  + "it is asymmetric (PERSONAL_NO_FLIP): a Pokémon whose art isn't symmetric (a mark, a notched ear) keeps it as drawn.";

/** "Don't mirror (asymmetric)": the personal data's asymmetric flag, on a species' page (its data.json) or a form's
 * (its record; a form without one reads its species', and turning it on gives the form a record first: a copy of the
 * species' data, as Add form's "Own stats" does). */
export function MirrorToggle({ entry, speciesName, onChanged }: { entry: Listed; speciesName: string; onChanged(select?: string): void }) {
  const own = entry.form === 0 ? entry.speciesPath : entry.recordPath;
  const species = useHeld(entry.speciesPath);
  const record = useHeld(own && own !== entry.speciesPath ? own : null);
  const held = own === entry.speciesPath ? species : record;
  const [busy, setBusy] = useState(false);
  const value = (d: JsonValue | null) => (d instanceof Map ? d.get("asymmetric") === true : null);
  const speciesValue = value(species.data);
  const checked = own ? value(held.data) : speciesValue;
  const formName = entry.name.slice(entry.name.indexOf(":") + 2);

  const giveRecord = async (on: boolean) => {
    let plan: PokemonFormChange;
    try {
      plan = await api.pokemonFormRecord({ species: entry.species, form: entry.form, on: true, check: true });
    } catch (e) {
      alert((e as Error).message);
      return;
    }
    if (!confirm(`${formName} has no data record of its own: it reads ${speciesName}'s, so it is mirrored as ${speciesName} is. `
      + `To ${on ? "stop mirroring it" : "mirror it"} alone, it gets a record first, a copy of ${speciesName}'s stats, types, abilities and moves `
      + `(${summarize(plan.changed)}), which from then on are its own to change (and don't follow ${speciesName}'s edits). Go on?`)) return;
    setBusy(true);
    const result = await applyFormChange(() => api.pokemonFormRecord({ species: entry.species, form: entry.form, on: true }));
    if (result) {
      const path = `res/pokemon/${entry.folder}/form_${entry.form}.json`;
      try {
        await documents.hold(path);
        documents.edit(path, ["asymmetric"], on);
        await documents.save(path);
      } catch (e) {
        alert(`The record was made, but setting its flag failed: ${(e as Error).message}`);
      }
      onChanged(entry.key);
    }
    setBusy(false);
  };
  const hint = entry.form === 0
    ? `${MIRROR_HINT} Its forms with a record of their own have their own flag (their pages); those without one take this.`
    : own ? `${MIRROR_HINT} This form's own, in ${own}.`
    : `${MIRROR_HINT} This form has no record: it takes ${speciesName}'s (${speciesValue ? "not mirrored" : "mirrored"}). Changing it gives the form a record of its own, a copy of ${speciesName}'s data.`;
  return (
    <div className="pkm-mirror">
      <label className="pkm-check">
        <input type="checkbox" checked={checked === true} disabled={checked === null || busy || (!own && entry.form > 0 && !!species.dirty)}
          onChange={(e) => (own ? documents.edit(own, ["asymmetric"], e.target.checked) : void giveRecord(e.target.checked))} />
        Don't mirror (asymmetric){!own && entry.form > 0 ? <span className="muted"> · {speciesName}'s</span> : null}
      </label>
      <span className="muted pkm-hint">{hint}</span>
    </div>
  );
}

/** The species page's Forms card: its forms, and Add form. */
export function FormsCard({ entry, forms, info, onOpen, onChanged }: {
  entry: Listed; forms: Listed[]; info: PokemonFormsInfo | null; onOpen(key: string): void; onChanged(select?: string): void;
}) {
  const { data } = useHeld(entry.speciesPath);
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState(0);
  const [name, setName] = useState("");
  const [record, setRecord] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = map(data instanceof Map ? data.get("forms") : undefined);
  const paletteOnly = data instanceof Map && data.get("palette_forms") === true;
  const count = Number(fields.get("count") ?? 1);
  const recordsForced = forms.some((f) => f.recordPath);
  const original = info?.original[entry.folder] ?? 1;
  const moved = info?.moved[entry.folder];
  const offset = Number(fields.get("sprite_offset") ?? 0);
  const full = count >= (info?.formMax ?? 32);
  useEffect(() => {
    if (!adding) return;
    let live = true;
    setPlan(null);
    api.addPokemonForm({ species: entry.species, from, name, record: record || recordsForced, check: true })
      .then((r) => live && setPlan(`${r.message}. Writes ${r.changed.length} files: ${summarize(r.changed)}.`),
            (e: Error) => live && setPlan(`Can't: ${e.message}`));
    return () => { live = false; };
  }, [adding, from, name, record, recordsForced, entry.species]);
  const add = async () => {
    setBusy(true);
    const result = await applyFormChange(() => api.addPokemonForm({ species: entry.species, from, name, record: record || recordsForced }));
    setBusy(false);
    if (!result) return;
    setAdding(false);
    setName("");
    onChanged(result.form !== undefined ? `${entry.folder}#${result.form}` : undefined);
  };
  const groups = count <= 1 || paletteOnly ? "none" : moved !== undefined
    ? `${moved}–${moved + count - 2}, the hack's (moved from ${offset}, the original game's, as it has more forms than its ${original - 1} groups there)`
    : `${offset}–${offset + count - 2}${offset >= 66 ? ", the hack's" : ", the original game's"}`;
  return (
    <section className="pkm-card">
      <div className="pkm-card-head">
        <h3>Forms <span className="muted">{count} · sprite groups {groups}</span></h3>
        <span className="spacer" />
        {!adding && <button className="primary" disabled={paletteOnly || full} onClick={() => setAdding(true)}
          title={paletteOnly ? "Forms told apart by their palette only (Arceus) can't be added to" : full ? "A Pokémon's form field holds 32 forms" : "Make a new form from this species or one of its forms"}>+ Add form</button>}
      </div>
      <div className="pkm-forms">
        <button className="pkm-form-chip current" onClick={() => onOpen(entry.key)}>
          <SpeciesIcon species={entry.species} size={24} /> {data instanceof Map ? String(map(data.get("pokedex")).get("form_name") ?? entry.name) : entry.name}
          <span className="muted">form 0</span>
        </button>
        {forms.map((f) => (
          <button key={f.key} className="pkm-form-chip" onClick={() => onOpen(f.key)}>
            <FormIcon entry={f} size={24} /> {f.name.slice(f.name.indexOf(":") + 2)}
            <span className="muted">form {f.form}{isOriginalForm(info?.original ?? {}, f.folder, f.form) ? "" : " · added"}</span>
          </button>
        ))}
      </div>
      {adding && (
        <div className="pkm-add-form">
          <div className="pkm-card-head">
            <h4>Add form {count}</h4>
            <span className="spacer" />
            <button onClick={() => setAdding(false)}>Cancel</button>
            <button className="primary" disabled={busy || !plan || plan.startsWith("Can't")} onClick={add}>{busy ? "Adding…" : "Add form"}</button>
          </div>
          <div className="pkm-rows">
            <Row label="Copy of" hint="Its data, Pokédex text, art and followers are the template's to start with.">
              <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
                <option value={0}>{entry.name} (the species)</option>
                {forms.map((f) => <option key={f.form} value={f.form}>{f.name.slice(f.name.indexOf(":") + 2)} (form {f.form})</option>)}
              </select>
            </Row>
            <Row label="Name" hint="The Pokédex's form name (pokedex.forms), on the Info page's tab and the forms list.">
              <input value={name} placeholder={`Form ${count}`} onChange={(e) => setName(e.target.value)} />
            </Row>
            <Row label="Data" hint={recordsForced ? "Always: this species' forms have records, and the game reads them all or none."
              : "On: a record of its own (form_N.json), a copy to change. Off: it is its species in data."}>
              <label className="pkm-check">
                <input type="checkbox" checked={record || recordsForced} disabled={recordsForced} onChange={(e) => setRecord(e.target.checked)} />
                Own stats, types, abilities and moves
              </label>
            </Row>
          </div>
          <p className="muted pkm-note">The form gets a copy of its template's battle sprite, palettes and icon (form_{count}/), its
            followers, and a place in the Pokédex's form list and the Wonder Trade; saves remap their Pokédex marks on load.</p>
          {plan && <p className={`pkm-note${plan.startsWith("Can't") ? " pkm-error" : ""}`}>{plan}</p>}
        </div>
      )}
    </section>
  );
}

export function summarize(paths: string[]): string {
  const groups = new Map<string, number>();
  for (const p of paths) {
    const parts = p.split("/");
    const key = p.startsWith("res/pokemon/") && parts.length > 4 ? parts.slice(0, 4).join("/") + "/"
      : p.startsWith("res/field/actors/followers/") ? parts.slice(0, 5).join("/") + "/" : p;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups].map(([k, n]) => (n > 1 ? `${k} (${n})` : k)).join(", ");
}

/** A form's own page. */
/** The evolutions a form takes, from its species' list as it is now (unsaved edits too), read only: what each makes
 * of it (the form number is kept: the next species' form of that number, or its normal form where it has none), or
 * why it can't evolve; they are edited on the species' page. */
function FormEvolutions({ entry, evolutions, noEvolution, speciesName, formName, list, onOpen }: {
  entry: Listed; evolutions: Evolution[]; noEvolution: number[]; speciesName: string; formName: string; list: Listed[];
  onOpen(species: string): void;
}) {
  const takes = formEvolutions({ evolutions, noEvolution }, entry.form);
  const edit = <button className="link" onClick={() => onOpen(entry.species)}>Edit {speciesName}'s evolutions</button>;
  if (noEvolution.includes(entry.form)) {
    return <p className="muted pkm-note pkm-form-evo-note">It never evolves (Can't evolve), and Eviolite doesn't boost it.</p>;
  }
  if (!takes.length) {
    return (
      <p className="pkm-note pkm-form-evo-note"><strong>It can't evolve:</strong> {evolutions.length
        ? `none of ${speciesName}'s evolutions is for ${formName} (each has another Only form)`
        : `${speciesName} has no evolutions`}, so Eviolite doesn't boost it. {edit}</p>
    );
  }
  return (
    <div className="pkm-form-evos">
      {takes.map((e, i) => {
        const target = list.find((l) => l.species === e.species && l.form === 0);
        const targetForm = list.find((l) => l.species === e.species && l.form === entry.form);
        return (
          <div key={i} className="pkm-form-evo">
            <SpeciesIcon species={e.species} size={24} />
            <span>{evolutionText(e)}{e.form !== undefined ? ` (${formName} only)` : ""} → <strong>{targetForm ? targetForm.name : target?.name ?? e.species}</strong>
              {!targetForm && <span className="muted"> (no {formName} form yet: it becomes the normal form, keeping form number {entry.form})</span>}</span>
          </div>
        );
      })}
      {edit}
    </div>
  );
}

export function FormPage({ entry, list: listed, info, constants, sprite, record, onChanged, onOpen }: {
  entry: Listed; list: Listed[]; info: PokemonFormsInfo | null; constants: Constants;
  /** Opens a species' page. */
  onOpen(species: string): void;
  /** The species page's sprite viewer, for this form's art folder. */
  sprite(folder: string, epoch: number): JSX.Element;
  /** The data sections of the form's record (stats, abilities, evolutions, learnset). */
  record(path: string): JSX.Element;
  onChanged(select?: string): void;
}) {
  const { data } = useHeld(entry.speciesPath);
  const { docs } = useDocuments();
  const [hasArt, setHasArt] = useState<boolean | null>(null);
  const [epoch, setEpoch] = useState(0);
  const artFolder = `${entry.folder}/form_${entry.form}`;
  useEffect(() => {
    let live = true;
    api.asset(`res/pokemon/${artFolder}/front_single.png`).then(() => live && setHasArt(true), () => live && setHasArt(false));
    return () => { live = false; };
  }, [artFolder, epoch]);
  const original = isOriginalForm(info?.original ?? {}, entry.folder, entry.form);
  const originalRecords = info?.originalRecords.includes(entry.folder) ?? false;
  const last = entry.form === entry.count - 1;
  if (!(data instanceof Map)) return <p className="muted pkm-empty">Reading…</p>;
  const fields = map(data.get("forms"));
  const noEvolution = list(fields.get("no_evolution")).map(Number);
  const pokedex = map(data.get("pokedex"));
  const formName = String(map(list(pokedex.get("forms"))[entry.form - 1]).get("name") ?? `Form ${entry.form}`);
  const speciesName = String(data.get("name") ?? entry.folder);
  const evolutions: Evolution[] = list(data.get("evolutions")).map(map).map((e) => ({
    method: String(e.get("method") ?? ""), param: e.get("param"), species: String(e.get("species") ?? ""),
    ...(typeof e.get("form") === "number" ? { form: Number(e.get("form")) } : {}),
  }));
  const recordDirty = entry.recordPath ? docs.get(entry.recordPath)?.dirty : false;

  const setRecord = async (on: boolean) => {
    if (!on) {
      const others = entry.count - 1 > 1 ? ` The species' other forms' records go too (form_1.json to form_${entry.count - 1}.json): the game reads a species' form records all or none.` : "";
      if (!confirm(`Remove ${speciesName}'s ${formName} record (${entry.recordPath}) and its forms.json row? It then has ${speciesName}'s stats, types, abilities and moves.${others}`)) return;
    }
    const result = await applyFormChange(() => api.pokemonFormRecord({ species: entry.species, form: entry.form, on }));
    if (result) onChanged(entry.key);
  };
  const remove = async () => {
    let plan: PokemonFormChange;
    try {
      plan = await api.removePokemonForm({ species: entry.species, form: entry.form, check: true });
    } catch (e) {
      alert((e as Error).message);
      return;
    }
    if (!confirm(`Remove ${speciesName}'s form ${entry.form}, "${formName}"? This deletes ${plan.removed.length} files or folders (${summarize(plan.removed)}) and changes ${summarize(plan.changed)}. Pokémon in this form in saves or data become form 0 or invalid.`)) return;
    const result = await applyFormChange(() => api.removePokemonForm({ species: entry.species, form: entry.form }));
    if (result) onChanged(entry.folder);
  };
  return (
    <div className="pkm-page">
      <div className="pkm-top">
        {sprite(hasArt ? artFolder : entry.folder, epoch)}
        <div>
          <h2><span className="muted">#{entry.number}</span> {speciesName}: {formName}</h2>
          <p className="muted pkm-note">res/pokemon/{entry.folder}/data.json, form {entry.form}{entry.recordPath ? ` · ${entry.recordPath}` : ""}
            {hasArt ? ` · art in form_${entry.form}/` : ""}</p>
          <MirrorToggle entry={entry} speciesName={speciesName} onChanged={onChanged} />
        </div>
      </div>
      <section className="pkm-card">
        <div className="pkm-card-head">
          <h3>Form {entry.form} <span className="muted">of {entry.count} · {original ? "the original game's" : "added by Paper White 2"}
            {hasArt ? "" : ` · drawn as ${speciesName}`}</span></h3>
          <span className="spacer" />
          {!original && (
            <button className="danger" disabled={!last} onClick={remove}
              title={last ? "Undo everything Add form did for this form" : `Remove form ${entry.count - 1} first: only the last form can go`}>Remove form</button>
          )}
        </div>
        <div className="pkm-rows">
          <Row label="Data" hint={originalRecords ? "The original game gives this species' forms records of their own." : entry.recordPath
            ? `Its record is ${entry.recordPath}, edited below.${entry.count > 2 ? " Off removes every form record of the species: the game reads them all or none." : ""}`
            : `Off: it is ${speciesName} in data (its stats, types, abilities, moves and evolutions).`}>
            <label className="pkm-check">
              <input type="checkbox" checked={!!entry.recordPath} disabled={originalRecords || recordDirty} onChange={(e) => setRecord(e.target.checked)} />
              Own stats, types, abilities and moves
            </label>
          </Row>
          <Row label="Evolution" hint={`Can't evolve is forms.no_evolution: it never evolves, whatever ${speciesName}'s evolutions say, by level, item, trade or Link Cord. Below it, the evolutions of ${speciesName}'s that this form takes (Only form Any or ${formName}).`}>
            <div>
              <label className="pkm-check">
                <input type="checkbox" checked={noEvolution.includes(entry.form)} onChange={(e) => {
                  const next = e.target.checked ? [...noEvolution, entry.form].sort((a, b) => a - b) : noEvolution.filter((f) => f !== entry.form);
                  documents.edit(entry.speciesPath, ["forms", "no_evolution"], next.length ? next : undefined);
                }} />
                Can't evolve
              </label>
              <FormEvolutions entry={entry} evolutions={evolutions} noEvolution={noEvolution} speciesName={speciesName}
                formName={formName} list={listed} onOpen={onOpen} />
            </div>
          </Row>
          <WonderTradeRow entry={entry} original={info?.original ?? {}} />
        </div>
      </section>
      <section className="pkm-card">
        <h3>Pokédex</h3>
        <DocForm path={entry.speciesPath} at={["pokedex", "forms", entry.form - 1]} constants={constants} hideDescription flat />
      </section>
      {hasArt && <FormArt entry={entry} speciesName={speciesName} onWritten={() => { setEpoch((n) => n + 1); onChanged(entry.key); }} epoch={epoch} />}
      <FollowerSpritesCard species={entry.species} form={entry.form} name={`${speciesName} (${formName})`} />
      {entry.recordPath ? record(entry.recordPath) : (
        <section className="pkm-card"><p className="muted">This form has no record of its own: its stats, types, abilities, moves and evolutions
          are {speciesName}'s. Turn on "Own stats, types, abilities and moves" to give it a copy to change.</p></section>
      )}
    </div>
  );
}

function bytesEqual(a: ArrayBuffer, b: ArrayBuffer) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  return x.every((v, i) => v === y[i]);
}

/** A form's art: its battle sprite (exported and imported on its rig, BattleSpriteArt), and the icon and stills it can
 * import as PNGs. */
function FormArt({ entry, speciesName, onWritten, epoch }: { entry: Listed; speciesName: string; onWritten(): void; epoch: number }) {
  const [copy, setCopy] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const sheet = (folder: string, side: string) => api.asset(`res/pokemon/${folder}/${side}.png`);
    Promise.all(["front", "back"].flatMap((side) => [sheet(`${entry.folder}/form_${entry.form}`, side), sheet(entry.folder, side)]))
      .then(([a, b, c, d]) => live && setCopy(bytesEqual(a, b) && bytesEqual(c, d)), () => live && setCopy(null));
    return () => { live = false; };
  }, [entry.folder, entry.form, epoch]);
  return (
    <>
      <BattleSpriteArt species={entry.species} form={entry.form} folder={`${entry.folder}/form_${entry.form}`} speciesName={speciesName}
        onWritten={onWritten} />
      <section className="pkm-card">
        <h3>Art</h3>
        <p className="pkm-note"><b>Battle sprite:</b> {copy ? `a copy of ${speciesName}'s (its sheets are ${speciesName}'s); export and import its art above`
          : copy === false ? `its own (form_${entry.form}/'s sheets differ from ${speciesName}'s), on ${speciesName}'s rig` : "…"}.
          <span className="muted"> The rig (its parts, poses and animations) is edited in the rig editor, later; colours also on the Palettes and Shinies pages.</span></p>
        <div className="pkm-art-grid">
          <ArtImport entry={entry} kind="icon" label="Icon" hint="32×64, its two frames; drawn in one of the icon palettes' banks, chosen from its colors" onWritten={onWritten} epoch={epoch} />
          <ArtImport entry={entry} kind="front" label="Front still" hint="96×96 front_single.png, in the form's normal.pal colors" onWritten={onWritten} epoch={epoch} />
          <ArtImport entry={entry} kind="back" label="Back still" hint="96×96 back_single.png, in the form's normal.pal colors" onWritten={onWritten} epoch={epoch} />
        </div>
      </section>
    </>
  );
}

/** A PNG imported as a form's (or, form 0, an added species') icon or still: checked and previewed, then applied. */
export function ArtImport({ entry, kind, label, hint, onWritten, epoch }: {
  entry: Pick<Listed, "folder" | "form" | "species">; kind: "icon" | "front" | "back"; label: string; hint: string; onWritten(): void; epoch: number;
}) {
  const [chosen, setChosen] = useState<{ name: string; base64: string } | null>(null);
  const [result, setResult] = useState<PokemonFormChange | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const file = `res/pokemon/${entry.folder}/${entry.form ? `form_${entry.form}/` : ""}${kind === "icon" ? "icon.png" : `${kind}_single.png`}`;
  const current = useMemo(() => `${api.assetUrl(file)}&v=${epoch}`, [file, epoch]);
  const choose = async (f: File) => {
    const buffer = new Uint8Array(await f.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
    const base64 = btoa(binary);
    setChosen({ name: f.name, base64 });
    setResult(null);
    setMessage(null);
    try {
      setResult(await api.pokemonFormArt({ species: entry.species, form: entry.form, kind, data: base64 }));
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const apply = async () => {
    if (!chosen) return;
    try {
      await api.pokemonFormArt({ species: entry.species, form: entry.form, kind, data: chosen.base64, write: true });
      setMessage(`Wrote ${file}. Build to see it in the game.`);
      setChosen(null);
      setResult(null);
      onWritten();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <div className="pkm-art">
      <h4>{label}</h4>
      <div className="pkm-art-images">
        <img className="pkm-pixel" src={current} alt={label} />
        {result?.preview && <><span className="muted">→</span><img className="pkm-pixel" src={`data:image/png;base64,${result.preview}`} alt="Preview" /></>}
      </div>
      <p className="muted pkm-note">{hint}</p>
      <input type="file" accept=".png" onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); e.target.value = ""; }} />
      {result && <p className="pkm-note">{result.message}{chosen ? ` (${chosen.name})` : ""}</p>}
      {message && <p className={`pkm-note${message.startsWith("Wrote") ? "" : " pkm-error"}`}>{message}</p>}
      {result && <button className="primary" onClick={apply}>Apply</button>}
    </div>
  );
}

