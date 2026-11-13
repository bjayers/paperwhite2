// A species' or form's Follower card in the Pokémon Editor: its follower rows (each sex and shininess a field actor of
// its own under res/field/actors/followers/, docs/paperwhite2/following-pokemon.md), the walking sprite each shows (its
// "sprite", an object code with a sprite.png of its own: a walking Pokémon's OBJ_CODE_POKEMON_ or another follower's),
// picked from every such sheet with a preview, and a link to the Follower Editor. Rows are edited through the document
// store (saved with the editor's Save, checked by the build's validator); Add form and Add Pokémon make them.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { SearchSelect, type Option } from "../../shell/SearchSelect.tsx";
import { navigate } from "../../navigation.ts";
import { useHeld } from "../followers/DocForm.tsx";
import { FIELD_ACTOR_SCHEMA, FOLLOWERS, variantLabel, type Variant } from "../followers/data.ts";
import { parsePal } from "../palettes/pal.ts";
import { readIndexedPng, type IndexedImage } from "../palettes/png.ts";
import { Row } from "./FormPage.tsx";

const WALKING = "res/field/actors/pokemon";

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
  rowsPromise ??= api.data(FIELD_ACTOR_SCHEMA, ["follower", "sprite"]).then((files) => files.flatMap(({ path, data }) => {
    const follower = data.follower as Record<string, unknown> | undefined;
    if (!follower || !path.startsWith(`${FOLLOWERS}/`)) return [];
    return [{
      name: path.slice(FOLLOWERS.length + 1, path.lastIndexOf("/")), path, species: String(follower.species),
      form: Number(follower.form ?? 0), sex: String(follower.sex ?? ""), shiny: follower.shiny === true,
      placeholder: follower.placeholder === true, sprite: typeof data.sprite === "string" ? data.sprite : null,
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

const sheetCache = new Map<string, Promise<{ image: IndexedImage; colors: number[][] } | null>>();

/** A code's sheet and colours (sprite.png in its sprite.pal), or null when it has none of its own. */
function sheetOf(code: string) {
  if (!sheetCache.has(code)) {
    const folder = codeFolder(code);
    sheetCache.set(code, Promise.all([api.asset(`${folder}/sprite.png`).then(readIndexedPng), api.file(`${folder}/sprite.pal`)])
      .then(([image, pal]) => ({ image, colors: parsePal(pal.text) }), () => null));
  }
  return sheetCache.get(code)!;
}

/** A sheet's frames facing down and left (then right, its own frames or the left ones mirrored), 2x. */
export function SheetPreview({ code }: { code: string }) {
  const [sheet, setSheet] = useState<{ image: IndexedImage; colors: number[][] } | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setSheet(undefined);
    sheetOf(code).then((s) => live && setSheet(s));
    return () => { live = false; };
  }, [code]);
  if (sheet === undefined) return <span className="muted pkm-hint">Reading…</span>;
  if (sheet === null) return <span className="pkm-error pkm-hint">{code} has no sheet of its own</span>;
  const { image, colors } = sheet;
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
    <span className="pkm-follower-sheet" title={`${count} frames of ${size}×${size}`}>
      <canvas ref={draw} width={size * shown.length} height={size} style={{ width: size * shown.length * 2, height: size * 2 }} />
      <span className="muted">{count} frames{count < 8 ? ", right mirrored" : ""}</span>
    </span>
  );
}

/** How many frames a code's sheet has. */
async function frameCount(code: string): Promise<number | null> {
  const sheet = await sheetOf(code);
  return sheet ? Math.floor(sheet.image.width / Math.min(sheet.image.width, sheet.image.height)) : null;
}

/** One follower row: what it is, the sheet it shows (its own, or the code its "sprite" names) and the picker. */
function FollowerRow({ row, sheets }: { row: Variant; sheets: Option[] }) {
  const { data, dirty } = useHeld(row.path);
  if (!(data instanceof Map)) return <Row label={variantLabel(row)}><span className="muted">Reading {row.path}…</span></Row>;
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
  const label = `${variantLabel(row).replace(/^Form \d+(, )?/, "") || "Normal"}`;
  return (
    <Row label={label} hint={<>
      <code>{row.name}</code>{row.placeholder ? " · placeholder (a shiny with the normal colours for now)" : ""}{dirty ? " · unsaved" : ""}
      {sprite ? <> · shows <code>{sprite}</code></> : <> · its own sheet (<code>{row.name}/sprite.png</code>), which other rows can show too: pick one to share instead
        in the Follower Editor</>}
      {profile ? ` · ${profile}` : ""}
    </>}>
      <div className="pkm-follower-row">
        <SheetPreview code={code} />
        {sprite
          ? <SearchSelect value={sprite} options={sheets} onChange={(v) => void choose(v)} />
          : <span className="muted pkm-hint">Own sheet</span>}
      </div>
    </Row>
  );
}

/** The follower rows of a species' form, with their sprites: on a Follower card. */
export function FollowerSprites({ species, form, epoch = 0 }: { species: string; form: number; epoch?: number }) {
  const [rows, setRows] = useState<Variant[] | null>(null);
  const [sheets, setSheets] = useState<Option[]>([]);
  const [reread, setReread] = useState(0);
  useEffect(() => documents.onFiles((paths) => {
    if (paths.some((p) => p.startsWith(`${FOLLOWERS}/`) || p.startsWith(`${WALKING}/`))) {
      rowsPromise = null;
      sheetsPromise = null;
      sheetCache.clear();
      setReread((n) => n + 1);
    }
  }), []);
  useEffect(() => {
    if (epoch) { rowsPromise = null; sheetsPromise = null; }
    let live = true;
    allRows().then((all) => live && setRows(all.filter((r) => r.species === species && r.form === form)
      .sort((a, b) => Number(a.shiny) - Number(b.shiny) || Number(a.sex === "GENDER_FEMALE") - Number(b.sex === "GENDER_FEMALE"))));
    allSheets().then((s) => live && setSheets(s));
    return () => { live = false; };
  }, [species, form, epoch, reread]);
  if (!rows) return <p className="muted pkm-note">Reading the followers…</p>;
  if (!rows.length) return <p className="muted pkm-note">No follower rows: while it leads the party, the next party member follows (as for an Egg).</p>;
  return (
    <div className="pkm-rows">
      {rows.map((row) => <FollowerRow key={row.path} row={row} sheets={sheets} />)}
    </div>
  );
}

/** The Follower card of an original species' or a form's page. */
export function FollowerSpritesCard({ species, form, name }: { species: string; form: number; name: string }) {
  const [count, setCount] = useState<number | null>(null);
  const { docs } = useDocuments();
  useEffect(() => {
    let live = true;
    allRows().then((all) => live && setCount(all.filter((r) => r.species === species && r.form === form).length));
    return () => { live = false; };
  }, [species, form]);
  const unsaved = useMemo(() => [...docs.values()].filter((d) => d.dirty && d.path.startsWith(`${FOLLOWERS}/`)).length, [docs]);
  return (
    <section className="pkm-card">
      <div className="pkm-card-head">
        <h3>Follower <span className="muted">{count === null ? "" : count ? `${count} row${count === 1 ? "" : "s"}` : "none"}{unsaved ? ` · ${unsaved} unsaved` : ""}</span></h3>
        <span className="spacer" />
        {!!count && <button onClick={() => navigate("followers", { species, ...(form ? { form } : {}) })}
          title="Its rows' placement, gaps and dialogue">Open in the Follower Editor</button>}
      </div>
      <p className="muted pkm-note">The overworld sprite that follows the player while {name} leads: each sex and shininess is a row of its own
        (<code>{FOLLOWERS}/</code>), showing a walking sprite. Pick the sheet each row shows; Save writes it, and the next build uses it.
        {form ? " Add form gave this form copies of its template's rows." : ""}</p>
      <FollowerSprites species={species} form={form} />
    </section>
  );
}
