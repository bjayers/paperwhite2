// Requests to the editor's server, and its live events.

import { WRITE_HEADER, type BuildState, type DataFile, type Entry, type ScanMatch, type FileContent, type GitState, type ProjectInfo, type PushResult,
  type SaveRequest, type SaveResult, type ServerEvent } from "../shared/api.ts";
import { schemaPart, splitSchemaId, type Schema } from "../shared/schema.ts";
import type { Usage, UsageKind } from "../server/usage.ts";
import type { ArtReport, ItemIconCheck, ItemIcons, SpriteSheet, SpriteSheetCheck } from "../shared/api.ts";

/** Whether a request failed because what it asked for isn't there (the server's 404: a file deleted on disk). */
export function isNotFound(e: unknown): boolean {
  return (e as { status?: number } | null)?.status === 404;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { [WRITE_HEADER]: "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({ error: response.statusText }));
    throw Object.assign(new Error(problem.error ?? response.statusText), { status: response.status });
  }
  const type = response.headers.get("Content-Type") ?? "";
  return (type.includes("json") ? response.json() : response.text()) as Promise<T>;
}

const schemas = new Map<string, Promise<Schema>>();

/** A schema file with the definitions it names in other files brought in, as datajson.load_schema() reads one: a
 * $ref to "other.schema.json#/$defs/name" (relative to this file) becomes "#/$defs/name", and this file's $defs take
 * the other file's definitions that they don't have themselves. */
async function loadSchemaFile(path: string, seen = new Set<string>()): Promise<Schema> {
  seen.add(path);
  const schema = JSON.parse((await api.file(path)).text) as Schema;
  const folder = path.slice(0, path.lastIndexOf("/") + 1);
  const others = new Set<string>();
  const rewrite = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(rewrite);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const ref = record.$ref;
    if (typeof ref === "string" && !ref.startsWith("#") && ref.includes("#/$defs/")) {
      const [file, name] = ref.split("#/$defs/");
      others.add(normalize(folder + file));
      record.$ref = `#/$defs/${name}`;
    }
    Object.values(record).forEach(rewrite);
  };
  rewrite(schema);
  const defs = { ...schema.$defs };
  for (const other of others) {
    if (seen.has(other)) continue;
    const loaded = await loadSchemaFile(other, seen);
    for (const [name, def] of Object.entries(loaded.$defs ?? {})) if (!(name in defs)) defs[name] = def;
  }
  return { ...schema, $defs: defs };
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}

/** Faces of a GLB by primitive and triangle number, deleted or drawn with another texture (server/glb.ts). */
/** A row of pixels of a town map highlight: x, y (from the OBJ's origin) and length. */
export type TownMapRun = [number, number, number];
/** GET /api/town-map: the map's art as a data: URL, and each area animation's highlight by the red's shades. */
export interface TownMap {
  image: string;
  shapes: Record<string, { light: TownMapRun[]; mid: TownMapRun[]; dark: TownMapRun[] }>;
}
export interface GlbFaceSet { primitive: number; triangles: number[] }
export interface GlbFaceEdits { remove?: GlbFaceSet[]; retexture?: { faces: GlbFaceSet[]; image: string }[] }

/** What tools/paperwhite2/pokemon_form.py info says. */
export interface PokemonFormsInfo {
  /** Each species' number of forms in the original game, where it has more than one, by its folder. */
  original: Record<string, number>;
  /** The species whose forms have data records in the original game. */
  originalRecords: string[];
  /** The species whose forms the packers moved to the hack's sprite groups, with the offset they give the game. */
  moved: Record<string, number>;
  nextFreeGroup: number;
  formMax: number;
}

/** What a change of pokemon_form.py did, or with check would do. */
export interface PokemonFormChange {
  ok: boolean;
  check: boolean;
  message: string;
  changed: string[];
  removed: string[];
  form?: number;
  bank?: number;
  /** An RGBA PNG in base64. */
  preview?: string;
}

/** A species Paper White 2 added, as tools/paperwhite2/pokemon_species.py info lists it. */
export interface AddedSpecies {
  id: number;
  species: string;
  folder: string;
  name: string;
  /** False for "pokedex": false (never in the Pokédex). */
  pokedex: boolean;
  retired: boolean;
  /** The Pokédex's display number, null for "???". */
  number: number | null;
  artTemplate: string;
  /** The species whose cry its cry.wav is a copy of, or null for a cry of its own. */
  cryCopyOf: string | null;
  forms: number;
  /** Whether it is the last added species, the only one that can be removed. */
  last: boolean;
  /** Its own followers' folders under res/field/actors/followers/ (none: no follower in the game). */
  followers: string[];
}

/** GET /api/pokemon-species: the added species, the next ID and the rules of names and numbers. */
export interface PokemonSpeciesInfo {
  firstAdded: number;
  nextId: number;
  maxId: number;
  nameLength: number;
  numberMin: number;
  numberMax: number;
  numberNone: number;
  nationalLast: number;
  /** The display numbers in use, with the species' names. */
  numbers: Record<string, string>;
  species: AddedSpecies[];
  cryRate: number;
  cryMaxSamples: number;
}

/** Add Pokémon's (and reuse's) choices: from is a species' constant or "blank"; number null for "???". */
export interface NewSpecies {
  name: string;
  from: string;
  number?: number | null;
  pokedex?: boolean;
  wonderTrade?: boolean;
  /** Copies of the template's followers (default on; the blank template has none). */
  follower?: boolean;
  check?: boolean;
}

/** What a change of pokemon_species.py did, or with check would do; a cry's check gives its length and a preview. */
export interface PokemonSpeciesChange extends PokemonFormChange {
  species?: string;
  folder?: string;
  id?: number;
  /** How many followers it copied (add, reuse, follower). */
  followers?: number;
  seconds?: number;
  rate?: number;
  samples?: number;
  bytes?: number;
  limit?: number;
}

/** A side's animation in the battle sprite importer's preview: strips of frames (RGBA PNGs in base64), a frame every
 * `step` game frames, each `width` by `height` with the sprite's feet at `origin`. */
export interface BattleSpriteSide {
  width: number;
  height: number;
  origin: [number, number];
  frames: number;
  step: number;
  /** By sheet (front, front_female): the new art's strip, normal and shiny, and the current art's first frame. */
  sheets: Record<string, { normal: string; shiny: string; current: string }>;
}

/** What tools/paperwhite2/battle_sprite.py says of battle sprite art: check, or import with write. */
/** A battle sprite rig's check (server/python/rig_check.py): its errors (the build refuses it) and warnings, and the
 * sizes of the five files the build writes from it, in bytes (none while it has errors). */
export interface RigCheck {
  errors: string[];
  warnings: string[];
  sizes: { info: number; cells: number; animations: number; multi_cells: number; multi_animations: number;
    resident: number; animations_compressed: number } | null;
}

export interface BattleSpriteCheck {
  ok: boolean;
  check: boolean;
  message: string;
  folder?: string;
  given?: string[];
  errors: string[];
  warnings?: string[];
  notes?: string[];
  changed?: string[];
  preview?: {
    sides: Record<string, BattleSpriteSide>;
    stills: Record<string, { normal: string; shiny: string; changed: boolean }>;
    sheets: Record<string, { image: string; changed: boolean }>;
    palettes: { normal: string[]; shiny: string[] };
  };
}

export const api = {
  project: () => request<ProjectInfo>("GET", "/api/project"),
  entries: (schema: string) => request<Entry[]>("GET", `/api/entries?schema=${encodeURIComponent(schema)}`),
  search: (query: string) => request<Entry[]>("GET", `/api/search?q=${encodeURIComponent(query)}`),
  file: (path: string) => request<FileContent>("GET", `/api/file?path=${encodeURIComponent(path)}`),
  /** A schema, read once per session; it is a file under res/ like any other. */
  schema(path: string): Promise<Schema> {
    // A "#/$defs/name" fragment names one definition of the file
    const { file, fragment } = splitSchemaId(path);
    if (!schemas.has(path)) schemas.set(path, loadSchemaFile(file).then((schema) => schemaPart(schema, fragment)));
    return schemas.get(path)!;
  },
  forgetSchema: (path: string) => schemas.delete(path),
  /** Every file of a kind of data, parsed; keys limits each to those top-level keys. */
  data: (schema: string, keys?: string[]) =>
    request<DataFile[]>("GET", `/api/data?schema=${encodeURIComponent(schema)}${keys ? `&keys=${keys.join(",")}` : ""}`),
  /** Writes a map chunk's props (nodes bw2_prop_*) into its model.glb. */
  glbProps: (path: string, props: { id: number; translation: number[]; rotation: number[] }[]) =>
    request<{ ok: boolean }>("PUT", "/api/glb-props", { path, props }),
  /** Deletes or retextures faces of a map chunk's model.glb; written says its data.json now has the whole model written. */
  glbFaces: (path: string, edits: GlbFaceEdits, textureSet?: string) =>
    request<{ ok: boolean; written: boolean }>("PUT", "/api/glb-faces", { path, edits, textureSet }),
  /** Copies faces of one map chunk's model.glb into another's, moved by offset; the images the faces use, <set>/<png>,
   * and the pasted faces, by their new draw calls. */
  glbPaste: (target: string, source: string, faces: GlbFaceSet[] | "all", offset: [number, number, number], textureSet: string) =>
    request<{ ok: boolean; pngs: string[]; faces: GlbFaceSet[] }>("PUT", "/api/glb-paste", { target, source, faces, offset, textureSet }),
  /** Moves faces of a map chunk's model.glb by offset; the moved faces, by their new draw calls. */
  glbMove: (path: string, faces: GlbFaceSet[], offset: [number, number, number], textureSet: string) =>
    request<{ ok: boolean; faces: GlbFaceSet[] }>("PUT", "/api/glb-move", { path, faces, offset, textureSet }),
  /** Adds textures (<set>/<png>) of other map texture sets to sets, by their imports.json. */
  importGrass: (kind: string, sets: string[]) => request<{ added: string[]; donors: Record<string, string> }>("POST", "/api/grass-import", { kind, sets }),
  importTextures: (sets: string[], textures: string[]) => request<{ added: string[] }>("POST", "/api/texture-imports", { sets, textures }),
  /** Saves faces of a map chunk as an object of the library (tools/paperwhite2/map_objects.py). */
  saveMapObject: (b: { name: string; category?: string; chunk: string; faces: GlbFaceSet[]; anchor: number[]; size: number[] }) =>
    request<{ id: string; path: string }>("POST", "/api/map-objects/save", b),
  deleteMapObject: (id: string) => request<{ removed: boolean }>("DELETE", `/api/map-objects?id=${encodeURIComponent(id)}`),
  /** Starts a painted map of a chunk: every tile fill ("." keeps the chunk) at its collision's heights, or flat (tiles). */
  startPainting: (model: string, style: string, fill: string, flat?: number) =>
    request<{ path: string }>("POST", "/api/map-maker/start", { model, style, fill, flat }),
  /** Paints the whole chunk from its reading as it is now (a debug view; map_roundtrip.py paint). */
  mapCost: (model: string) => request<{ vertices: number; polygons: number; triangles: number }>("GET", `/api/map-cost?model=${encodeURIComponent(model)}`),
  paintFromReading: (model: string) => request<{ painting: { style: string; terrain: string[]; height: number[][]; grass: string[] } }>(
    "POST", "/api/map-maker/from-reading", { model }),
  /** Puts a painted chunk back as it was before painting, and removes its painting. */
  stopPainting: (model: string) => request<{ ok: boolean; output: string }>("POST", "/api/map-maker/stop", { model }),
  /** Generates a painted map's chunk from its project (tools/paperwhite2/map_maker.py). */
  generateMap: (model: string) => request<{ ok: boolean; output: string }>("POST", "/api/map-maker/generate", { model }),
  /** Puts a map chunk's model.glb back as it was (base64 bytes), and its data.json (text), for undo. */
  glbRaw: (path: string, data: string, meta?: string, files?: Record<string, string>) =>
    request<{ ok: boolean }>("PUT", "/api/glb-raw", { path, data, meta, files }),
  /** Puts a map chunk's files back as the original game (vanilla) or the last commit has them; keepCollision leaves its
   * collision as it is. */
  revertChunk: (model: string, to: "vanilla" | "commit", keepCollision = false) =>
    request<{ files: string[] }>("POST", "/api/map-chunk/revert", { model, to, keepCollision }),
  /** A chunk as the map reader reads it (tools/paperwhite2/map_reader.py), now or as the original game has it. */
  readChunk: <T>(model: string, style: string | null, original: boolean) =>
    request<T>("GET", `/api/map-reader?model=${encodeURIComponent(model)}${style ? `&style=${encodeURIComponent(style)}` : ""}${original ? "&rev=original" : ""}`),
  /** The game's unused zones, which a new map can take. */
  unusedZones: () => request<{ zone: string; file: string; parent: string | null; place: string | null }[]>("GET", "/api/new-map/unused"),
  /** Makes an unused zone a new map (tools/paperwhite2/new_map.py create). */
  createMap: (b: { zone: string; name: string; template: string; width: number; height: number; area?: string; mapType?: number;
    parent?: string; place?: string; copyProps?: boolean }) =>
    request<{ zone: string; matrix: string; file: string; models: string[] }>("POST", "/api/new-map/create", b),
  /** Makes an unused zone a route of the overworld in the cells given (tools/paperwhite2/new_map.py route). */
  createRoute: (b: { zone: string; name: string; template: string; cells: [number, number][]; filler?: string; area?: string;
    place?: string; copyProps?: boolean }) =>
    request<{ zone: string; file: string; models: string[]; fillers: [number, number][] }>("POST", "/api/new-map/route", b),
  /** The lines of the files under res/ that a glob names which match a regular expression. */
  scan: (glob: string, pattern: string, options: { ignoreCase?: boolean; limit?: number } = {}) =>
    request<ScanMatch[]>("GET", `/api/scan?glob=${encodeURIComponent(glob)}&pattern=${encodeURIComponent(pattern)}` +
      `${options.ignoreCase ? "&flags=i" : ""}${options.limit ? `&limit=${options.limit}` : ""}`),
  /** The paths of the files under res/ that a glob names, sorted. */
  list: (glob: string) => request<string[]>("GET", `/api/list?glob=${encodeURIComponent(glob)}`),
  /** An image under res/, as its file's bytes. */
  async asset(path: string): Promise<ArrayBuffer> {
    const response = await fetch(api.assetUrl(path));
    if (!response.ok) throw new Error(`${path}: ${response.statusText}`);
    return response.arrayBuffer();
  },
  /** The address of an art target's screen as an indexed PNG in its palette, to draw over. */
  artRenderUrl: (target: string, screen: string) =>
    `/api/art/render?target=${encodeURIComponent(target)}&screen=${encodeURIComponent(screen)}`,
  /** Converts art for some of a target's screens: the report and previews, and with write, the game's files replaced. */
  artConvert: (target: string, images: Record<string, string>, write: boolean) =>
    request<{ report: ArtReport; previews: Record<string, string> }>("POST", "/api/art/convert", { target, images, write }),
  /** The address of a 2D screen of res/ drawn as a PNG, from its character PNG, screen and palette. */
  screenUrl: (chars: string, screen: string, palette: string) =>
    `/api/screen?chars=${encodeURIComponent(chars)}&screen=${encodeURIComponent(screen)}&palette=${encodeURIComponent(palette)}`,
  /** The town map's art (with its route lines, circles and dots) and each area highlight's pixels by shade. */
  townMap: () => request<TownMap>("GET", "/api/town-map"),
  /** The address of an image under res/. */
  assetUrl: (path: string) => `/api/asset?path=${encodeURIComponent(path)}`,
  constants: () => request<Record<string, number>>("GET", "/api/constants"),
  /** The sprite sheets that build tools pack whole. */
  spriteSheets: () => request<SpriteSheet[]>("GET", "/api/sprite-sheets"),
  /** Checks a sheet by its tool: the PNG given (base64), or the one in res/ without data; with write, saves it. */
  spriteSheetCheck: (name: string, data?: string, write = false) =>
    request<SpriteSheetCheck>("POST", "/api/sprite-sheets/check", { name, data, write }),
  /** Every item's icon files and preview, the hack's items first. */
  itemIcons: () => request<ItemIcons>("GET", "/api/item-icons"),
  /** Checks a PNG (base64) as an item's icon; with write, saves its icon and palette over the item's files. */
  itemIconCheck: (item: string, data: string, write = false) =>
    request<ItemIconCheck>("POST", "/api/item-icons/check", { item, data, write }),
  /** The original game's form counts and the species whose forms have records there (tools/paperwhite2/pokemon_form.py). */
  pokemonForms: () => request<PokemonFormsInfo>("GET", "/api/pokemon-forms"),
  /** Adds a form to a species, copied from its form `from` (0 the species); check only says what it would change. */
  addPokemonForm: (b: { species: string; from: number; name?: string; record?: boolean; check?: boolean }) =>
    request<PokemonFormChange>("POST", "/api/pokemon-forms/add", b),
  /** Removes a species' last form, one the hack added. */
  removePokemonForm: (b: { species: string; form: number; check?: boolean }) =>
    request<PokemonFormChange>("POST", "/api/pokemon-forms/remove", b),
  /** Gives a form a data record of its own (on), or its species' forms none (off). */
  pokemonFormRecord: (b: { species: string; form: number; on: boolean; check?: boolean }) =>
    request<PokemonFormChange>("POST", "/api/pokemon-forms/record", b),
  /** Checks a PNG (base64) as a form's icon or still, with a preview; with write, writes it into the form's art. */
  pokemonFormArt: (b: { species: string; form: number; kind: "icon" | "icon_female" | "front" | "back"; data: string; write?: boolean }) =>
    request<PokemonFormChange>("POST", "/api/pokemon-forms/art", b),
  /** The species Paper White 2 added, the next ID and the display numbers in use (tools/paperwhite2/pokemon_species.py). */
  pokemonSpecies: () => request<PokemonSpeciesInfo>("GET", "/api/pokemon-species"),
  /** Adds a species from a template; check only says what it would write. */
  addPokemonSpecies: (b: NewSpecies) => request<PokemonSpeciesChange>("POST", "/api/pokemon-species/add", b),
  /** Makes a retired species a new one at its ID. */
  reusePokemonSpecies: (b: NewSpecies & { species: string }) => request<PokemonSpeciesChange>("POST", "/api/pokemon-species/reuse", b),
  /** Removes the last added species, undoing everything Add Pokémon wrote. */
  removePokemonSpecies: (b: { species: string; check?: boolean }) => request<PokemonSpeciesChange>("POST", "/api/pokemon-species/remove", b),
  /** Retires an added species (hidden, keeping its ID), or brings it back. */
  retirePokemonSpecies: (b: { species: string; retired: boolean; check?: boolean }) =>
    request<PokemonSpeciesChange>("POST", "/api/pokemon-species/retire", b),
  /** An added species' followers replaced by copies of from's, or (from null) removed. */
  pokemonSpeciesFollower: (b: { species: string; from: string | null; check?: boolean }) =>
    request<PokemonSpeciesChange>("POST", "/api/pokemon-species/follower", b),
  /** Sets an added species' display number (null: "???"). */
  pokemonSpeciesNumber: (b: { species: string; number: number | null; check?: boolean }) =>
    request<PokemonSpeciesChange>("POST", "/api/pokemon-species/number", b),
  /** Checks a WAV (base64) as a species' cry, with the result as the game plays it; with write, writes its cry.wav. */
  pokemonSpeciesCry: (b: { species: string; data: string; rate?: number; write?: boolean }) =>
    request<PokemonSpeciesChange>("POST", "/api/pokemon-species/cry", b),
  /** A battle sprite's art as a zip to edit (its sheets, stills, palettes, guides and README). */
  battleSpriteExportUrl: (species: string, form: number) =>
    `/api/battle-sprite/export?species=${encodeURIComponent(species)}&form=${form}`,
  /** Checks battle sprite art (files in base64; none for the current art's preview); with write, imports it. */
  battleSpriteCheck: (b: { species: string; form: number; files: { name: string; data: string }[]; stillsFromSheets?: boolean; write?: boolean }) =>
    request<BattleSpriteCheck>("POST", "/api/battle-sprite/check", b),
  /** A battle sprite rig's checks as the build runs them (mcss_rig.check) and the five files' sizes. */
  rigCheck: (text: string) => request<RigCheck>("POST", "/api/battle-sprite/rig-check", { text }),
  /** Converts a PNG or .cgb into a C-Gear picture and adds it; the tool's report. */
  cgearPictureImport: (name: string, file: string, data: string) =>
    request<{ message: string }>("POST", "/api/cgear-pictures/import", { name, file, data }),
  cgearPictureOrder: (pictures: string[]) => request<{ pictures: string[] }>("PUT", "/api/cgear-pictures/order", { pictures }),
  cgearPictureRemove: (name: string) =>
    request<{ pictures: string[] }>("DELETE", `/api/cgear-pictures?name=${encodeURIComponent(name)}`),
  /** Every flag or variable with its name, status, uses and documentation; again runs the usage tools again. */
  usage: (kind: UsageKind, again = false) => request<Usage>("GET", `/api/usage?kind=${kind}${again ? "&again=1" : ""}`),
  save: (save: SaveRequest) => request<SaveResult>("PUT", "/api/file", save),
  /** Removes a species' encounter file (the only kind the server lets go). */
  /** How many zones the weather calendar holds, and where that limit was read. */
  weatherCalendarLimit: () => request<{ max: number; source: string }>("GET", "/api/weather-calendar/limit"),
  removeFile: (path: string) => request<{ removed: boolean }>("DELETE", `/api/file?path=${encodeURIComponent(path)}`),
  build: () => request<BuildState>("GET", "/api/build"),
  startBuild: () => request<{ started: boolean }>("POST", "/api/build"),
  stopBuild: () => request("POST", "/api/build/stop"),
  git: () => request<GitState>("GET", "/api/git"),
  diff: (path: string) => request<string>("GET", `/api/git/diff?path=${encodeURIComponent(path)}`),
  /** A file under res/ at the last commit or the original game's data (w2-original). */
  fileAt: (rev: "HEAD" | "w2-original", path: string) => request<string>("GET", `/api/git/show?rev=${rev}&path=${encodeURIComponent(path)}`),
  /** Puts changed files back as the last commit has them; new files are removed. */
  discard: (paths: string[]) => request<{ discarded: number }>("POST", "/api/git/discard", { paths }),
  commit: (paths: string[], message: string) => request<{ commit: string }>("POST", "/api/git/commit", { paths, message }),
  /** Commits the files, merges origin/main in and pushes to main (Push to GitHub). */
  push: (paths: string[], message: string) => request<PushResult>("POST", "/api/git/push", { paths, message }),
};

export type ConnectionListener = (connected: boolean) => void;

/** The server's events; reconnects by itself when the server restarts. */
export function listen(onEvent: (event: ServerEvent) => void, onConnection: ConnectionListener): () => void {
  const source = new EventSource("/api/events");
  let started: number | null = null;
  source.onopen = () => onConnection(true);
  source.onerror = () => onConnection(false);
  source.onmessage = (message) => {
    const event = JSON.parse(message.data);
    if (event.type === "hello") {
      // A new server since the last connection: everything may have changed while it was down.
      if (started !== null && started !== event.started) location.reload();
      started = event.started;
      return;
    }
    onEvent(event as ServerEvent);
  };
  return () => source.close();
}
