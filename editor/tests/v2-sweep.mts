// One-off (npx tsx tests/v2-sweep.mts): every side's flat rig converted to the Rig Editor's second version's source,
// written as the file's text and read back, passes both validators (the editor's here, the build's through
// server/python/validate.py) and bakes back to its flat rig byte for byte, without warnings. Prints how many sources
// needed each originals-only field. Reads res/, writes temporary files only.
import { execFileSync } from "node:child_process";
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectLayout, fileText, fromPlain, getIn, parseJson, type Layout } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { dataOf, rigOf } from "../src/modules/rig/model.ts";
import { bakeV2, convertToV2, type V2 } from "../src/modules/rig/v2.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const SCHEMA = join(ROOT, "res/pokemon/battle_sprite_rig_v2.schema.json");
const schema = JSON.parse(readFileSync(SCHEMA, "utf8")) as Schema;
const COMPACT: Layout = { width: 120, indent: 2, compact: true };
const files = globSync("res/pokemon/**/*_rig.json", { cwd: ROOT }).filter((f) => !f.includes("/musical/"));
const dir = mkdtempSync(join(tmpdir(), "rig-v2-"));
const stats: Record<string, number> = {};
const count = (what: string, n = 1) => { stats[what] = (stats[what] ?? 0) + n; };
let bad = 0, n = 0;
const t0 = Date.now();
const lines: string[] = [];
for (const file of files) {
  const text = readFileSync(join(ROOT, file), "utf8");
  const data = parseJson(text);
  const layout = detectLayout(text, data)!;
  const rig = rigOf(data);
  const sourceText = fileText(fromPlain({ $schema: "../battle_sprite_rig_v2.schema.json", ...convertToV2(rig) }), COMPACT);
  const sourceData = parseJson(sourceText);
  const errors = validate(sourceData, schema, new Map());
  const source = rigOf(sourceData) as unknown as V2;
  const out = bakeV2(source);
  const again = fileText(dataOf(out.rig, getIn(data, ["$schema"])), layout);
  n++;
  const temp = join(dir, `${n}.json`);
  writeFileSync(temp, sourceText);
  lines.push(`${temp}\t${SCHEMA}`);
  count("tracks", rig.tracks.length);
  count("bones", source.bones.length);
  count("source bytes", sourceText.length);
  count("flat bytes", text.length);
  for (const field of ["track_order", "kept_tracks", "idle_nodes", "kept", "strips"]) if (source[field] !== undefined) count(`sides with ${field}`);
  if (source.keeps_moving.length) count("sides with keeps_moving");
  for (const seq of source.sequences) {
    if (seq.layers) count("sequences with their own layers");
    for (const l of seq.layers ?? []) {
      if (l.track_of) count("layers with track_of");
      if (l.head) count("layers with their own head");
    }
    for (const lane of seq.parts) {
      if (lane.name) count("parts with their own track name");
      if (lane.frames !== undefined) count("parts with their own loop");
    }
  }
  if (again !== text || out.warnings.length || errors.length) {
    bad++;
    if (bad < 6) {
      const a = text.split("\n"), b = again.split("\n");
      const i = a.findIndex((l, k) => l !== b[k]);
      console.log(file, errors.slice(0, 2), out.warnings.slice(0, 2), i, a[i], "|", b[i]);
    }
  }
}
const python = execFileSync("python3", ["-I", join(ROOT, "editor/server/python/validate.py")], { cwd: ROOT, input: lines.join("\n") + "\n", maxBuffer: 64 << 20 })
  .toString().trim().split("\n").map((l) => JSON.parse(l) as { ok: boolean; error?: string });
const refused = python.filter((r) => !r.ok);
rmSync(dir, { recursive: true, force: true });
console.log(`${n} sides, ${bad} differ, ${refused.length} refused by the build's validator${refused.length ? `: ${refused[0].error}` : ""}, ${Date.now() - t0} ms`);
console.log(stats);
