// A species' or form's Follower card in the Pokémon Editor: its follower rows (field actors of their own under
// res/field/actors/followers/, docs/paperwhite2/following-pokemon.md), the walking sprite each shows (its "sprite", an
// object code with a sprite.png of its own: a walking Pokémon's OBJ_CODE_POKEMON_ or another follower's), picked from
// every such sheet with a preview, normal and shiny, and a link to the Follower Editor. The male's row shows both sexes
// unless the female has a row of her own (only where her art differs, tools/paperwhite2/follower_sexes.py): "Add a
// female sprite" makes hers, "Remove the female sprite" falls back to the male's. Rows are edited through the document
// store (saved with the editor's Save, checked by the build's validator); Add form and Add Pokémon make them.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { SearchSelect, type Option } from "../../shell/SearchSelect.tsx";
import { navigate } from "../../navigation.ts";
import { useHeld } from "../followers/DocForm.tsx";
import { FIELD_ACTOR_SCHEMA, FOLLOWERS, type Variant } from "../followers/data.ts";
import { parsePal } from "../palettes/pal.ts";
import { paletteOf, type SheetPalette } from "../palettes/sheetColors.ts";
import { readIndexedPng, type IndexedImage } from "../palettes/png.ts";
import { Row } from "./FormPage.tsx";
import { WalkingSpriteImport } from "./WalkingSpriteImport.tsx";

const WALKING = "res/field/actors/pokemon";
const FEMALE = "GENDER_FEMALE";
const MALE = "GENDER_MALE";

/** An object code's folder: OBJ_CODE_POKEMON_PICHU_FORM_1 is res/field/actors/pokemon/pichu_form_1. */
export function codeFolder(code: string): string {
  const name = code.replace(/^OBJ_CODE_/, "").toLowerCase();
  if (name.startsWith("pokemon_")) return `${WALKING}/${name.slice("pokemon_".length)}`;
  if (name.startsWith("follower_")) return `${FOLLOWERS}/${name.slice("follower_".length)}`;
  return `res/field/actors/${name}`;
}

/** A follower row's own code: the folder followers/pichu_form_1 is OBJ_CODE_FOLLOWER_PICHU_FORM_1. */
const ownCode = (name: string) => `OBJ_CODE_FOLLOWER_${name.toUpperCase()}`;

let rowsPromise: Promise<Variant[]> | null = null;

/** Every follower row, read once (again after a follower's file changes on disk). */
function allRows(): Promise<Variant[]> {
  rowsPromise ??= api.data(FIELD_ACTOR_SCHEMA, ["follower", "sprite", "palette"]).then((files) => files.flatMap(({ path, data }) => {
    const follower = data.follower as Record<string, unknown> | undefined;
    if (!follower || !path.startsWith(`${FOLLOWERS}/`)) return [];
    return [{
      name: path.slice(FOLLOWERS.length + 1, path.lastIndexOf("/")), path, species: String(follower.species),
      form: Number(follower.form ?? 0), sex: String(follower.sex ?? ""), shiny: follower.shiny === true,
      placeholder: follower.placeholder === true, sprite: typeof data.sprite === "string" ? data.sprite : null,
      palette: paletteOf(data),
    }];
  }));
  return rowsPromise;
}

let sheetsPromise: Promise<Option[]> | null = null;

/** Every sheet a follower can show: the walking Pokémon's (OBJ_CODE_POKEMON_) and the followers' own. */
function allSheets(): Promise<Option[]> {
  sheetsPromise ??= Promise.all([api.list(`${WALKING}/*/sprite.png`), api.list(`${FOLLOWERS}/*/sprite.png`)]).then(([walking, own]) => {
    const option = (path: string, prefix: string, kind: string): Option => {
      const name = path.split("/").slice(-2)[0];
      const words = name.split("_").map((w) => (w[0]?.toUpperCase() ?? "") + w.slice(1)).join(" ");
      return { value: `OBJ_CODE_${prefix}${name.toUpperCase()}`, label: words, detail: kind };
    };
    return [...walking.map((p) => option(p, "POKEMON_", "walking sprite")), ...own.map((p) => option(p, "FOLLOWER_", "a follower's own sheet"))]
      .sort((a, b) => a.label.localeCompare(b.label) || a.detail!.localeCompare(b.detail!));
  });
  return sheetsPromise;
}

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, make: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as Promise<T>;
}

/** A code's sheet (sprite.png) and its own "palette", or null when it has none of its own. */
function sheetOf(code: string) {
  const folder = codeFolder(code);
  return cached(`sheet ${code}`, () => Promise.all([api.asset(`${folder}/sprite.png`).then(readIndexedPng), api.file(`${folder}/data.json`)])
    .then(([image, data]) => ({ image, palette: paletteOf(JSON.parse(data.text)) }), () => null));
}

/** A species' and form's battle group, as overworld_palettes.group_name finds it: its form_<n> where it has one. */
function groupOf(species: string, form: number): Promise<string> {
  const name = species.replace(/^SPECIES_/, "").toLowerCase();
  if (!form) return Promise.resolve(name);
  return cached(`group ${name} ${form}`, () => api.list(`res/pokemon/${name}/form_${form}/normal.pal`)
    .then((found) => (found.length ? `${name}/form_${form}` : name), () => name));
}

function readPal(path: string): Promise<number[][]> {
  return cached(`pal ${path}`, () => api.file(path).then((f) => parsePal(f.text) as number[][]));
}

/** A row's colours on a sheet, normal or shiny, as the build gives them (overworld_palettes.row_palettes): the row's
 * battle group's normal.pal or shiny.pal (through its "map" on another group's sheet), or, where the row or the sheet
 * opts out, the sheet's own sprite.pal; null for the shiny of an opt-out, which has no shiny colours of its own. */
async function rowColors(sheet: { palette: SheetPalette | null }, folder: string, row: { species: string; form: number; palette: SheetPalette | null },
                         shiny: boolean): Promise<number[][] | null> {
  if (row.palette?.opt_out || !sheet.palette?.pokemon) return shiny ? null : readPal(`${folder}/sprite.pal`);
  const group = row.palette?.pokemon ?? await groupOf(row.species, row.form);
  const colors = await readPal(`res/pokemon/${group}/${shiny ? "shiny" : "normal"}.pal`);
  return row.palette?.map ? row.palette.map.map((i) => colors[i] ?? [0, 0, 0]) : colors;
}

/** A sheet's frames facing down and left (then right, its own frames or the left ones mirrored), 2x, in the colours the
 * row shows it with: normal, or with shiny its battle shiny palette through the same indices. */
export function SheetPreview({ code, row, shiny = false }: { code: string; row: { species: string; form: number; palette: SheetPalette | null }; shiny?: boolean }) {
  const [sheet, setSheet] = useState<{ image: IndexedImage; colors: number[][] | null } | null | undefined>(undefined);
  const paletteKey = JSON.stringify(row.palette);
  useEffect(() => {
    let live = true;
    setSheet(undefined);
    sheetOf(code).then(async (s) => {
      if (!s) return live && setSheet(null);
      const colors = await rowColors(s, codeFolder(code), row, shiny).catch(() => null);
      if (live) setSheet({ image: s.image, colors });
    });
    return () => { live = false; };
  }, [code, row.species, row.form, paletteKey, shiny]);
  if (sheet === undefined) return <span className="muted pkm-hint">Reading…</span>;
  if (sheet === null) return <span className="pkm-error pkm-hint">{code} has no sheet of its own</span>;
  const { image, colors } = sheet;
  if (!colors) {
    return <span className="muted pkm-hint pkm-follower-noshiny">No shiny colours: this sheet keeps its own (it opts out of the battle palette), so a shiny shows these too</span>;
  }
  const size = Math.min(image.width, image.height);
  const count = Math.floor(image.width / size);
  // Up, up step, down, down step, left, left step and, with 8 frames, right, right step
  const shown = count >= 8 ? [2, 4, 6] : count >= 6 ? [2, 4, -4] : [0];
  const draw = (canvas: HTMLCanvasElement | null) => {
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const data = ctx.createImageData(size * shown.length, size);
    shown.forEach((frame, n) => {
      const mirror = frame < 0;
      const f = Math.abs(frame);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const v = image.pixels[y * image.width + f * size + x];
        const c = colors[v];
        if (!v || !c) continue;
        data.data.set([c[0], c[1], c[2], 255], (y * size * shown.length + n * size + (mirror ? size - 1 - x : x)) * 4);
      }
    });
    ctx.putImageData(data, 0, 0);
  };
  return (
    <span className="pkm-follower-sheet" title={`${count} frames of ${size}×${size}${shiny ? ", shiny" : ""}`}>
      <canvas ref={draw} width={size * shown.length} height={size} style={{ width: size * shown.length * 2, height: size * 2 }} />
      <span className="muted">{shiny ? "Shiny (battle shiny.pal)" : `${count} frames${count < 8 ? ", right mirrored" : ""}`}</span>
    </span>
  );
}

/** How many frames a code's sheet has. */
async function frameCount(code: string): Promise<number | null> {
  const sheet = await sheetOf(code);
  return sheet ? Math.floor(sheet.image.width / Math.min(sheet.image.width, sheet.image.height)) : null;
}

/** What a row is, by its sex and whether the female has a row of her own. */
function rowLabel(row: Variant, both: boolean): string {
  if (row.sex === FEMALE) return "Female";
  if (row.sex === MALE) return both ? "Both sexes" : "Male";
  return "Normal";
}

/** One follower row: what it is, the sheet it shows (its own, or the code its "sprite" names), normal and shiny, the
 * picker, and for a female row of her own, "Remove the female sprite". */
function FollowerRow({ row, sheets, label, onRemove }: { row: Variant; sheets: Option[]; label: string; onRemove?: () => void }) {
  const { data, dirty } = useHeld(row.path);
  if (!(data instanceof Map)) return <Row label={label}><span className="muted">Reading {row.path}…</span></Row>;
  const sprite = typeof data.get("sprite") === "string" ? String(data.get("sprite")) : null;
  const follower = data.get("follower");
  const profile = follower instanceof Map ? String(follower.get("animation_profile") ?? "") : "";
  const code = sprite ?? ownCode(row.name);
  const choose = async (next: string) => {
    if (!next || next === sprite) return;
    documents.edit(row.path, ["sprite"], next);
    // The profile follows the sheet: 8 frames have their own right-facing ones, 6 mirror the left
    const frames = await frameCount(next);
    const wanted = frames === null ? null : frames >= 8 ? "asymmetric" : "mirrored";
    if (wanted && wanted !== profile) documents.edit(row.path, ["follower", "animation_profile"], wanted);
  };
  return (
    <Row label={label} hint={<>
      <code>{row.name}</code>{row.placeholder ? " · placeholder" : ""}{dirty ? " · unsaved" : ""}
      {sprite ? <> · shows <code>{sprite}</code></> : <> · its own sheet (<code>{row.name}/sprite.png</code>), which other rows can show too: pick one to share instead
        in the Follower Editor</>}
      {profile ? ` · ${profile}` : ""}
    </>}>
      <div className="pkm-follower-row">
        <span className="pkm-follower-pair">
          <SheetPreview code={code} row={row} />
          <SheetPreview code={code} row={row} shiny />
        </span>
        {sprite
          ? <SearchSelect value={sprite} options={sheets} onChange={(v) => void choose(v)} />
          : <span className="muted pkm-hint">Own sheet</span>}
        {onRemove && <button onClick={onRemove} title="The female's row and code removed: the male's sprite shows both sexes">Remove the female sprite</button>}
      </div>
    </Row>
  );
}

/** Whether a species can be female (its gender_ratio isn't male-only or genderless); true when it can't be read. */
function canBeFemale(species: string): Promise<boolean> {
  const name = species.replace(/^SPECIES_/, "").toLowerCase();
  return cached(`ratio ${name}`, () => api.file(`res/pokemon/${name}/data.json`)
    .then((f) => !/^GENDER_RATIO_(MALE_ONLY|GENDERLESS)$/.test(String(JSON.parse(f.text).gender_ratio ?? "")), () => true));
}

/** The follower rows of a species' form, with their sprites: on a Follower card. */
export function FollowerSprites({ species, form, name, epoch = 0, onRows }: {
  species: string; form: number; name?: string; epoch?: number; onRows?: (count: number) => void;
}) {
  const [rows, setRows] = useState<Variant[] | null>(null);
  const [sheets, setSheets] = useState<Option[]>([]);
  const [female, setFemale] = useState(false);
  const [reread, setReread] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const reset = () => { rowsPromise = null; sheetsPromise = null; cache.clear(); };
  useEffect(() => documents.onFiles((paths) => {
    if (paths.some((p) => p.startsWith(`${FOLLOWERS}/`) || p.startsWith(`${WALKING}/`))) {
      reset();
      setReread((n) => n + 1);
    }
  }), []);
  useEffect(() => {
    if (epoch) { rowsPromise = null; sheetsPromise = null; }
    let live = true;
    allRows().then((all) => {
      if (!live) return;
      const own = all.filter((r) => r.species === species && r.form === form)
        .sort((a, b) => Number(a.shiny) - Number(b.shiny) || Number(a.sex === FEMALE) - Number(b.sex === FEMALE));
      setRows(own);
      onRows?.(own.length);
    });
    allSheets().then((s) => live && setSheets(s));
    canBeFemale(species).then((f) => live && setFemale(f));
    return () => { live = false; };
  }, [species, form, epoch, reread]);
  if (!rows) return <p className="muted pkm-note">Reading the followers…</p>;
  if (!rows.length) return <p className="muted pkm-note">No follower rows: while it leads the party, the next party member follows (as for an Egg).</p>;
  const label = name ?? species.replace(/^SPECIES_/, "").toLowerCase();
  const male = rows.find((r) => r.sex === MALE && !r.shiny);
  const hasFemale = rows.some((r) => r.sex === FEMALE);
  const written = () => { reset(); setReread((n) => n + 1); };
  const removeFemale = async () => {
    setMessage(null);
    try {
      const plan = await api.followerRemoveFemale({ species, form });
      if (!plan.ok) { setMessage({ ok: false, text: plan.message }); return; }
      const unsaved = documents.dirtyPaths().filter((p) => plan.changed.includes(p));
      if (unsaved.length) { alert(`Save or revert your changes first (${unsaved.join(", ")}): this writes the files on disk.`); return; }
      if (!confirm(`${plan.message}.\n\nRemoves ${plan.changed.join(", ")}.`)) return;
      const done = await api.followerRemoveFemale({ species, form, write: true });
      setMessage({ ok: done.ok, text: done.ok ? `${done.message}. Build to see it in the game.` : done.message });
      written();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <>
      <WalkingSpriteImport species={species} form={form} name={label}
        rows={rows.map((r) => ({ name: r.name, sprite: r.sprite }))} onWritten={written} />
      {male && !hasFemale && female && (
        <WalkingSpriteImport species={species} form={form} name={label} female
          rows={[{ name: male.name, sprite: male.sprite }]} onWritten={written} />
      )}
      {message && <p className={`pkm-note${message.ok ? "" : " pkm-error"}`}>{message.text}</p>}
      <div className="pkm-rows">
        {rows.map((row) => (
          <FollowerRow key={row.path} row={row} sheets={sheets} label={rowLabel(row, !hasFemale && female)}
            onRemove={row.sex === FEMALE && male ? () => void removeFemale() : undefined} />
        ))}
      </div>
    </>
  );
}

/** The Follower card of an original species' or a form's page. */
export function FollowerSpritesCard({ species, form, name }: { species: string; form: number; name: string }) {
  // (the rows' count comes from the list below, which reads them again after Add or Remove the female sprite)
  const [count, setCount] = useState<number | null>(null);
  const { docs } = useDocuments();
  useEffect(() => setCount(null), [species, form]);
  const unsaved = useMemo(() => [...docs.values()].filter((d) => d.dirty && d.path.startsWith(`${FOLLOWERS}/`)).length, [docs]);
  return (
    <section className="pkm-card">
      <div className="pkm-card-head">
        <h3>Follower <span className="muted">{count === null ? "" : count ? `${count} row${count === 1 ? "" : "s"}` : "none"}{unsaved ? ` · ${unsaved} unsaved` : ""}</span></h3>
        <span className="spacer" />
        {!!count && <button onClick={() => navigate("followers", { species, ...(form ? { form } : {}) })}
          title="Its rows' placement, gaps and dialogue">Open in the Follower Editor</button>}
      </div>
      <p className="muted pkm-note">The overworld sprite that follows the player while {name} leads (<code>{FOLLOWERS}/</code>), showing a walking
        sprite: the male's row shows both sexes unless the female has a row of her own, and a shiny shows the same sheet in its battle
        shiny palette. Pick the sheet each row shows; Save writes it, and the next build uses it.
        {form ? " Add form gave this form copies of its template's rows." : ""}</p>
      <FollowerSprites species={species} form={form} name={name} onRows={setCount} />
    </section>
  );
}
