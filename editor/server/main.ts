// The editor's server: serves the page and an API over the checkout this folder sits in. It listens on this computer
// only. Start it with `npm start` in editor/ (or ./start.sh), then open the address it prints in Edge.

import { execFile } from "node:child_process";
import { createReadStream, existsSync, globSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileText, parseJson, setIn, JsonSyntaxError } from "../shared/json.ts";
import { splitSchemaId } from "../shared/schema.ts";
import { WRITE_HEADER, type DataFile, type ProjectInfo, type SaveRequest, type SaveResult, type ServerEvent } from "../shared/api.ts";
import { Builder } from "./build.ts";
import { narcMember } from "./narc.ts";
import { Git } from "./git.ts";
import { editGlbFaces, moveGlbFaces, pasteGlbFaces, setGlbProps, type FaceEdits, type FaceSet, type GlbProp } from "./glb.ts";
import { Project, versionOf } from "./project.ts";
import { Python, pythonFor } from "./python.ts";
import { loadSettings } from "./settings.ts";

// The checkout this folder is in; PAPERWHITE_ROOT points it at another, as the tests do with a scratch copy.
const ROOT = resolve(process.env.PAPERWHITE_ROOT ?? join(import.meta.dirname, "../.."));
const DIST = resolve(import.meta.dirname, "../dist");
const DEV = process.argv.includes("--dev");

const settings = loadSettings();
const started = Date.now();
const project = new Project(ROOT);
const python = new Python(ROOT);
const git = new Git(ROOT);
const clients = new Set<ServerResponse>();
const builder = new Builder(ROOT, (line) => send({ type: "build-line", line }), (state) => {
  send({ type: "build", state: { ...state, lines: [] } });
  if (!state.running) send({ type: "git" });
});

function send(event: ServerEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) client.write(data);
}

project.onChange((paths, typesChanged) => {
  send({ type: "files", paths });
  if (typesChanged) send({ type: "types" });
  send({ type: "git" });
});
project.watch();

// The constants come from generated/ and include/constants/; reread them when those change (checked by polling,
// as res/ is: see Project).
function constantsStamp(): string {
  const parts: string[] = [];
  for (const folder of ["generated", "include/constants"]) {
    const path = join(ROOT, folder);
    if (!existsSync(path)) continue;
    for (const name of readdirSync(path, { recursive: true }) as string[]) {
      const stat = statSync(join(path, name));
      if (stat.isFile()) parts.push(`${name}:${stat.mtimeMs}:${stat.size}`);
    }
  }
  return parts.sort().join("|");
}
let constantsSeen = constantsStamp();
setInterval(() => {
  const now = constantsStamp();
  if (now === constantsSeen) return;
  constantsSeen = now;
  python.invalidate();
  send({ type: "constants" });
}, 3000).unref();

// ---------------------------------------------------------------- Routes

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void> | void;

const routes: Record<string, Handler> = {
  "GET /api/project": (_req, res) => {
    const info: ProjectInfo = {
      name: "Paper White 2",
      root: ROOT,
      types: project.types(),
      otherFiles: project.otherCount(),
      settings: { buildCommand: settings.buildCommand, commitEnabled: settings.commitEnabled },
    };
    json(res, info);
  },
  "GET /api/entries": (_req, res, url) => json(res, project.entries(url.searchParams.get("schema") ?? "")),
  "GET /api/search": (_req, res, url) => json(res, project.search(url.searchParams.get("q") ?? "")),
  "GET /api/file": (_req, res, url) => {
    const path = project.checkPath(url.searchParams.get("path") ?? "");
    if (!path || !existsSync(project.abs(path))) return error(res, 404, "No such file under res/");
    json(res, project.read(path));
  },
  // Every file of a kind of data in one answer, optionally with only some top-level keys: for modules that read a
  // whole folder (the Encounter Editor reads every species). A file that isn't valid JSON is left out.
  "GET /api/data": (_req, res, url) => {
    const keys = url.searchParams.get("keys")?.split(",").filter(Boolean) ?? null;
    const files: DataFile[] = [];
    for (const { path } of project.entries(url.searchParams.get("schema") ?? "")) {
      let data: Record<string, unknown>;
      try {
        // Read directly: these files aren't open in a tab, so the poller needn't watch them
        data = JSON.parse(readFileSync(project.abs(path), "utf8"));
      } catch {
        continue;
      }
      if (keys) data = Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
      files.push({ path, data });
    }
    json(res, files);
  },
  // The lines of files under res/ or src/ matching a regular expression, for modules that read sources that aren't
  // JSON (the scripts, a table in C): ?glob=res/field/scripts/*.s&pattern=… gives each match's file, line and text.
  // It only reads.
  "GET /api/scan": (_req, res, url) => {
    const glob = url.searchParams.get("glob") ?? "";
    let pattern: RegExp;
    try {
      pattern = new RegExp(url.searchParams.get("pattern") ?? "");
    } catch (e) {
      return error(res, 400, (e as Error).message);
    }
    if (!/^(res|src|include)\//.test(glob) || glob.includes("..")) return error(res, 400, "Scan files under res/, src/ or include/ only");
    // ?flags=i matches without case
    if (url.searchParams.get("flags") === "i") pattern = new RegExp(pattern.source, "i");
    const limit = Number(url.searchParams.get("limit") ?? 0) || Infinity;
    const found: { path: string; line: number; text: string }[] = [];
    for (const path of globSync(glob, { cwd: ROOT })) {
      const lines = readFileSync(project.abs(path), "utf8").split("\n");
      lines.forEach((text, i) => {
        if (found.length < limit && pattern.test(text)) found.push({ path, line: i + 1, text });
      });
    }
    json(res, found);
  },
  // The paths of the files under res/ that a glob names (?glob=res/**/*.pal), sorted, for modules that browse files
  // that aren't data, such as the Palette Editor's palettes. It only reads.
  "GET /api/list": (_req, res, url) => {
    const glob = url.searchParams.get("glob") ?? "";
    if (!glob.startsWith("res/") || glob.includes("..")) return error(res, 400, "List files under res/ only");
    json(res, globSync(glob, { cwd: ROOT }).map((p) => p.split(sep).join("/")).sort());
  },
  // A member of the game's font archive (a/0/2/3, ARCID_FONT: the fonts 0 to 4 and their palettes 5 to 7), for the
  // text box preview. The archive isn't in res/: it is read from the user's own extracted ROM (extract/), or the
  // build's copy of it, and only shown, never written or committed.
  "GET /api/font": (_req, res, url) => {
    const member = Number(url.searchParams.get("member") ?? "0");
    if (!Number.isInteger(member) || member < 0 || member > 7) return error(res, 400, "A member from 0 to 7");
    const source = ["extract/w2_us/files/a/0/2/3", "build/w2_us/files/a/0/2/3"].map((p) => join(ROOT, p)).find(existsSync);
    if (!source) return error(res, 404, "The game's font isn't here: extract the ROM first (extract/w2_us)");
    const data = narcMember(readFileSync(source), member);
    if (!data) return error(res, 404, "No such member");
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "max-age=3600" });
    res.end(data);
  },
  // An image under res/, such as a Pokémon's icon, for modules to show.
  "GET /api/asset": (_req, res, url) => {
    const path = project.checkPath(url.searchParams.get("path") ?? "");
    if (!path || extname(path) !== ".png" || !existsSync(project.abs(path))) return error(res, 404, "No such image under res/");
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
    createReadStream(project.abs(path)).pipe(res);
  },
  // A 2D screen of res/graphics drawn as the DS would (server/python/screen.py): ?chars=…png&screen=…nscr&palette=…pal
  "GET /api/screen": (_req, res, url) => {
    const files = ["chars", "screen", "palette"].map((k) => project.checkPath(url.searchParams.get(k) ?? ""));
    if (files.some((f) => !f || !existsSync(project.abs(f)))) return error(res, 404, "No such graphics under res/");
    const image = python.screen(files[0]!, files[1]!, files[2]!);
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
    res.end(image);
  },
  // A screen of an art target (res/paperwhite2/art/targets.json) as an indexed PNG in its palette, to draw over
  "GET /api/art/render": async (_req, res, url) => {
    const [target, screen] = ["target", "screen"].map((k) => url.searchParams.get(k) ?? "");
    if (!/^[a-z0-9_]+$/.test(target) || !/^[a-z0-9_]+$/.test(screen)) return error(res, 400, "Name a target and a screen");
    const dir = mkdtempSync(join(tmpdir(), "paperwhite-art-"));
    try {
      const out = join(dir, "screen.png");
      const run = await python.art(["render", target, screen, out]);
      if (run.code !== 0) return error(res, 400, run.stderr.trim().split("\n").pop() ?? "Not rendered");
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
      res.end(readFileSync(out));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  // Art for some of a target's screens ({ target, images: { screen: base64 PNG }, write }): the converter's report
  // and each screen as the DS would show it; with write and no problems, the target's files are replaced
  "POST /api/art/convert": async (req, res) => {
    const body = (await readJson(req)) as { target: string; images: Record<string, string>; write?: boolean };
    if (!/^[a-z0-9_]+$/.test(body.target ?? "")) return error(res, 400, "Name a target");
    const dir = mkdtempSync(join(tmpdir(), "paperwhite-art-"));
    try {
      const args = ["convert", body.target];
      for (const [screen, data] of Object.entries(body.images ?? {})) {
        if (!/^[a-z0-9_]+$/.test(screen)) return error(res, 400, "Bad screen name");
        const path = join(dir, `${screen}.png`);
        writeFileSync(path, Buffer.from(data, "base64"));
        args.push(`${screen}=${path}`);
      }
      args.push("--preview", join(dir, "preview"));
      if (body.write) args.push("--write");
      const run = await python.art(args);
      let report: Record<string, unknown>;
      try {
        report = JSON.parse(run.stdout);
      } catch {
        return error(res, 400, run.stderr.trim().split("\n").pop() || "The converter failed");
      }
      const previews: Record<string, string> = {};
      const previewDir = join(dir, "preview");
      if (existsSync(previewDir)) for (const name of readdirSync(previewDir)) previews[name.replace(/\.png$/, "")] = readFileSync(join(previewDir, name)).toString("base64");
      json(res, { report, previews });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  "GET /api/constants": (_req, res) => json(res, python.constants()),
  "PUT /api/file": async (req, res) => {
    const body = (await readJson(req)) as SaveRequest;
    const path = project.checkPath(body.path);
    if (!path) return error(res, 400, "Only files under res/ can be saved");
    const exists = existsSync(project.abs(path));
    if (exists && body.baseVersion !== null) {
      const current = project.read(path);
      if (current.version !== body.baseVersion) return json(res, { ok: false, reason: "conflict", current } satisfies SaveResult);
    }
    if (path.endsWith(".json")) {
      try {
        parseJson(body.text);
      } catch (e) {
        const message = e instanceof JsonSyntaxError ? `Not valid JSON: ${e.message}` : String(e);
        return json(res, { ok: false, reason: "invalid", message } satisfies SaveResult);
      }
    }
    const schema = path.endsWith(".schema.json") ? null : project.schemaFor(path, body.text);
    const schemaFile = schema ? splitSchemaId(schema).file : null;
    if (schema && !existsSync(project.abs(schemaFile!)))
      return json(res, { ok: false, reason: "invalid", message: `Its schema ${schema} doesn't exist` } satisfies SaveResult);
    let invalid: string | null = null;
    try {
      // The build's own check runs on the new text before it replaces the file.
      await project.writeAtomic(path, body.text, async (temp) => {
        if (!schema) return;
        const { fragment } = splitSchemaId(schema);
        const checked = await python.validate(temp, project.abs(schemaFile!) + (fragment ? `#${fragment}` : ""));
        if (!checked.ok) {
          invalid = (checked.error ?? "Invalid").replace(temp, path).replace(project.rel(temp), path);
          throw new Error(invalid);
        }
      });
    } catch (e) {
      if (invalid) return json(res, { ok: false, reason: "invalid", message: invalid } satisfies SaveResult);
      return error(res, 500, (e as Error).message);
    }
    json(res, { ok: true, version: versionOf(body.text) } satisfies SaveResult);
  },
  // Writes a map chunk's props (the Overworld Editor's buildings) into its GLB's prop nodes, which the build packs
  "PUT /api/glb-props": async (req, res) => {
    const body = (await readJson(req)) as { path: string; props: GlbProp[] };
    const path = project.checkPath(body.path ?? "");
    if (!path || !/^res\/field\/maps\/models\/[a-z0-9_]+\/model\.glb$/.test(path) || !existsSync(project.abs(path)))
      return error(res, 400, "Name a map model's model.glb");
    const props = body.props ?? [];
    const finite = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number" && Number.isFinite(x));
    if (!props.every((p) => Number.isInteger(p.id) && p.id >= 0 && p.id <= 65535 && finite(p.translation, 3) && finite(p.rotation, 4)))
      return error(res, 400, "Each prop needs an ID from 0 to 65535, a translation and a rotation");
    try {
      await project.writeAtomic(path, setGlbProps(readFileSync(project.abs(path)), props));
    } catch (e) {
      return error(res, 500, (e as Error).message);
    }
    json(res, { ok: true });
  },
  // Removes a data file that a specialty editor no longer needs: only a species' encounter file (one taken out of
  // the wild), so nothing else can be removed from here
  "DELETE /api/file": (_req, res, url) => {
    const path = project.checkPath(url.searchParams.get("path") ?? "");
    if (!path || !/^res\/paperwhite2\/encounters\/species\/[a-z0-9_]+\.json$/.test(path)) return error(res, 403, "Not a file that can be removed");
    if (existsSync(project.abs(path))) rmSync(project.abs(path));
    json(res, { removed: true });
  },
  "PUT /api/glb-faces": async (req, res) => {
    // Faces deleted or retextured in a map model's GLB; where the draw calls change, its data.json gains "written" (and
    // the area's texture set where it had none), since only the whole-model writer can pack those
    const body = (await readJson(req)) as { path: string; edits: FaceEdits; textureSet?: string };
    const path = mapModelGlb(body.path);
    if (!path) return error(res, 400, "Name a map model's model.glb");
    const { glb, drawCallsChanged } = editGlbFaces(readFileSync(project.abs(path)), body.edits ?? {});
    let written = false;
    if (drawCallsChanged) {
      const dataPath = path.replace(/model\.glb$/, "data.json");
      let data = parseJson(readFileSync(project.abs(dataPath), "utf8"));
      const plain = data as Map<string, unknown>;
      if (plain.get("texture_set") === null) {
        if (!body.textureSet) return error(res, 400, "The model has no texture set: choose the zone's area first");
        data = setIn(data, ["texture_set"], body.textureSet);
      }
      if (plain.get("written") !== true) {
        data = setIn(data, ["written"], true);
        await project.writeAtomic(dataPath, fileText(data));
      } else if (plain.get("texture_set") === null) await project.writeAtomic(dataPath, fileText(data));
      written = true;
    }
    await project.writeAtomic(path, glb);
    json(res, { ok: true, written });
  },
  "PUT /api/glb-paste": async (req, res) => {
    // Faces of one map model's GLB copied into another's, moved by an offset; the target is then written whole
    const b = (await readJson(req)) as { target: string; source: string; faces: FaceSet[] | "all"; offset: [number, number, number]; textureSet: string };
    const target = mapModelGlb(b.target), source = mapModelGlb(b.source) ?? libraryObjectGlb(b.source);
    if (!target || !source || !(Array.isArray(b.faces) || b.faces === "all") || !Array.isArray(b.offset) || b.offset.length !== 3 || !b.offset.every(Number.isFinite)
        || !/^[a-z0-9_]+$/.test(b.textureSet ?? ""))
      return error(res, 400, "Name the two map models, the faces, the offset and the target's texture set");
    const { glb, pngs, faces } = pasteGlbFaces(readFileSync(project.abs(target)), readFileSync(project.abs(source)), b.faces, b.offset, b.textureSet);
    await markWritten(target, b.textureSet);
    await project.writeAtomic(target, glb);
    json(res, { ok: true, pngs, faces });
  },
  "POST /api/texture-imports": async (req, res) => {
    // Textures of one map texture set added to others (their imports.json, and a copy of the PNG beside theirs)
    const b = (await readJson(req)) as { sets: string[]; textures: string[] };
    const folder = /^[a-z0-9_]+$/;
    if (!Array.isArray(b.sets) || !b.sets.every((x) => folder.test(x)) || !Array.isArray(b.textures)
        || !b.textures.every((t) => /^[a-z0-9_]+\/[a-z0-9_.]+\.png$/i.test(t)))
      return error(res, 400, "Name the sets and the textures, as <set>/<png>");
    const result = await importTextures(b.sets, b.textures);
    if ("error" in result) return error(res, 400, result.error);
    json(res, { added: result.added });
  },
  "POST /api/grass-import": async (req, res) => {
    // A grass kind's textures added to the texture sets that lack them, each from a set of its season
    // (tools/paperwhite2/map_grass.py donors), so the kind can be painted in an area vanilla has none of it in
    const b = (await readJson(req)) as { kind: string; sets: string[] };
    if (!/^[A-Za-z]$/.test(b.kind ?? "") || !Array.isArray(b.sets) || !b.sets.every((x) => /^[a-z0-9_]+$/.test(x)))
      return error(res, 400, "Name the grass kind and the sets");
    const found = await runTool("tools/paperwhite2/map_grass.py", ["donors", b.kind, ...b.sets]);
    if (!found.ok) return error(res, 500, found.output || "Finding the textures failed");
    const donors = JSON.parse(found.output.trim().split("\n").pop() ?? "{}") as Record<string, string>;
    const kinds = (JSON.parse(readFileSync(project.abs("res/paperwhite2/map_grass/grass.json"), "utf8")) as { kinds: {
      key: string; blades?: { texture: string }[]; volume?: { top: string; side: string } }[] }).kinds;
    const kind = kinds.find((k) => k.key === b.kind);
    if (!kind) return error(res, 400, `No grass kind ${b.kind}`);
    const names = kind.blades ? kind.blades.map((x) => x.texture) : kind.volume ? [kind.volume.top, kind.volume.side] : [];
    const added: string[] = [];
    for (const [target, donor] of Object.entries(donors)) {
      const result = await importTextures([target], names.map((n) => `${donor}/${n}.png`));
      if ("error" in result) return error(res, 400, result.error);
      added.push(...result.added);
    }
    json(res, { added, donors });
  },
  "PUT /api/glb-move": async (req, res) => {
    // Faces of a map model's GLB moved by an offset; the model is then written whole
    const b = (await readJson(req)) as { path: string; faces: FaceSet[]; offset: [number, number, number]; textureSet: string };
    const path = mapModelGlb(b.path);
    if (!path || !Array.isArray(b.faces) || !Array.isArray(b.offset) || b.offset.length !== 3 || !b.offset.every(Number.isFinite)
        || !/^[a-z0-9_]+$/.test(b.textureSet ?? ""))
      return error(res, 400, "Name a map model, the faces, the offset and its texture set");
    const { glb, faces } = moveGlbFaces(readFileSync(project.abs(path)), b.faces, b.offset, b.textureSet);
    await markWritten(path, b.textureSet);
    await project.writeAtomic(path, glb);
    json(res, { ok: true, faces });
  },
  "POST /api/map-objects/save": async (req, res) => {
    // A chunk's faces saved as an object of the library (tools/paperwhite2/map_objects.py)
    const b = (await readJson(req)) as { name: string; category?: string; chunk: string; faces: FaceSet[]; anchor: number[]; size: number[] };
    if (!b.name?.trim() || !/^[a-z0-9_]+$/.test(b.chunk ?? "") || !Array.isArray(b.faces) || b.anchor?.length !== 3 || b.size?.length !== 2)
      return error(res, 400, "Name the object, its chunk, faces, anchor and size");
    const args = ["save", b.name.trim(), b.chunk, JSON.stringify(b.faces), b.anchor.join(","), b.size.join(",")];
    if (b.category?.trim()) args.push("--category", b.category.trim());
    const result = await runTool("tools/paperwhite2/map_objects.py", args);
    if (!result.ok) return error(res, 500, result.output || "Saving the object failed");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(result.output.split("\n").pop());
  },
  "DELETE /api/map-objects": (_req, res, url) => {
    // An object of the library deleted, its folder and all
    const id = url.searchParams.get("id") ?? "";
    const folder = join(ROOT, "res/paperwhite2/map_objects", id);
    if (!/^[a-z0-9_]+$/.test(id) || !existsSync(join(folder, "object.json"))) return error(res, 400, "No such object");
    rmSync(folder, { recursive: true });
    json(res, { removed: true });
  },
  "POST /api/map-maker/start": async (req, res) => {
    // A painted map of a chunk started, with a copy of the chunk (tools/paperwhite2/map_maker.py start)
    const b = (await readJson(req)) as { model: string; style: string; fill?: string; flat?: number };
    if (!/^[a-z0-9_]+$/.test(b.model ?? "") || !/^[a-z0-9_]+$/.test(b.style ?? "") || (b.fill !== undefined && !/^[a-z.]$/.test(b.fill)))
      return error(res, 400, "Name the chunk, the style and a terrain to fill with");
    // "auto": the style made for the chunk's texture set, learned from the atlas the first time (a couple of minutes)
    let style = b.style;
    if (style === "auto") {
      const found = await runTool("tools/paperwhite2/map_roundtrip.py", ["style", b.model]);
      if (!found.ok) return error(res, 500, found.output || "Learning the area's style failed");
      style = found.output.trim().split("\n").pop() ?? "";
    }
    const args = ["start", b.model, style, "--fill", b.fill ?? "."];
    if (typeof b.flat === "number" && Number.isFinite(b.flat)) args.push("--flat", String(b.flat));
    const result = await runTool("tools/paperwhite2/map_maker.py", args);
    if (!result.ok) return error(res, 500, result.output || "Starting failed");
    json(res, { path: result.output.trim() });
  },
  "POST /api/map-maker/from-reading": async (req, res) => {
    // A debug view: the chunk painted whole from its reading as it is now (map_roundtrip.py paint), its painting
    // started if it has none; the first time for an area learns its style from the atlas (a couple of minutes)
    const { model } = (await readJson(req)) as { model: string };
    if (!/^[a-z0-9_]+$/.test(model ?? "")) return error(res, 400, "Name the chunk");
    // The painting comes back to apply as an edit (undone with its generate); the project is started if there was none
    const result = await runTool("tools/paperwhite2/map_roundtrip.py", ["paint", model, "--print"]);
    if (!result.ok) return error(res, 500, result.output || "Painting from the reading failed");
    json(res, { painting: JSON.parse(result.output.trim().split("\n").pop() ?? "{}") });
  },
  "POST /api/map-maker/stop": async (req, res) => {
    // A chunk put back as it was before painting, its painting removed (map_maker.py stop)
    const { model } = (await readJson(req)) as { model: string };
    if (!/^[a-z0-9_]+$/.test(model ?? "")) return error(res, 400, "Name the chunk");
    const result = await runTool("tools/paperwhite2/map_maker.py", ["stop", model]);
    if (!result.ok) return error(res, 500, result.output || "Stopping failed");
    json(res, result);
  },
  "POST /api/map-maker/generate": async (req, res) => {
    // A painted map's chunk generated from its project (tools/paperwhite2/map_maker.py)
    const { model } = (await readJson(req)) as { model: string };
    const project = `res/paperwhite2/map_projects/${model}.json`;
    if (!/^[a-z0-9_]+$/.test(model ?? "") || !existsSync(join(ROOT, project))) return error(res, 400, "The chunk has no painted map");
    const result = await runTool("tools/paperwhite2/map_maker.py", ["generate", project]);
    if (!result.ok) return error(res, 500, result.output || "Generating failed");
    json(res, result);
  },
  "PUT /api/glb-raw": async (req, res) => {
    // A map model's GLB put back as it was, with its data.json (an edit may have marked it written), for undo
    const body = (await readJson(req)) as { path: string; data: string; meta?: string; files?: Record<string, string> };
    const path = mapModelGlb(body.path);
    if (!path || typeof body.data !== "string") return error(res, 400, "Name a map model's model.glb and its bytes");
    const glb = Buffer.from(body.data, "base64");
    if (glb.readUInt32LE(0) !== 0x46546c67) return error(res, 400, "Not a GLB");
    if (typeof body.meta === "string") {
      try { JSON.parse(body.meta); } catch { return error(res, 400, "The data.json isn't JSON"); }
      await project.writeAtomic(path.replace(/model\.glb$/, "data.json"), body.meta);
    }
    // The collision too, where a generated chunk's step put it back
    for (const [name, text] of Object.entries(body.files ?? {})) {
      if (!/^terrain_\d(_splits)?\.csv$/.test(name) || typeof text !== "string") return error(res, 400, `Not a collision file: ${name}`);
      await project.writeAtomic(path.replace(/model\.glb$/, name), text);
    }
    await project.writeAtomic(path, glb);
    json(res, { ok: true });
  },
  "POST /api/map-chunk/revert": async (req, res) => {
    // A map chunk's files put back as a revision has them: "vanilla" (the tag w2-original, the game as it shipped) or
    // "commit" (the last commit); the working tree's files only, never git's index. keepCollision leaves its
    // terrain_*.csv as they are
    const { model, to, keepCollision } = (await readJson(req)) as { model: string; to: string; keepCollision?: boolean };
    if (!/^[a-z0-9_]+$/.test(model ?? "") || (to !== "vanilla" && to !== "commit")) return error(res, 400, "Name the chunk, and vanilla or commit");
    const rev = to === "vanilla" ? "w2-original" : "HEAD";
    const folder = `res/field/maps/models/${model}`;
    const files = (await git.files(rev, folder)).filter((f) => !(keepCollision && /\/terrain_\d+(_splits)?\.csv$/.test(f)));
    if (!files.length) return error(res, 404, to === "vanilla" ? `${model} isn't in the original game (a new map's chunk)` : `${model} isn't committed yet`);
    for (const file of files) await project.writeAtomic(file, await git.show(rev, file));
    json(res, { files: files.map((f) => f.slice(folder.length + 1)) });
  },
  "GET /api/map-cost": async (_req, res, url) => {
    // What a chunk costs the DS: its model packed as the build packs it, its vertex commands and polygons
    // (tools/paperwhite2/map_cost.py)
    const model = url.searchParams.get("model") ?? "";
    if (!/^[a-z0-9_]+$/.test(model)) return error(res, 400, "Name the chunk");
    const result = await runTool("tools/paperwhite2/map_cost.py", [model]);
    if (!result.ok) return error(res, 500, result.output || "Counting failed");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(result.output);
  },
  "GET /api/map-reader": async (_req, res, url) => {
    // A chunk as the map reader reads it, tile by tile (tools/paperwhite2/map_reader.py read), as it is now or as the
    // original game has it
    const model = url.searchParams.get("model") ?? "", style = url.searchParams.get("style") ?? "";
    const original = url.searchParams.get("rev") === "original";
    if (!/^[a-z0-9_]+$/.test(model) || (style && !/^[a-z0-9_]+$/.test(style))) return error(res, 400, "Name the chunk (and the style)");
    const args = ["read", model, ...(style ? ["--style", style] : []), ...(original ? ["--rev", "w2-original"] : [])];
    const result = await runTool("tools/paperwhite2/map_reader.py", args);
    if (!result.ok) return error(res, 500, result.output || "Reading failed");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(result.output);
  },
  "GET /api/new-map/unused": async (_req, res) => {
    // The game's unused zones, which a new map can take (tools/paperwhite2/new_map.py)
    const result = await runTool("tools/paperwhite2/new_map.py", ["unused"]);
    if (!result.ok) return error(res, 500, result.output || "Listing the unused zones failed");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(result.output);
  },
  "POST /api/new-map/create": async (req, res) => {
    // An unused zone made a new map: renamed, a matrix of new chunks copied from a template (new_map.py create)
    const b = (await readJson(req)) as { zone: string; name: string; template: string; width?: number; height?: number;
      area?: string; mapType?: number; parent?: string; place?: string; copyProps?: boolean };
    const constant = /^[A-Z][A-Z0-9_]*$/;
    if (!constant.test(b.zone ?? "") || !/^[a-z][a-z0-9_]*$/.test(b.name ?? "") || !constant.test(b.template ?? ""))
      return error(res, 400, "Name an unused zone, the map (lower case letters, numbers and underscores) and a template chunk");
    const args = ["create", b.zone, b.name, "--template", b.template, "--width", String(b.width ?? 1), "--height", String(b.height ?? 1)];
    if (b.area && constant.test(b.area)) args.push("--area", b.area);
    if (Number.isInteger(b.mapType)) args.push("--map-type", String(b.mapType));
    if (b.parent && constant.test(b.parent)) args.push("--parent", b.parent);
    if (b.place && constant.test(b.place)) args.push("--place", b.place);
    if (b.copyProps) args.push("--copy-props");
    const result = await runTool("tools/paperwhite2/new_map.py", args);
    if (!result.ok) return error(res, 500, result.output || "Making the map failed");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(result.output.split("\n").pop());
  },
  "POST /api/new-map/route": async (req, res) => {
    // An unused zone made a route of the overworld, in the cells given (new_map.py route)
    const b = (await readJson(req)) as { zone: string; name: string; template: string; cells: [number, number][];
      filler?: string; area?: string; place?: string; copyProps?: boolean };
    const constant = /^[A-Z][A-Z0-9_]*$/;
    if (!constant.test(b.zone ?? "") || !/^[a-z][a-z0-9_]*$/.test(b.name ?? "") || !constant.test(b.template ?? "")
        || !Array.isArray(b.cells) || !b.cells.length || !b.cells.every((c) => Array.isArray(c) && c.length === 2 && c.every(Number.isInteger)))
      return error(res, 400, "Name an unused zone, the route, a template chunk and its cells");
    const args = ["route", b.zone, b.name, "--template", b.template, "--cells", ...b.cells.map(([c, r]) => `${c},${r}`)];
    if (b.filler && constant.test(b.filler)) args.push("--filler", b.filler);
    if (b.area && constant.test(b.area)) args.push("--area", b.area);
    if (b.place && constant.test(b.place)) args.push("--place", b.place);
    if (b.copyProps) args.push("--copy-props");
    const result = await runTool("tools/paperwhite2/new_map.py", args);
    if (!result.ok) return error(res, 500, result.output || "Making the route failed");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(result.output.split("\n").pop());
  },
  "GET /api/build": (_req, res) => json(res, builder.state),
  "POST /api/build": (_req, res) => json(res, { started: builder.start(settings.buildCommand) }),
  "POST /api/build/stop": (_req, res) => {
    builder.stop();
    json(res, { stopping: true });
  },
  "GET /api/git": async (_req, res) => json(res, await git.state()),
  "GET /api/git/diff": async (_req, res, url) => text(res, await git.diff(url.searchParams.get("path") ?? "")),
  // A file under res/ as the last commit or the original game's data has it (the Script Editor's restores): read only
  "GET /api/git/show": async (_req, res, url) => {
    const rev = url.searchParams.get("rev") ?? "";
    const path = project.checkPath(url.searchParams.get("path") ?? "");
    if (!["HEAD", "w2-original"].includes(rev) || !path) return error(res, 400, "A file under res/, at HEAD or w2-original");
    try {
      text(res, (await git.show(rev, path)).toString("utf8"));
    } catch {
      error(res, 404, `${path} isn't in ${rev}`);
    }
  },
  "POST /api/git/commit": async (req, res) => {
    if (!settings.commitEnabled) return error(res, 403, "Committing is turned off in settings.local.json");
    const { paths, message } = (await readJson(req)) as { paths: string[]; message: string };
    if (!paths?.length || !message?.trim()) return error(res, 400, "Choose files and write a message");
    json(res, { commit: await git.commit(paths, message.trim()) });
  },
  "POST /api/git/discard": async (req, res) => {
    // Changed files put back as the last commit has them, new ones removed: only files git lists as changed
    if (!settings.commitEnabled) return error(res, 403, "Committing is turned off in settings.local.json");
    const { paths } = (await readJson(req)) as { paths: string[] };
    const changed = new Set((await git.state()).changes.map((c) => c.path));
    if (!paths?.length || paths.some((p) => !changed.has(p))) return error(res, 400, "Choose changed files");
    // A painted map's project and its copy of the chunk (map_maker.py) go together: one without the other can't
    // generate
    const painting = (p: string) => /^res\/paperwhite2\/map_projects\/([a-z0-9_]+)(\.json|\.base\/)/.exec(p)?.[1];
    const models = new Set(paths.map(painting).filter(Boolean));
    const all = [...new Set([...paths, ...[...changed].filter((p) => models.has(painting(p)))])];
    await git.discard(all);
    send({ type: "git" });
    json(res, { discarded: all.length });
  },
  "GET /api/events": (req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`retry: 1000\ndata: ${JSON.stringify({ type: "hello", started })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => {
      clearInterval(ping);
      clients.delete(res);
    });
  },
};

// ---------------------------------------------------------------- Plumbing

function json(res: ServerResponse, value: unknown) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function text(res: ServerResponse, value: string) {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(value);
}

function error(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: message }));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

// A model or image under res/ by its own path (/res/field/maps/models/<model>/model.glb), so that a model's textures,
// which it names by relative paths, load beside it. It only reads, and only models and images
const RES_TYPES: Record<string, string> = { ".glb": "model/gltf-binary", ".png": "image/png" };
function serveResFile(res: ServerResponse, pathname: string) {
  const path = project.checkPath(decodeURIComponent(pathname).slice(1));
  const type = path ? RES_TYPES[extname(path)] : undefined;
  if (!path || !type || !existsSync(project.abs(path))) return error(res, 404, "No such model or image under res/");
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
  createReadStream(project.abs(path)).pipe(res);
}

/** Runs a tool of the checkout with the build's Python. */
/** Textures of other map texture sets added to sets (their imports.json, and a copy of each PNG beside theirs), each
 * given as <set>/<png>; those a set has already are left. */
async function importTextures(sets: string[], textures: string[]): Promise<{ added: string[] } | { error: string }> {
  const added: string[] = [];
  for (const set of sets) {
    const base = `res/field/maps/textures/${set}`;
    if (!existsSync(project.abs(base))) return { error: `No texture set ${set}` };
    const path = `${base}/imports.json`;
    const current = existsSync(project.abs(path)) ? JSON.parse(readFileSync(project.abs(path), "utf8")) as { textures: { texture: string; from: string }[] }
      : { textures: [] };
    for (const t of textures) {
      const [from, png] = t.split("/");
      const name = png.replace(/\.png$/i, "");
      if (from === set || existsSync(project.abs(`${base}/${png}`))) continue;
      if (!existsSync(project.abs(`res/field/maps/textures/${from}/${png}`))) return { error: `No ${t}` };
      current.textures.push({ texture: name, from: `MAP_TEXTURE_SET_${from.toUpperCase()}` });
      await project.writeAtomic(`${base}/${png}`, readFileSync(project.abs(`res/field/maps/textures/${from}/${png}`)));
      added.push(`${set}/${png}`);
    }
    if (current.textures.length) {
      await project.writeAtomic(path, fileText(parseJson(JSON.stringify({ $schema: "../texture_imports.schema.json", textures: current.textures }))));
    }
  }
  return { added };
}

function runTool(script: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((done) => {
    execFile(pythonFor(ROOT), [script, ...args], { cwd: ROOT, maxBuffer: 16 << 20 },
      (e, stdout, stderr) => done({ ok: !e, output: e ? `${stdout}${stderr}`.trim() : stdout.trim() }));
  });
}


/** Marks a map model's data.json written whole, with its texture set where it had none. */
async function markWritten(glbPath: string, textureSet: string) {
  const dataPath = glbPath.replace(/model\.glb$/, "data.json");
  let data = parseJson(readFileSync(project.abs(dataPath), "utf8"));
  const plain = data as Map<string, unknown>;
  if (plain.get("texture_set") === null) data = setIn(data, ["texture_set"], `MAP_TEXTURE_SET_${textureSet.toUpperCase()}`);
  if (plain.get("written") !== true) data = setIn(data, ["written"], true);
  if (data !== plain) await project.writeAtomic(dataPath, fileText(data));
}

/** A library object's model.glb under res/paperwhite2/map_objects/, or null. */
function libraryObjectGlb(path: string | undefined): string | null {
  const checked = project.checkPath(path ?? "");
  return checked && /^res\/paperwhite2\/map_objects\/[a-z0-9_]+\/model\.glb$/.test(checked) && existsSync(project.abs(checked)) ? checked : null;
}

/** A map model's model.glb under res/, or null. */
function mapModelGlb(path: string | undefined): string | null {
  const checked = project.checkPath(path ?? "");
  return checked && /^res\/field\/maps\/models\/[a-z0-9_]+\/model\.glb$/.test(checked) && existsSync(project.abs(checked)) ? checked : null;
}

function serveStatic(res: ServerResponse, pathname: string) {
  let file = join(DIST, decodeURIComponent(pathname));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  if (!existsSync(file)) return error(res, 404, "The page isn't built yet: run `npm start`, not the server alone");
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    "Cache-Control": file.endsWith("index.html") ? "no-cache" : "max-age=31536000, immutable",
  });
  createReadStream(file).pipe(res);
}

const port = settings.port;
const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `localhost:${port + 1}`, `127.0.0.1:${port + 1}`]);

createServer(async (req, res) => {
  // Only pages from this computer, under this address: guards against another site reaching the API.
  if (!allowedHosts.has(req.headers.host ?? "")) return error(res, 403, "Open the editor at its own address");
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const method = req.method ?? "GET";
  if (method !== "GET" && req.headers[WRITE_HEADER.toLowerCase()] !== "1") return error(res, 403, "Missing editor header");
  const route = routes[`${method} ${url.pathname}`];
  try {
    if (route) await route(req, res, url);
    else if (method === "GET" && url.pathname.startsWith("/res/")) serveResFile(res, url.pathname);
    else if (url.pathname.startsWith("/api/")) error(res, 404, "No such request");
    else serveStatic(res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) error(res, 500, (e as Error).message);
  }
}).on("error", (e: NodeJS.ErrnoException) => {
  if (e.code !== "EADDRINUSE") throw e;
  console.error(`Port ${port} is in use: the editor is probably running already (open http://localhost:${port}).`);
  console.error("Otherwise choose another port in editor/settings.local.json.");
  process.exit(1);
}).listen(port, "127.0.0.1", () => {
  console.log(`Paper White 2 editor: ${DEV ? `http://localhost:${port + 1} (dev)` : `http://localhost:${port}`}`);
  console.log(`Project: ${ROOT}; ${project.types().length} kinds of data found in res/`);
});

process.on("SIGINT", () => {
  python.stop();
  builder.stop();
  process.exit(0);
});
