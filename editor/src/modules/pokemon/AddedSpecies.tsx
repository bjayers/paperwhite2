// Whole new species in the Pokémon Editor (docs/paperwhite2/design/new-species.md): the Add Pokémon dialog (also the
// one that reuses a retired species' ID), an added species' card (its ID, display number, Retire, Reuse and Remove),
// its Follower card (its followers, copied from another species' or removed, and a link to the Follower Editor), the
// Cry card (play, a note while the cry is a copy of another species', and a WAV imported, checked and played as the
// game will), and an added species' icon and stills. Every change is tools/paperwhite2/pokemon_species.py's, through
// the server (/api/pokemon-species/*): it writes res/ and generated/species.txt itself, so the editor checks that
// nothing it may touch is unsaved, then reads the files it changed again (applyFormChange).

import { useEffect, useMemo, useState } from "react";
import { api, type AddedSpecies, type NewSpecies, type PokemonSpeciesChange, type PokemonSpeciesInfo } from "../../api.ts";
import type { Constants } from "../../../shared/schema.ts";
import { SearchSelect, type Option } from "../../shell/SearchSelect.tsx";
import { navigate } from "../../navigation.ts";
import { DocForm } from "../followers/DocForm.tsx";
import { applyFormChange, ArtImport, Row, summarize } from "./FormPage.tsx";
import type { Listed } from "./forms.ts";
import { FollowerSprites } from "./FollowerSprites.tsx";

const BLANK = "blank";

/** A file's bytes as base64. */
async function base64Of(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The display number field's text as the tool takes it: null for blank ("???"), NaN for what isn't a number. */
function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "???") return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
}

/** "Writes 13 files: …" for a dry run's report. */
function planText(r: PokemonSpeciesChange): string {
  const parts = [`${r.message}.`];
  if (r.removed.length) parts.push(`Deletes ${summarize(r.removed)}.`);
  if (r.changed.length) parts.push(`Writes ${r.changed.length} file${r.changed.length === 1 ? "" : "s"}: ${summarize(r.changed)}.`);
  return parts.join(" ");
}

/** Add Pokémon, or (with reuse) a retired species' ID made a new species. */
export function AddPokemonDialog({ list, info, reuse, onClose, onDone }: {
  list: Listed[]; info: PokemonSpeciesInfo | null; reuse?: AddedSpecies; onClose(): void; onDone(folder: string): void;
}) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState<string>(BLANK);
  const [numberText, setNumberText] = useState("");
  const [pokedex, setPokedex] = useState(true);
  const [wonderTrade, setWonderTrade] = useState(true);
  const [follower, setFollower] = useState(true);
  const [plan, setPlan] = useState<{ ok: boolean; text: string; followers?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const number = parseNumber(numberText);
  const templates = useMemo<Option[]>(() => [
    { value: BLANK, label: "Blank", detail: "a “?” sprite, plain stats, Bulbasaur's cry" },
    ...list.filter((l) => l.form === 0 && (l.inDex || l.added) && l.species !== reuse?.species)
      .map((l) => ({ value: l.species, label: l.name, detail: l.added ? `added, ID ${l.number}` : `#${l.number}` })),
  ], [list, reuse]);
  const body = (check: boolean): NewSpecies => ({ name: name.trim(), from, number: pokedex ? number : null, pokedex, wonderTrade,
    follower: from !== BLANK && follower, check });
  const templateName = templates.find((t) => t.value === from)?.label ?? from;

  useEffect(() => {
    if (!name.trim()) { setPlan(null); return; }
    if (Number.isNaN(number)) { setPlan({ ok: false, text: "The display number is a whole number, or blank for “???”." }); return; }
    let live = true;
    const timer = setTimeout(() => {
      const run = reuse ? api.reusePokemonSpecies({ ...body(true), species: reuse.species }) : api.addPokemonSpecies(body(true));
      run.then((r) => live && setPlan({ ok: true, text: planText(r), followers: r.followers }),
        (e: Error) => live && setPlan({ ok: false, text: `Can't: ${e.message}` }));
    }, 250);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, from, numberText, pokedex, wonderTrade, follower, reuse]);

  const apply = async () => {
    if (reuse && !confirm(`Make ID ${reuse.id}, ${reuse.name} (retired), into ${name.trim()}? Its folder, data and art are replaced. `
      + `Any ${reuse.name} already in a save, in the party or a box, becomes ${name.trim()}.`)) return;
    setBusy(true);
    const result = await applyFormChange(() => (reuse ? api.reusePokemonSpecies({ ...body(false), species: reuse.species })
      : api.addPokemonSpecies(body(false))));
    setBusy(false);
    if (result) onDone(result.folder ?? "");
  };
  const usedNumbers = Object.entries(info?.numbers ?? {});
  const taken = number !== null && !Number.isNaN(number) ? info?.numbers[String(number)] : undefined;
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="pkm-dialog" role="dialog" aria-label={reuse ? "Reuse a retired species" : "Add Pokémon"} onMouseDown={(e) => e.stopPropagation()}>
        <div className="pkm-card-head">
          <h3>{reuse ? `Reuse ID ${reuse.id} (${reuse.name}, retired)` : "Add Pokémon"}
            <span className="muted"> {reuse ? "" : `· ID ${info?.nextId ?? "…"}`}</span></h3>
          <span className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !plan?.ok} onClick={apply}>{busy ? "Writing…" : reuse ? "Reuse" : "Add Pokémon"}</button>
        </div>
        {reuse && <p className="pkm-note pkm-error">Any {reuse.name} already in a save becomes the new species: its Pokémon keep their ID.</p>}
        <h4>The species</h4>
        <div className="pkm-rows">
          <Row label="Name" hint={`Up to ${info?.nameLength ?? 10} characters, starting with a letter. Its constant and folder follow from it (Applin: SPECIES_APPLIN, res/pokemon/applin/).`}>
            <input autoFocus value={name} maxLength={info?.nameLength ?? 10} placeholder="Applin" onChange={(e) => setName(e.target.value)} />
          </Row>
          <Row label="Copy of" hint="Its stats, types, abilities, learnset and Pokédex text, and its battle sprite, rig, icon, footprint and cry as placeholders, until you import its own. Not its evolutions, forms or other languages.">
            <SearchSelect value={from} options={templates} onChange={setFrom} />
          </Row>
        </div>
        <h4>Where it appears</h4>
        <div className="pkm-rows">
          <Row label="Pokédex" hint={pokedex ? "Listed in the National Pokédex once seen (unseen added species stay hidden), by its display number."
            : "\"pokedex\": false: never in the Pokédex, its list, counts or the Wonder Trade, as the roguelike's creatures. Battles, boxes and the party take it as any Pokémon."}>
            <label className="pkm-check"><input type="checkbox" checked={pokedex} onChange={(e) => setPokedex(e.target.checked)} /> In the Pokédex</label>
          </Row>
          {pokedex && (
            <Row label="Display number" hint={taken ? <span className="pkm-error">No. {numberText.trim()} is {taken}'s.</span>
              : `Blank shows “???”. ${info?.numberMin ?? 650} to ${info?.numberMax ?? 9999}, but ${info?.numberNone ?? 999} (the game's “no number”); 4 digits from 1000.`
                + (usedNumbers.length ? ` In use: ${usedNumbers.map(([n, s]) => `${n} ${s}`).join(", ")}.` : "")}>
              <input inputMode="numeric" value={numberText} placeholder="???" onChange={(e) => setNumberText(e.target.value)} />
            </Row>
          )}
          <Row label="Wonder Trade" hint={pokedex ? "On: received at random, as every species not left out (services.json's excluded_species)." : "Never: it isn't in the Pokédex."}>
            <label className="pkm-check"><input type="checkbox" checked={pokedex && wonderTrade} disabled={!pokedex} onChange={(e) => setWonderTrade(e.target.checked)} /> In the Wonder Trade</label>
          </Row>
          <Row label="Follower" hint={from === BLANK ? "The blank template has no follower: the next party member follows while it leads, until you give it one (its page's Follower card)."
            : follower && plan?.ok && plan.followers === 0 ? <span className="pkm-error">{templateName} has no follower to copy: it gets none, and the next party member follows while it leads.</span>
            : follower ? `Copies of ${templateName}'s followers (each sex and shininess), showing its sprite until you draw the species' own in the Follower Editor.`
            : "None: while it leads, the next party member follows. You can give it one later (its page's Follower card)."}>
            <label className="pkm-check"><input type="checkbox" checked={from !== BLANK && follower} disabled={from === BLANK} onChange={(e) => setFollower(e.target.checked)} />
              {" "}Follower: a copy of {from === BLANK ? "the template" : templateName}'s</label>
          </Row>
        </div>
        <h4>Dry run</h4>
        <p className={`pkm-note${plan && !plan.ok ? " pkm-error" : ""}`}>{plan?.text ?? "Name the species to see what it will write."}</p>
        <p className="muted pkm-note">The build does the rest: its text lines, Pokédex rows and orders, sprite, icon and cry slots and the save's
          Pokédex bits all follow from these files. Encounters are separate (the Encounter Editor: the species' encounters file).</p>
      </div>
    </div>
  );
}

/** An added species' card: its ID and constant, the Pokédex number, Retire / Bring back, Reuse and Remove. */
export function AddedSpeciesCard({ entry, added, info, onChanged, onReuse }: {
  entry: Listed; added: AddedSpecies; info: PokemonSpeciesInfo | null; onChanged(select?: string): void; onReuse(): void;
}) {
  const [numberText, setNumberText] = useState(added.number === null ? "" : String(added.number));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setNumberText(added.number === null ? "" : String(added.number)), [added.number]);
  const number = parseNumber(numberText);
  const numberChanged = number !== added.number;

  const run = async (change: () => Promise<PokemonSpeciesChange>, select?: string) => {
    const result = await applyFormChange(change);
    if (result) { setMessage({ ok: true, text: result.message }); onChanged(select ?? entry.key); }
  };
  const setNumber = () => {
    if (Number.isNaN(number)) { setMessage({ ok: false, text: "A whole number, or blank for “???”." }); return; }
    void run(() => api.pokemonSpeciesNumber({ species: added.species, number }));
  };
  const retire = (retired: boolean) => {
    if (retired && !confirm(`Retire ${added.name}? It keeps ID ${added.id}, its data and art, so any ${added.name} in a save stays valid, `
      + "but leaves the Pokédex, the Wonder Trade and the encounter pickers. You can bring it back, or later reuse its ID for a new species.")) return;
    void run(() => api.retirePokemonSpecies({ species: added.species, retired }));
  };
  const remove = async () => {
    let plan: PokemonSpeciesChange;
    try {
      plan = await api.removePokemonSpecies({ species: added.species, check: true });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
      return;
    }
    const files = [plan.removed.length ? `deletes ${summarize(plan.removed)}` : "", plan.changed.length ? `writes ${summarize(plan.changed)}` : ""];
    if (!confirm(`Remove ${added.name} (ID ${added.id})? This ${files.filter(Boolean).join(" and ")}. `
      + `Any ${added.name} in a save would become an invalid species.`)) return;
    void run(() => api.removePokemonSpecies({ species: added.species }), "");
  };
  const status = added.retired ? "Retired: hidden from the Pokédex, the Wonder Trade and the encounter pickers, keeping its ID so saved Pokémon stay valid."
    : !added.pokedex ? "Not in the Pokédex (\"pokedex\": false): no Pokédex entry, list row or Wonder Trade, as the roguelike's creatures."
    : "In the National Pokédex after Genesect, by its display number, once seen.";
  return (
    <section className="pkm-card">
      <div className="pkm-card-head">
        <h3>Added species <span className="muted">ID {added.id} · {added.species}{added.retired ? " · retired" : ""}</span></h3>
        <span className="spacer" />
        {added.retired ? <>
          <button onClick={() => retire(false)} title="Back in the Pokédex and the Wonder Trade, as before">Bring back</button>
          <button onClick={onReuse} disabled={added.forms > 1} title={added.forms > 1 ? "Remove its forms first" : "Make this ID a new species, replacing its name, data and art"}>Reuse ID…</button>
        </> : <button onClick={() => retire(true)}>Retire</button>}
        <button className="danger" disabled={!added.last} onClick={remove}
          title={added.last ? "Undo everything Add Pokémon wrote for it" : "Only the last added species can be removed (removing another would renumber those after it): retire it instead"}>Remove</button>
      </div>
      <div className="pkm-rows">
        <Row label="Status">{status}</Row>
        {added.pokedex && (
          <Row label="Display number" hint={`Blank shows “???”. ${info?.numberMin ?? 650} to ${info?.numberMax ?? 9999}, but ${info?.numberNone ?? 999}; no two species share one.`}>
            <div className="pkm-inline">
              <input inputMode="numeric" value={numberText} placeholder="???" onChange={(e) => setNumberText(e.target.value)} />
              <button disabled={!numberChanged} onClick={setNumber}>Set</button>
            </div>
          </Row>
        )}
        <Row label="Art formats" hint="The packer writes its battle sprite and icon files in the formats of this original species' (art_template).">
          <span>{added.artTemplate.replace(/^SPECIES_/, "").toLowerCase().replace(/(^|_)(\w)/g, (_, s: string, c: string) => `${s ? " " : ""}${c.toUpperCase()}`)}</span>
        </Row>
      </div>
      {message && <p className={`pkm-note${message.ok ? "" : " pkm-error"}`}>{message.text}</p>}
    </section>
  );
}

/** An added species' Follower card: its followers (copies of another species' until its own are drawn), copied again
 * from any species that has followers, or removed; and a link to them in the Follower Editor. */
export function FollowerCard({ list, added, onChanged }: { list: Listed[]; added: AddedSpecies; onChanged(): void }) {
  const [from, setFrom] = useState<string>("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const options = useMemo<Option[]>(() => list.filter((l) => l.form === 0 && (l.inDex || l.added) && l.species !== added.species)
    .map((l) => ({ value: l.species, label: l.name, detail: l.added ? `added, ID ${l.number}` : `#${l.number}` })), [list, added.species]);
  const has = added.followers.length > 0;
  const change = async (source: string | null) => {
    let plan: PokemonSpeciesChange;
    try {
      plan = await api.pokemonSpeciesFollower({ species: added.species, from: source, check: true });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
      return;
    }
    if (has && !confirm(`${plan.message}? This deletes ${added.name}'s ${added.followers.length} follower${added.followers.length === 1 ? "" : "s"}`
      + " and any changes made to them in the Follower Editor.")) return;
    const result = await applyFormChange(() => api.pokemonSpeciesFollower({ species: added.species, from: source }));
    if (result) {
      setMessage({ ok: true, text: `${result.message}. Build to see it follow.` });
      onChanged();
    }
  };
  return (
    <section className="pkm-card">
      <div className="pkm-card-head">
        <h3>Follower <span className="muted">{has ? `${added.followers.length} variant${added.followers.length === 1 ? "" : "s"}` : "none"}</span></h3>
        <span className="spacer" />
        {has && <button onClick={() => navigate("followers", { species: added.species })} title="Its sprites, placement and dialogue">Open in the Follower Editor</button>}
        <button className="danger" disabled={!has} onClick={() => change(null)} title="No follower: while it leads, the next party member follows">Remove</button>
      </div>
      <div className="pkm-rows">
        <Row label="Followers" hint={has ? "res/field/actors/followers/: each sex and shininess its own, with OBJ_CODE_FOLLOWER_ codes after the others'."
          : "While it leads the party, the next party member follows (as for an Egg)."}>
          <span>{has ? added.followers.join(", ") : "None"}</span>
        </Row>
        <Row label="Copy from" hint={`Replaces ${has ? "its followers" : "none"} with copies of that species' (its sprite until you draw ${added.name}'s own).`}>
          <div className="pkm-inline">
            <SearchSelect value={from} options={options} onChange={setFrom} />
            <button disabled={!from} onClick={() => change(from)}>Copy</button>
          </div>
        </Row>
      </div>
      {has && <><h4>Walking sprites</h4><FollowerSprites species={added.species} form={0} /></>}
      {message && <p className={`pkm-note${message.ok ? "" : " pkm-error"}`}>{message.text}</p>}
    </section>
  );
}

/** The Cry card: the cry played as it is in res/, a note while it is a copy of another species', a WAV checked and
 * played as the game will play it, then written; and the cry's volume. */
export function CryCard({ entry, added, constants, onChanged }: {
  entry: Listed; added: AddedSpecies | null; constants: Constants; onChanged(): void;
}) {
  const [epoch, setEpoch] = useState(0);
  const [chosen, setChosen] = useState<{ name: string; base64: string } | null>(null);
  const [result, setResult] = useState<PokemonSpeciesChange | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const path = `res/pokemon/${entry.folder}/cry.wav`;
  const choose = async (file: File) => {
    const base64 = await base64Of(file);
    setChosen({ name: file.name, base64 });
    setResult(null);
    setMessage(null);
    try {
      setResult(await api.pokemonSpeciesCry({ species: entry.species, data: base64 }));
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };
  const apply = async () => {
    if (!chosen) return;
    try {
      await api.pokemonSpeciesCry({ species: entry.species, data: chosen.base64, write: true });
      setMessage({ ok: true, text: `Wrote ${path}. Build to hear it in the game.` });
      setChosen(null);
      setResult(null);
      setEpoch((n) => n + 1);
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <section className="pkm-card">
      <h3>Cry</h3>
      <div className="pkm-rows">
        <Row label="Cry" hint={added?.cryCopyOf ? undefined : "res/pokemon/" + entry.folder + "/cry.wav"}>
          <div>
            <audio controls preload="auto" src={`${api.assetUrl(path)}&v=${epoch}`} className="pkm-audio" />
            {added?.cryCopyOf && <p className="pkm-note pkm-copy">Cry: a copy of {added.cryCopyOf}'s, until you import one of its own.</p>}
          </div>
        </Row>
        <Row label="Import" hint="A WAV, mono or stereo (mixed down), 8 to 32 bits. Resampled to 13,379 Hz where its rate is outside 4,000–65,535 Hz or it is too long; at most about 1.76 s at 13,379 Hz (the game's buffer).">
          <div>
            <input type="file" accept=".wav,audio/wav" onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); e.target.value = ""; }} />
            {result && (
              <div className="pkm-cry-preview">
                <p className="pkm-note">{chosen?.name}: {result.message}</p>
                <audio controls preload="auto" src={`data:audio/wav;base64,${result.preview}`} className="pkm-audio" />
                <span className="muted pkm-note">As the game plays it (8-bit).</span>
                <div><button className="primary" onClick={apply}>Apply</button></div>
              </div>
            )}
            {message && <p className={`pkm-note${message.ok ? "" : " pkm-error"}`}>{message.text}</p>}
          </div>
        </Row>
        <Row label="Volume" hint="cry_volume, saved with Save.">
          <DocForm path={entry.speciesPath} at={["cry_volume"]} constants={constants} hideDescription />
        </Row>
      </div>
    </section>
  );
}

/** An added species' own icon and stills, imported as PNGs (pokemon_form.py's icon and still with form 0). */
export function AddedSpeciesArt({ entry, onWritten }: { entry: Listed; onWritten(): void }) {
  const [epoch, setEpoch] = useState(0);
  const written = () => { setEpoch((n) => n + 1); onWritten(); };
  return (
    <section className="pkm-card">
      <h3>Icon and stills</h3>
      <div className="pkm-art-grid">
        <ArtImport entry={entry} kind="icon" label="Icon" hint="32×64, its two frames; drawn in one of the icon palettes' banks, which the build takes from its colors" onWritten={written} epoch={epoch} />
        <ArtImport entry={entry} kind="front" label="Front still" hint="96×96 front_single.png, in its normal.pal colors" onWritten={written} epoch={epoch} />
        <ArtImport entry={entry} kind="back" label="Back still" hint="96×96 back_single.png, in its normal.pal colors" onWritten={written} epoch={epoch} />
      </div>
    </section>
  );
}
