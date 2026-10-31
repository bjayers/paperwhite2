// The editor's server: serves the page and an API over the checkout this folder sits in. It listens on this computer
// only. Start it with `npm start` in editor/ (or ./start.sh), then open the address it prints in Edge.

import { createReadStream, existsSync, globSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { parseJson, JsonSyntaxError } from "../shared/json.ts";
import { WRITE_HEADER, type DataFile, type ProjectInfo, type SaveRequest, type SaveResult, type ServerEvent } from "../shared/api.ts";
import { Builder } from "./build.ts";
import { Git } from "./git.ts";
import { Project, versionOf } from "./project.ts";
import { Python } from "./python.ts";
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
    if (!/^(res|src)\//.test(glob) || glob.includes("..")) return error(res, 400, "Scan files under res/ or src/ only");
    const found: { path: string; line: number; text: string }[] = [];
    for (const path of globSync(glob, { cwd: ROOT })) {
      const lines = readFileSync(project.abs(path), "utf8").split("\n");
      lines.forEach((text, i) => {
        if (pattern.test(text)) found.push({ path, line: i + 1, text });
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
    if (schema && !existsSync(project.abs(schema)))
      return json(res, { ok: false, reason: "invalid", message: `Its schema ${schema} doesn't exist` } satisfies SaveResult);
    let invalid: string | null = null;
    try {
      // The build's own check runs on the new text before it replaces the file.
      await project.writeAtomic(path, body.text, async (temp) => {
        if (!schema) return;
        const checked = await python.validate(temp, project.abs(schema));
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
  // Removes a data file that a specialty editor no longer needs: only a species' encounter file (one taken out of
  // the wild), so nothing else can be removed from here
  "DELETE /api/file": (_req, res, url) => {
    const path = project.checkPath(url.searchParams.get("path") ?? "");
    if (!path || !/^res\/paperwhite2\/encounters\/species\/[a-z0-9_]+\.json$/.test(path)) return error(res, 403, "Not a file that can be removed");
    if (existsSync(project.abs(path))) rmSync(project.abs(path));
    json(res, { removed: true });
  },
  "GET /api/build": (_req, res) => json(res, builder.state),
  "POST /api/build": (_req, res) => json(res, { started: builder.start(settings.buildCommand) }),
  "POST /api/build/stop": (_req, res) => {
    builder.stop();
    json(res, { stopping: true });
  },
  "GET /api/git": async (_req, res) => json(res, await git.state()),
  "GET /api/git/diff": async (_req, res, url) => text(res, await git.diff(url.searchParams.get("path") ?? "")),
  "POST /api/git/commit": async (req, res) => {
    if (!settings.commitEnabled) return error(res, 403, "Committing is turned off in settings.local.json");
    const { paths, message } = (await readJson(req)) as { paths: string[]; message: string };
    if (!paths?.length || !message?.trim()) return error(res, 400, "Choose files and write a message");
    json(res, { commit: await git.commit(paths, message.trim()) });
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
